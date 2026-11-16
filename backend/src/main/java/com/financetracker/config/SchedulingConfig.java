package com.financetracker.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// Runs @Scheduled housekeeping, such as dropping idle rate-limit buckets.
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
