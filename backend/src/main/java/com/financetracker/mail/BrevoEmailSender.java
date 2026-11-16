package com.financetracker.mail;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import tools.jackson.databind.json.JsonMapper;

// Brevo's transactional email HTTP API. Render's free plan blocks outbound SMTP ports,
// so email has to go over HTTPS. Uses the JDK's HttpClient: no extra dependency.
public class BrevoEmailSender implements EmailSender {

    private static final URI ENDPOINT = URI.create("https://api.brevo.com/v3/smtp/email");

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final JsonMapper jsonMapper;
    private final String apiKey;
    private final String fromAddress;
    private final String fromName;

    public BrevoEmailSender(JsonMapper jsonMapper, String apiKey, String fromAddress, String fromName) {
        this.jsonMapper = jsonMapper;
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;
        this.fromName = fromName;
    }

    @Override
    public void send(Email email) {
        String body = jsonMapper.writeValueAsString(Map.of(
                "sender", Map.of("name", fromName, "email", fromAddress),
                "to", List.of(Map.of("email", email.to())),
                "subject", email.subject(),
                "textContent", email.text(),
                "htmlContent", email.html()));

        HttpRequest request = HttpRequest.newBuilder(ENDPOINT)
                .timeout(Duration.ofSeconds(15))
                .header("api-key", apiKey)
                .header("content-type", "application/json")
                .header("accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<Void> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (IOException e) {
            throw new EmailException("Email provider unreachable", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EmailException("Interrupted while sending email", e);
        }
        // Only the status is reported: the response body can echo the recipient address.
        if (response.statusCode() / 100 != 2) {
            throw new EmailException("Email provider returned HTTP " + response.statusCode());
        }
    }
}
