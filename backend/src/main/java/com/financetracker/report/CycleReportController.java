package com.financetracker.report;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Cycles")
@RestController
@RequestMapping("/api/cycles")
public class CycleReportController {

    private final CycleReportService reportService;

    public CycleReportController(CycleReportService reportService) {
        this.reportService = reportService;
    }

    @Operation(summary = "Spending against the plan, current cycle")
    @GetMapping("/current/report")
    public CycleReport current(@AuthenticationPrincipal Jwt jwt) {
        return reportService.currentReport(UUID.fromString(jwt.getSubject()));
    }

    // Report for the stored cycle containing the given date, e.g. the day before the current
    // cycle's start for the previous cycle.
    @Operation(summary = "Spending against the plan for the cycle containing a date")
    @GetMapping("/report")
    public CycleReport forDate(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return reportService.reportForDate(UUID.fromString(jwt.getSubject()), date);
    }

    // The cycle containing the date (default today) and the cycles before it, oldest first.
    // count is checked in the service (1 to 12) so a bad value is a 400, not a 500.
    @Operation(summary = "Recent cycles with their totals",
            description = "Oldest first, ending with the cycle containing the date (default today). count is 1 to 12.")
    @GetMapping("/history")
    public List<CycleHistoryItem> history(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "6") int count) {
        return reportService.history(UUID.fromString(jwt.getSubject()), date, count);
    }
}
