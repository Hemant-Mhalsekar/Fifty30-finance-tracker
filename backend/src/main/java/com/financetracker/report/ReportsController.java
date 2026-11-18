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

// The Reports page. Both endpoints return raw totals; grouping into years, running savings and
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
            description = "Oldest first. Used for the yearly and savings reports.")
    @GetMapping("/cycles")
    public List<CycleHistoryItem> cycles(@AuthenticationPrincipal Jwt jwt) {
        return reportService.allCycles(UUID.fromString(jwt.getSubject()));
    }

    // weeks is checked in the service (1 to 26) so a bad value is a 400, not a 500.
    @Operation(summary = "Daily totals for the last weeks",
            description = "weeks is 1 to 26 (default 8), Monday to Sunday.")
    @GetMapping("/weekly")
    public WeeklyData weekly(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "8") int weeks) {
        return reportService.weekly(UUID.fromString(jwt.getSubject()), weeks);
    }
}
