package com.financetracker.account;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.financetracker.user.UserRepository;

// Deletes accounts whose grace period has ended. Render's free instance sleeps when idle, so
// this runs soon after every start and then hourly while awake; a login after the deadline
// also deletes the account (AuthController.login), so a sleeping server never revives one.
@Component
public class AccountDeletionJob {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionJob.class);

    private final UserRepository users;
    private final Clock clock;

    public AccountDeletionJob(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    @Scheduled(initialDelay = 7, fixedDelay = 60, timeUnit = TimeUnit.MINUTES)
    public int deleteDueAccounts() {
        int deleted = users.deleteScheduledUpTo(OffsetDateTime.now(clock));
        if (deleted > 0) {
            // Only the count: no ids or emails of deleted accounts in the logs.
            log.info("Deleted {} accounts at the end of their grace period", deleted);
        }
        return deleted;
    }
}
