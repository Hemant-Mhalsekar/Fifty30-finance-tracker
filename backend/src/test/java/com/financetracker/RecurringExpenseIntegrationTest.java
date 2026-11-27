package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import com.financetracker.recurring.MonthlySchedule;
import com.financetracker.recurring.Schedule;

import tools.jackson.databind.JsonNode;

class RecurringExpenseIntegrationTest extends AbstractIntegrationTest {

    private static final String BASE = "/api/recurring-expenses";

    @Autowired
    private Clock clock;

    @Test
    void requiresAuthAndValidatesInput() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());

        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        UUID other = findCategoryIdByName(token, "Other");

        expectBadRequest(token, body(rent, null, 0L, "Rent", 5), "Amount must be between ₹0.01 and ₹10,00,00,000");
        expectBadRequest(token, body(rent, null, 100L, "  ", 5), "Description is required");
        expectBadRequest(token, body(rent, null, 100L, "Rent", 0), "Day of month must be between 1 and 31");
        expectBadRequest(token, body(rent, null, 100L, "Rent", 32), "Day of month must be between 1 and 31");
        expectBadRequest(token, body(rent, "NEED", 100L, "Rent", 5),
                "Type can only be set for categories without a fixed type");
        expectBadRequest(token, body(other, null, 100L, "Gift", 5), "Type is required for this category");

        mockMvc.perform(get(BASE).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void createStartsAtTheNextOccurrenceAndListsDueFirst() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        UUID other = findCategoryIdByName(token, "Other");
        LocalDate today = LocalDate.now(clock);

        // Today's day of month is due straight away; tomorrow's is not.
        JsonNode dueToday = create(token, body(rent, null, 1_500_000L, "  House rent ", today.getDayOfMonth()));
        assertEquals(today.toString(), dueToday.get("nextDueDate").asText());
        assertEquals(true, dueToday.get("due").asBoolean());
        assertEquals("House rent", dueToday.get("description").asText());
        assertEquals(true, dueToday.get("type").isNull());

        LocalDate tomorrow = today.plusDays(1);
        JsonNode later = create(token, body(other, "INVESTMENT", 500_000L, "SIP", tomorrow.getDayOfMonth()));
        assertEquals(MonthlySchedule.firstOnOrAfter(today, tomorrow.getDayOfMonth()).toString(),
                later.get("nextDueDate").asText());
        assertEquals(false, later.get("due").asBoolean());
        assertEquals("INVESTMENT", later.get("type").asText());

        mockMvc.perform(get(BASE).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].description").value("House rent"))
                .andExpect(jsonPath("$[1].description").value("SIP"));
    }

    @Test
    void confirmLogsTheExpenseOnceAndSkipMovesOnWithoutLogging() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID userId = userId(token);
        UUID other = findCategoryIdByName(token, "Other");
        LocalDate today = LocalDate.now(clock);
        YearMonth thisMonth = YearMonth.from(today);

        // Day 1 two months ago: three occurrences are waiting (two months ago, last month, this month).
        UUID id = id(create(token, body(other, "NEED", 250_000L, "Maid", 1)));
        LocalDate first = MonthlySchedule.occurrenceIn(thisMonth.minusMonths(2), 1);
        setNextDue(id, first);

        // Confirm with a changed amount; the date defaults to the due date and the type comes from the rule.
        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + first + "\",\"amountPaise\":260000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.expense.amountPaise").value(260_000L))
                .andExpect(jsonPath("$.expense.expenseDate").value(first.toString()))
                .andExpect(jsonPath("$.expense.type").value("NEED"))
                .andExpect(jsonPath("$.expense.description").value("Maid"))
                .andExpect(jsonPath("$.recurring.nextDueDate")
                        .value(MonthlySchedule.occurrenceIn(thisMonth.minusMonths(1), 1).toString()))
                .andExpect(jsonPath("$.recurring.due").value(true))
                // The usual amount does not change.
                .andExpect(jsonPath("$.recurring.amountPaise").value(250_000L));

        // The same occurrence again (a double tap or a second device) is refused and adds nothing.
        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + first + "\",\"amountPaise\":260000}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This payment was already handled"));
        assertEquals(1, expenseCount(userId));

        // Skip last month: nothing logged, moves to this month.
        LocalDate lastMonth = MonthlySchedule.occurrenceIn(thisMonth.minusMonths(1), 1);
        mockMvc.perform(post(BASE + "/" + id + "/skip")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + lastMonth + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextDueDate").value(thisMonth.atDay(1).toString()))
                .andExpect(jsonPath("$.due").value(true));
        assertEquals(1, expenseCount(userId));

        // Confirm this month on a different date (paid a few days late, never in the future).
        LocalDate paidOn = today;
        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + thisMonth.atDay(1) + "\",\"amountPaise\":250000,"
                                + "\"expenseDate\":\"" + paidOn + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.expense.expenseDate").value(paidOn.toString()))
                .andExpect(jsonPath("$.recurring.nextDueDate").value(thisMonth.plusMonths(1).atDay(1).toString()))
                .andExpect(jsonPath("$.recurring.due").value(false));
        assertEquals(2, expenseCount(userId));

        // Next month is not due yet.
        mockMvc.perform(post(BASE + "/" + id + "/skip")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + thisMonth.plusMonths(1).atDay(1) + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This payment is not due yet"));
    }

    @Test
    void concurrentConfirmsOfTheSameOccurrenceAddOneExpense() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID userId = userId(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        LocalDate today = LocalDate.now(clock);
        UUID id = id(create(token, body(rent, null, 1_000_000L, "Rent", today.getDayOfMonth())));
        String content = "{\"dueDate\":\"" + today + "\",\"amountPaise\":1000000}";

        int threads = 4;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                Callable<Integer> call = () -> {
                    start.await();
                    return mockMvc.perform(post(BASE + "/" + id + "/confirm")
                                    .header(HttpHeaders.AUTHORIZATION, bearer(token))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(content))
                            .andReturn().getResponse().getStatus();
                };
                results.add(pool.submit(call));
            }
            start.countDown();
            int created = 0;
            int conflicts = 0;
            for (Future<Integer> result : results) {
                int code = result.get();
                if (code == 201) {
                    created++;
                } else if (code == 409) {
                    conflicts++;
                }
            }
            assertEquals(1, created);
            assertEquals(threads - 1, conflicts);
        } finally {
            pool.shutdownNow();
        }
        assertEquals(1, expenseCount(userId));
    }

    @Test
    void pauseHidesItAndResumeSkipsMonthsThatPassedWhilePaused() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        LocalDate today = LocalDate.now(clock);
        UUID id = id(create(token, body(rent, null, 1_000_000L, "Rent", 1)));
        LocalDate twoMonthsAgo = MonthlySchedule.occurrenceIn(YearMonth.from(today).minusMonths(2), 1);
        setNextDue(id, twoMonthsAgo);

        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update(rent, 1_000_000L, "Rent", 1, true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paused").value(true))
                .andExpect(jsonPath("$.due").value(false))
                .andExpect(jsonPath("$.nextDueDate").value(twoMonthsAgo.toString()));

        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + twoMonthsAgo + "\",\"amountPaise\":1000000}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This recurring expense is paused"));

        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update(rent, 1_000_000L, "Rent", 1, false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paused").value(false))
                .andExpect(jsonPath("$.nextDueDate").value(MonthlySchedule.firstOnOrAfter(today, 1).toString()));
    }

    @Test
    void changingTheDayKeepsTheWaitingMonth() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        LocalDate today = LocalDate.now(clock);
        YearMonth lastMonth = YearMonth.from(today).minusMonths(1);
        UUID id = id(create(token, body(rent, null, 1_000_000L, "Rent", 5)));
        setNextDue(id, lastMonth.atDay(5));

        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update(rent, 1_200_000L, "New flat", 31, false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dayOfMonth").value(31))
                .andExpect(jsonPath("$.amountPaise").value(1_200_000L))
                .andExpect(jsonPath("$.description").value("New flat"))
                .andExpect(jsonPath("$.nextDueDate").value(lastMonth.atEndOfMonth().toString()))
                .andExpect(jsonPath("$.due").value(true));
    }

    @Test
    void categoriesInUseCannotBeDeletedAndArchivedOnesCannotBeConfirmed() throws Exception {
        String token = registerUserAndGetToken();
        // Default categories are created at onboarding.
        onboardUser(token);
        UUID userId = userId(token);
        LocalDate today = LocalDate.now(clock);
        MvcResult created = mockMvc.perform(post("/api/categories")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Gym\",\"type\":\"WANT\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        UUID gym = UUID.fromString(jsonMapper.readTree(created.getResponse().getContentAsString()).get("id").asText());
        UUID id = id(create(token, body(gym, null, 200_000L, "Gym membership", today.getDayOfMonth())));

        mockMvc.perform(delete("/api/categories/" + gym).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "A recurring expense uses this category. Delete or change it first, or archive the category."));

        mockMvc.perform(patch("/api/categories/" + gym)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"archived\":true}"))
                .andExpect(status().isOk());

        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + today + "\",\"amountPaise\":200000}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This category is archived"));
        assertEquals(0, expenseCount(userId));
        mockMvc.perform(get(BASE).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(jsonPath("$[0].nextDueDate").value(today.toString()));

        // Deleting the recurring expense frees the category.
        mockMvc.perform(delete(BASE + "/" + id).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/categories/" + gym).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
    }

    @Test
    void anotherUsersRecurringExpenseIsNotFound() throws Exception {
        String owner = registerUserAndGetToken();
        String stranger = registerUserAndGetToken();
        onboardUser(owner);
        onboardUser(stranger);
        LocalDate today = LocalDate.now(clock);
        UUID rent = findCategoryIdByName(owner, "Rent");
        UUID id = id(create(owner, body(rent, null, 1_000_000L, "Rent", today.getDayOfMonth())));

        mockMvc.perform(post(BASE + "/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + today + "\",\"amountPaise\":1}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update(rent, 1L, "Mine now", 1, false)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete(BASE + "/" + id).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(BASE).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(jsonPath("$").isEmpty());
        // A stranger also cannot attach someone else's category.
        mockMvc.perform(post(BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(rent, null, 100L, "Rent", 5)))
                .andExpect(status().isNotFound());
    }

    @Test
    void weeklyAndYearlyComeDueOnTheirDayAndCheckTheirFields() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        LocalDate today = LocalDate.now(clock);
        int weekday = today.getDayOfWeek().getValue();

        // Weekly on today's weekday: due today, then a week later.
        JsonNode weekly = create(token, scheduled(rent, "Maid", "\"frequency\":\"WEEKLY\",\"dayOfWeek\":" + weekday));
        assertEquals("WEEKLY", weekly.get("frequency").asText());
        assertEquals(weekday, weekly.get("dayOfWeek").asInt());
        assertTrue(weekly.get("dayOfMonth").isNull());
        assertTrue(weekly.get("monthOfYear").isNull());
        assertEquals(today.toString(), weekly.get("nextDueDate").asText());
        assertEquals(true, weekly.get("due").asBoolean());
        mockMvc.perform(post(BASE + "/" + id(weekly) + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + today + "\",\"amountPaise\":50000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.expense.expenseDate").value(today.toString()))
                .andExpect(jsonPath("$.recurring.nextDueDate").value(today.plusWeeks(1).toString()))
                .andExpect(jsonPath("$.recurring.due").value(false));

        // Yearly on today's date: skipping moves it a year on (29 Feb falls on 28 Feb in other years).
        JsonNode yearly = create(token, scheduled(rent, "Insurance", "\"frequency\":\"YEARLY\",\"monthOfYear\":"
                + today.getMonthValue() + ",\"dayOfMonth\":" + today.getDayOfMonth()));
        assertEquals("YEARLY", yearly.get("frequency").asText());
        assertEquals(today.getMonthValue(), yearly.get("monthOfYear").asInt());
        assertEquals(today.toString(), yearly.get("nextDueDate").asText());
        mockMvc.perform(post(BASE + "/" + id(yearly) + "/skip")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dueDate\":\"" + today + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextDueDate").value(
                        Schedule.yearly(today.getMonthValue(), today.getDayOfMonth()).following(today).toString()));

        // Without a frequency it is monthly, as before weekly and yearly existed; other fields are ignored.
        JsonNode monthly = create(token, scheduled(rent, "Rent", "\"dayOfMonth\":5,\"dayOfWeek\":3"));
        assertEquals("MONTHLY", monthly.get("frequency").asText());
        assertEquals(5, monthly.get("dayOfMonth").asInt());
        assertTrue(monthly.get("dayOfWeek").isNull());

        String weekdayRange = "Day of week must be between 1 (Monday) and 7 (Sunday)";
        expectBadRequest(token, scheduled(rent, "Maid", "\"frequency\":\"WEEKLY\",\"dayOfMonth\":5"), weekdayRange);
        expectBadRequest(token, scheduled(rent, "Maid", "\"frequency\":\"WEEKLY\",\"dayOfWeek\":8"), weekdayRange);
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"YEARLY\",\"dayOfMonth\":5"),
                "Month must be between 1 and 12");
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"YEARLY\",\"monthOfYear\":13,\"dayOfMonth\":5"),
                "Month must be between 1 and 12");
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"YEARLY\",\"monthOfYear\":4"),
                "Day of month must be between 1 and 31");
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"YEARLY\",\"monthOfYear\":2,\"dayOfMonth\":30"),
                "That month does not have this day");
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"YEARLY\",\"monthOfYear\":4,\"dayOfMonth\":31"),
                "That month does not have this day");
        expectBadRequest(token, scheduled(rent, "Fee", "\"frequency\":\"DAILY\",\"dayOfMonth\":5"),
                "Malformed request body");
        // 29 Feb is a valid yearly date.
        create(token, scheduled(rent, "Leap", "\"frequency\":\"YEARLY\",\"monthOfYear\":2,\"dayOfMonth\":29"));
    }

    @Test
    void aNewWeekdayKeepsTheWaitingWeekAndANewFrequencyStartsFromToday() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token);
        UUID rent = findCategoryIdByName(token, "Rent");
        LocalDate today = LocalDate.now(clock);
        UUID id = id(create(token, scheduled(rent, "Maid", "\"frequency\":\"WEEKLY\",\"dayOfWeek\":3")));
        // The Wednesday two weeks ago is still waiting.
        LocalDate twoWeeksAgo = today.with(DayOfWeek.MONDAY).minusWeeks(2);
        setNextDue(id, twoWeeksAgo.plusDays(2));

        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateScheduled(rent, "Maid", "\"frequency\":\"WEEKLY\",\"dayOfWeek\":1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dayOfWeek").value(1))
                .andExpect(jsonPath("$.nextDueDate").value(twoWeeksAgo.toString()))
                .andExpect(jsonPath("$.due").value(true));

        // Monthly instead: the weeks still waiting are dropped and the next 1st, today included, is due.
        mockMvc.perform(put(BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateScheduled(rent, "Maid", "\"frequency\":\"MONTHLY\",\"dayOfMonth\":1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.frequency").value("MONTHLY"))
                .andExpect(jsonPath("$.dayOfWeek").isEmpty())
                .andExpect(jsonPath("$.nextDueDate").value(MonthlySchedule.firstOnOrAfter(today, 1).toString()));
    }

    // ---- helpers ----

    private static String scheduled(UUID categoryId, String description, String scheduleFields) {
        return "{\"categoryId\":\"" + categoryId + "\",\"amountPaise\":100000,\"description\":\"" + description
                + "\"," + scheduleFields + "}";
    }

    private static String updateScheduled(UUID categoryId, String description, String scheduleFields) {
        return "{\"categoryId\":\"" + categoryId + "\",\"amountPaise\":100000,\"description\":\"" + description
                + "\"," + scheduleFields + ",\"paused\":false}";
    }

    private static String body(UUID categoryId, String type, long amountPaise, String description, int day) {
        return "{\"categoryId\":\"" + categoryId + "\","
                + (type == null ? "" : "\"type\":\"" + type + "\",")
                + "\"amountPaise\":" + amountPaise + ","
                + "\"description\":\"" + description + "\","
                + "\"dayOfMonth\":" + day + "}";
    }

    private static String update(UUID categoryId, long amountPaise, String description, int day, boolean paused) {
        return "{\"categoryId\":\"" + categoryId + "\",\"amountPaise\":" + amountPaise
                + ",\"description\":\"" + description + "\",\"dayOfMonth\":" + day
                + ",\"paused\":" + paused + "}";
    }

    private JsonNode create(String token, String content) throws Exception {
        MvcResult result = mockMvc.perform(post(BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(content))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonMapper.readTree(result.getResponse().getContentAsString());
    }

    private void expectBadRequest(String token, String content, String message) throws Exception {
        mockMvc.perform(post(BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(content))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(message));
    }

    private static UUID id(JsonNode node) {
        return UUID.fromString(node.get("id").asText());
    }

    private void setNextDue(UUID id, LocalDate date) {
        jdbcTemplate.update("UPDATE recurring_expenses SET next_due_date = ? WHERE id = ?", date, id);
    }

    private int expenseCount(UUID userId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM expenses WHERE user_id = ?", Integer.class, userId);
        return count != null ? count : 0;
    }

    private UUID userId(String token) throws Exception {
        MvcResult me = mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn();
        return UUID.fromString(jsonMapper.readTree(me.getResponse().getContentAsString()).get("id").asText());
    }
}
