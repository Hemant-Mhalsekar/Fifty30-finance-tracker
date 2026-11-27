package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.financetracker.cycle.BudgetSplit;
import com.financetracker.notification.PushMessage;
import com.financetracker.notification.PushSender;
import com.financetracker.notification.PushTarget;
import com.financetracker.notification.Reminders;
import com.financetracker.notification.WebPushCrypto;

// Reminders at chosen moments (the real timer is off in tests), against a capturing push sender.
class ReminderIntegrationTest extends AbstractIntegrationTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    @TestConfiguration
    static class CapturingPush {
        @Bean
        @Primary
        CapturingPushSender reminderPushSender() {
            return new CapturingPushSender();
        }
    }

    static class CapturingPushSender implements PushSender {
        record Sent(String endpoint, PushMessage message) {
        }

        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public Delivery send(PushTarget target, PushMessage message) {
            sent.add(new Sent(target.endpoint(), message));
            return Delivery.DELIVERED;
        }

        @Override
        public Optional<String> publicKey() {
            return Optional.of("BTestPublicKey");
        }
    }

    @Autowired
    private CapturingPushSender push;

    @Autowired
    private Reminders reminders;

    @Autowired
    private Clock clock;

    @BeforeEach
    void clear() {
        push.sent.clear();
    }

    @Test
    void recurringPaymentDueTodayIsSentOnceFromNineOClock() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token);
        String phone = subscribe(token);
        LocalDate today = LocalDate.now(clock);
        UUID rent = findCategoryIdByName(token, "Rent");
        mockMvc.perform(post("/api/recurring-expenses").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryId\":\"" + rent + "\",\"amountPaise\":1500000,\"description\":\"House rent\","
                                + "\"dayOfMonth\":" + today.getDayOfMonth() + "}"))
                .andExpect(status().isCreated());

        reminders.runDue(at(today, 8, 50));
        assertEquals(List.of(), to(phone));

        reminders.runDue(at(today, 9, 5));
        List<PushMessage> sent = to(phone);
        assertEquals(1, sent.size());
        assertEquals("House rent is due today", sent.getFirst().title());
        assertTrue(sent.getFirst().body().startsWith("₹15,000."), sent.getFirst().body());
        assertEquals("/recurring", sent.getFirst().url());

        // Later runs the same day (or after a restart) send nothing more.
        reminders.runDue(at(today, 9, 15));
        reminders.runDue(at(today, 13, 0));
        assertEquals(1, to(phone).size());
    }

    @Test
    void eveningReminderOnlyWhenNothingWasLoggedToday() throws Exception {
        LocalDate today = LocalDate.now(clock);
        String quiet = registerUserAndGetToken();
        onboardUser(quiet);
        String quietPhone = subscribe(quiet);
        String busy = registerUserAndGetToken();
        onboardUser(busy);
        String busyPhone = subscribe(busy);
        UUID dining = findCategoryIdByName(busy, "Dining");
        mockMvc.perform(post("/api/expenses").header(HttpHeaders.AUTHORIZATION, bearer(busy))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":2000,\"categoryId\":\"" + dining + "\",\"description\":\"Chai\"}"))
                .andExpect(status().isCreated());

        // On a Sunday the weekly summary goes out too, so only the evening reminders are counted.
        reminders.runDue(at(today, 20, 55));
        assertEquals(0, evening(quietPhone));

        reminders.runDue(at(today, 21, 5));
        assertEquals(1, evening(quietPhone));
        assertEquals(0, evening(busyPhone));

        // Switched off: nothing, even on a day with nothing logged.
        String off = registerUserAndGetToken();
        onboardUser(off);
        String offPhone = subscribe(off);
        mockMvc.perform(put("/api/notifications/settings").header(HttpHeaders.AUTHORIZATION, bearer(off))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recurringDue\":true,\"eveningReminder\":false,\"budgetAlerts\":true,"
                                + "\"cycleSummary\":true}"))
                .andExpect(status().isOk());
        reminders.runDue(at(today, 21, 15));
        assertEquals(0, evening(offPhone));
        assertEquals(1, evening(quietPhone));
        // Too late at night for anyone.
        assertEquals(0, reminders.runDue(at(today, 23, 45)));
    }

    @Test
    void sundaySummaryOfTheWeekThatIsEnding() throws Exception {
        LocalDate sunday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
        String token = registerUserAndGetToken();
        onboardUser(token);
        String phone = subscribe(token);
        UUID groceries = findCategoryIdByName(token, "Groceries");
        mockMvc.perform(post("/api/expenses").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":425000,\"categoryId\":\"" + groceries
                                + "\",\"description\":\"Big shop\",\"expenseDate\":\"" + sunday + "\"}"))
                .andExpect(status().isCreated());

        reminders.runDue(at(sunday, 18, 30));
        assertEquals(List.of(), titles(phone));
        reminders.runDue(at(sunday, 19, 30));
        List<PushMessage> sent = to(phone);
        assertEquals(1, sent.size());
        assertEquals("Your week", sent.getFirst().title());
        assertTrue(sent.getFirst().body().startsWith("₹4,250 on needs and wants across 1 expense."),
                sent.getFirst().body());
    }

    @Test
    void newCycleOnPayDayButNotForTheVeryFirstCycle() throws Exception {
        LocalDate today = LocalDate.now(clock);
        String first = registerUserAndGetToken();
        onboardUser(first, 5_000_000L, today.getDayOfMonth());
        String firstPhone = subscribe(first);
        String returning = registerUserAndGetToken();
        onboardUser(returning, 5_000_000L, today.getDayOfMonth());
        String returningPhone = subscribe(returning);
        BudgetSplit split = BudgetSplit.of(5_000_000L);
        jdbcTemplate.update("""
                INSERT INTO cycles (user_id, period_start, period_end, salary_paise, needs_paise, wants_paise, savings_paise)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, userId(returning), today.minusMonths(1), today.minusDays(1), 5_000_000L,
                split.needsPaise(), split.wantsPaise(), split.savingsPaise());

        reminders.runDue(at(today, 9, 30));
        assertEquals(List.of(), to(firstPhone));
        List<PushMessage> sent = to(returningPhone);
        assertEquals(1, sent.size());
        assertEquals("A new pay cycle starts today", sent.getFirst().title());
        assertEquals("₹25,000 for needs, ₹15,000 for wants and ₹10,000 to save. Did your salary change?",
                sent.getFirst().body());
    }

    @Test
    void budgetAlertWhenAnExpenseCrossesEightyAndOneHundredPercent() throws Exception {
        String token = registerUserAndGetToken();
        // ₹10,000 salary: needs plan ₹5,000.
        onboardUser(token, 1_000_000L, LocalDate.now(clock).getDayOfMonth());
        String phone = subscribe(token);
        UUID rent = findCategoryIdByName(token, "Rent");

        logNeed(token, rent, 410_000);
        waitFor(phone, 1);
        assertEquals("Needs at 82% of the plan", to(phone).getFirst().title());
        assertTrue(to(phone).getFirst().url().startsWith("/expenses?type=NEED&from="));

        logNeed(token, rent, 100_000);
        waitFor(phone, 2);
        assertEquals("Needs are over plan", to(phone).get(1).title());
        assertTrue(to(phone).get(1).body().startsWith("₹100 more than planned"), to(phone).get(1).body());

        // Already past both lines this cycle: no more alerts.
        logNeed(token, rent, 1_000);
        Thread.sleep(1_000);
        assertEquals(2, to(phone).size());
    }

    // ---- helpers ----

    private static ZonedDateTime at(LocalDate date, int hour, int minute) {
        return date.atTime(hour, minute).atZone(INDIA);
    }

    private List<PushMessage> to(String endpoint) {
        return push.sent.stream().filter(s -> s.endpoint().equals(endpoint)).map(CapturingPushSender.Sent::message)
                .toList();
    }

    private long evening(String endpoint) {
        return titles(endpoint).stream().filter("Log today's spending?"::equals).count();
    }

    private List<String> titles(String endpoint) {
        return to(endpoint).stream().map(PushMessage::title).toList();
    }

    private String subscribe(String token) throws Exception {
        String endpoint = "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();
        String key = WebPushCrypto.base64Url(WebPushCrypto.encode((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        mockMvc.perform(post("/api/notifications/subscribe").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                                + WebPushCrypto.base64Url(new byte[16]) + "\"}}"))
                .andExpect(status().isNoContent());
        return endpoint;
    }

    private void logNeed(String token, UUID category, long paise) throws Exception {
        mockMvc.perform(post("/api/expenses").header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":" + paise + ",\"categoryId\":\"" + category + "\",\"description\":\"Rent\"}"))
                .andExpect(status().isCreated());
    }

    // Budget alerts go out on a background thread after the expense is saved.
    private void waitFor(String endpoint, int count) throws InterruptedException {
        for (int i = 0; i < 100 && to(endpoint).size() < count; i++) {
            Thread.sleep(50);
        }
        assertEquals(count, to(endpoint).size());
    }

    private UUID userId(String token) throws Exception {
        return UUID.fromString(jsonMapper.readTree(mockMvc.perform(get("/api/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(token))).andReturn().getResponse().getContentAsString())
                .get("id").asText());
    }
}
