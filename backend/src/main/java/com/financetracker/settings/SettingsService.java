package com.financetracker.settings;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.cycle.Cycle;
import com.financetracker.cycle.CycleCalculator;
import com.financetracker.cycle.CyclePeriod;
import com.financetracker.cycle.CycleService;
import com.financetracker.user.User;
import com.financetracker.user.UserRepository;

@Service
public class SettingsService {

    private final CycleService cycleService;
    private final UserRepository userRepository;

    public SettingsService(CycleService cycleService, UserRepository userRepository) {
        this.cycleService = cycleService;
        this.userRepository = userRepository;
    }

    // A pay day change waits one full cycle: the current cycle and the next one keep the old
    // pay day, and the cycle after that starts the new one. Choosing the current pay day again
    // cancels a pending change. A second change replaces the pending one.
    @Transactional
    public PayDaySettingsView changePayDay(UUID userId, int newPayDay) {
        User user = cycleService.lockUser(userId);
        // Rolls forward first, which may apply an earlier pending change, so the dates below
        // are computed from the pay day that is really in effect.
        Cycle current = cycleService.currentCycleForLockedUser(user);

        if (newPayDay == user.getPayDay()) {
            user.clearPendingPayDay();
        } else {
            CyclePeriod next = CycleCalculator.nextAfter(
                    new CyclePeriod(current.getPeriodStart(), current.getPeriodEnd()), user.getPayDay());
            user.schedulePayDayChange((short) newPayDay, next.end().plusDays(1));
        }
        return PayDaySettingsView.from(userRepository.saveAndFlush(user));
    }

    // One transaction, so a failure cannot leave the name changed but not the greeting setting.
    // name must already be normalized (DisplayNames). showName null keeps the setting.
    @Transactional
    public User changeName(UUID userId, String name, Boolean showName) {
        userRepository.updateDisplayName(userId, name);
        if (showName != null) {
            userRepository.updateShowName(userId, showName);
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized"));
    }

    @Transactional
    public void changeOpeningBalance(UUID userId, Long openingBalancePaise) {
        // 0 rows: the account was deleted while the token was still valid.
        if (userRepository.updateOpeningBalance(userId, openingBalancePaise) == 0) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
    }
}
