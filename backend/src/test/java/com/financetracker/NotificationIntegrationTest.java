package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPair;
import java.security.interfaces.ECPublicKey;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.financetracker.notification.PushMessage;
import com.financetracker.notification.PushSender;
import com.financetracker.notification.PushTarget;
import com.financetracker.notification.WebPushCrypto;

class NotificationIntegrationTest extends AbstractIntegrationTest {

    private static final String FCM = "https://fcm.googleapis.com/fcm/send/";

    // Stands in for the push services: records what would be sent, answers as told.
    @TestConfiguration
    static class CapturingPush {
        @Bean
        @Primary
        CapturingPushSender capturingPushSender() {
            return new CapturingPushSender();
        }
    }

    static class CapturingPushSender implements PushSender {
        record Sent(String endpoint, PushMessage message) {
        }

        final List<Sent> sent = new CopyOnWriteArrayList<>();
        final Map<String, Delivery> answers = new ConcurrentHashMap<>();

        @Override
        public Delivery send(PushTarget target, PushMessage message) {
            sent.add(new Sent(target.endpoint(), message));
            return answers.getOrDefault(target.endpoint(), Delivery.DELIVERED);
        }

        @Override
        public Optional<String> publicKey() {
            return Optional.of("BTestPublicKey");
        }
    }

    @Autowired
    private CapturingPushSender push;

    @BeforeEach
    void clear() {
        push.sent.clear();
        push.answers.clear();
    }

