package com.financetracker.report;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

// The Reports page. Each endpoint returns raw totals; grouping into years, running savings and
// prorating weekly plans happen in the client, where they are unit-tested.
@Tag(name = "Reports")
@RestController
@RequestMapping("/api/reports")
public class ReportsController {

    private final CycleReportService reportService;

    public ReportsController(CycleReportService reportService) {
        this.reportService = reportService;
    }

    @Operation(summary = "Every cycle with its totals",
            description = "Oldest first. Used for the monthly, yearly and savings reports.")
    @GetMapping("/cycles")
    public List<CycleHistoryItem> cycles(@AuthenticationPrincipal Jwt jwt) {
        return reportService.allCycles(UUID.fromString(jwt.getSubject()));
    }

    // count is checked in the service (1 to 12) so a bad value is a 400, not a 500.
    @Operation(summary = "Spending per category in recent cycles",
            description = "The last count cycles up to the current one (1 to 12, default 6), oldest first,"
                    + " with spending per category in each.")
    @GetMapping("/categories")
    public CategoryTrends categories(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "6") int count) {
        return reportService.categoryTrends(UUID.fromString(jwt.getSubject()), count);
    }

    // year is checked in the service (2000 to 9999) so a bad value is a 400, not a 500.
    @Operation(summary = "Spending per category in a calendar year",
            description = "The cycles that start in the year, oldest first, with spending per category in each."
                    + " A year without cycles returns two empty lists.")
    @GetMapping("/year")
    public CategoryTrends year(@AuthenticationPrincipal Jwt jwt, @RequestParam int year) {
        return reportService.year(UUID.fromString(jwt.getSubject()), year);
    }

    // weeks is checked in the service (1 to 26) so a bad value is a 400, not a 500.
    @Operation(summary = "Daily totals for the last weeks",
            description = "weeks is 1 to 26 (default 8), Monday to Sunday.")
    @GetMapping("/weekly")
    public WeeklyData weekly(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "8") int weeks) {
        return reportService.weekly(UUID.fromString(jwt.getSubject()), weeks);
    }
}