    @Test
    void subscribeAcceptsOnlyRealPushServicesAndValidKeys() throws Exception {
        String token = registerUserAndGetToken();
        mockMvc.perform(get("/api/notifications/key").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.publicKey").value("BTestPublicKey"));
        mockMvc.perform(post("/api/notifications/subscribe").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());

        String keys = browserKeys();
        expect(subscribe(token, "{\"keys\":" + keys + "}"), 400, "Endpoint is required");
        // The server POSTs to the endpoint, so anything but a known push service is refused.
        for (String endpoint : new String[] {"http://fcm.googleapis.com/fcm/send/x", "https://169.254.169.254/latest",
                "https://localhost/push", "https://fcm.googleapis.com.evil.example/x", "https://user@fcm.googleapis.com/x",
                "https://fcm.googleapis.com:8443/x", "not a url"}) {
            expect(subscribe(token, body(endpoint, keys)), 400, "This push service is not supported");
        }
        expect(subscribe(token, body(FCM + "a", "{\"p256dh\":\"abc\",\"auth\":\"abc\"}")), 400,
                "Invalid subscription keys");
        expect(subscribe(token, body(FCM + "a", "{\"p256dh\":\"" + publicKey() + "\",\"auth\":\"AAAA\"}")), 400,
                "Invalid subscription keys");
        expect(subscribe(token, "{\"endpoint\":\"" + FCM + "a\"}"), 400, "Invalid subscription keys");

        subscribe(token, body(FCM + "a", keys)).andExpect(status().isNoContent());
        subscribe(token, body("https://wns2-pn1p.notify.windows.com/w/?token=x", keys)).andExpect(status().isNoContent());
        assertEquals(2, devices(token));
    }

    @Test
    void aSharedBrowserMovesToWhoeverSubscribedLastAndUnsubscribeOnlyTouchesYourOwn() throws Exception {
        String alice = registerUserAndGetToken();
        String bob = registerUserAndGetToken();
        String endpoint = FCM + UUID.randomUUID();

        subscribe(alice, body(endpoint, browserKeys())).andExpect(status().isNoContent());
        subscribe(bob, body(endpoint, browserKeys())).andExpect(status().isNoContent());
        assertEquals(0, devices(alice));
        assertEquals(1, devices(bob));

        // Alice cannot switch off Bob's phone; an unknown endpoint is simply already off.
        unsubscribe(alice, endpoint).andExpect(status().isNoContent());
        assertEquals(1, devices(bob));
        unsubscribe(bob, endpoint).andExpect(status().isNoContent());
        assertEquals(0, devices(bob));
        expect(unsubscribe(bob, " "), 400, "Endpoint is required");
    }

    @Test
    void keepsTheTenNewestDevices() throws Exception {
        String token = registerUserAndGetToken();
        for (int i = 0; i < 12; i++) {
            subscribe(token, body(FCM + "device-" + i + "-" + UUID.randomUUID(), browserKeys()))
                    .andExpect(status().isNoContent());
        }
        assertEquals(10, devices(token));
    }

    @Test
    void testPushGoesToEveryDeviceAndForgetsOnesThatAreGone() throws Exception {
        String token = registerUserAndGetToken();
        expect(mockMvc.perform(post("/api/notifications/test").header(HttpHeaders.AUTHORIZATION, bearer(token))), 409,
                "Turn on notifications on a device first");

        String phone = FCM + UUID.randomUUID();
        String oldLaptop = FCM + UUID.randomUUID();
        subscribe(token, body(phone, browserKeys())).andExpect(status().isNoContent());
        subscribe(token, body(oldLaptop, browserKeys())).andExpect(status().isNoContent());
        push.answers.put(oldLaptop, PushSender.Delivery.GONE);

        mockMvc.perform(post("/api/notifications/test").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.devices").value(2))
                .andExpect(jsonPath("$.delivered").value(1));
        assertEquals(2, push.sent.size());
        assertEquals("Notifications are on", push.sent.getFirst().message().title());
        assertEquals("/settings", push.sent.getFirst().message().url());
        // The push service said the laptop's subscription is gone, so it is no longer stored.
        assertEquals(1, devices(token));
    }

    @Test
    void settingsStartAllOnAndSaveAllFour() throws Exception {
        String token = registerUserAndGetToken();
        mockMvc.perform(get("/api/notifications/settings").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recurringDue").value(true))
                .andExpect(jsonPath("$.eveningReminder").value(true))
                .andExpect(jsonPath("$.budgetAlerts").value(true))
                .andExpect(jsonPath("$.cycleSummary").value(true));

        expect(putSettings(token, "{\"recurringDue\":false}"), 400, "All four settings are required");
        putSettings(token, "{\"recurringDue\":false,\"eveningReminder\":true,\"budgetAlerts\":false,\"cycleSummary\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recurringDue").value(false));
        mockMvc.perform(get("/api/notifications/settings").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$.recurringDue").value(false))
                .andExpect(jsonPath("$.eveningReminder").value(true))
                .andExpect(jsonPath("$.budgetAlerts").value(false))
                .andExpect(jsonPath("$.cycleSummary").value(true));
    }

    // ---- helpers ----

    private ResultActions subscribe(String token, String content) throws Exception {
        return mockMvc.perform(post("/api/notifications/subscribe")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(content));
    }

    private ResultActions unsubscribe(String token, String endpoint) throws Exception {
        return mockMvc.perform(post("/api/notifications/unsubscribe")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"" + endpoint + "\"}"));
    }

    private ResultActions putSettings(String token, String content) throws Exception {
        return mockMvc.perform(put("/api/notifications/settings")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(content));
    }

    private static void expect(ResultActions result, int status, String message) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.message").value(message));
    }

    private static String body(String endpoint, String keys) {
        return "{\"endpoint\":\"" + endpoint + "\",\"expirationTime\":null,\"keys\":" + keys + "}";
    }

    // What a browser sends: its own P-256 public key and a 16-byte secret.
    private static String browserKeys() {
        return "{\"p256dh\":\"" + publicKey() + "\",\"auth\":\"" + WebPushCrypto.base64Url(new byte[16]) + "\"}";
    }

    private static String publicKey() {
        KeyPair pair = WebPushCrypto.newKeyPair();
        return WebPushCrypto.base64Url(WebPushCrypto.encode((ECPublicKey) pair.getPublic()));
    }

    private int devices(String token) throws Exception {
        String subject = jsonMapper.readTree(mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM push_subscriptions WHERE user_id = ?",
                Integer.class, UUID.fromString(subject));
        return count == null ? 0 : count;
    }
}
