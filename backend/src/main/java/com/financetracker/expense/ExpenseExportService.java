package com.financetracker.expense;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.financetracker.category.Category;
import com.financetracker.category.CategoryRepository;
import com.financetracker.common.BudgetType;

@Service
public class ExpenseExportService {

    // Makes Excel open the file as UTF-8, so the rupee sign and non-English text show correctly.
    private static final String BYTE_ORDER_MARK = "﻿";
    private static final String HEADER = "Date,Description,Category,Type,Amount (INR)";

    public record Export(String filename, byte[] body) {
    }

    private final ExpenseRepository expenseRepository;
    private final CategoryRepository categoryRepository;

    public ExpenseExportService(ExpenseRepository expenseRepository, CategoryRepository categoryRepository) {
        this.expenseRepository = expenseRepository;
        this.categoryRepository = categoryRepository;
    }

    // Same filters as the expense list, oldest first so the file reads like a ledger.
    @Transactional(readOnly = true)
    public Export export(UUID userId, LocalDate from, LocalDate to, UUID categoryId, BudgetType type,
            String query) {
        ExpenseFilter filter = ExpenseFilter.of(userId, from, to, categoryId, type, query);
        List<Expense> expenses = expenseRepository.searchAll(filter.userId(), filter.from(), filter.to(),
                filter.categoryId(), filter.type(), filter.descriptionPattern());
        Map<UUID, String> names = categoryRepository.findAllByUserId(userId).stream()
                .collect(Collectors.toMap(Category::getId, Category::getName, (a, b) -> a));

        StringBuilder csv = new StringBuilder(BYTE_ORDER_MARK).append(HEADER).append("\r\n");
        for (Expense e : expenses) {
            csv.append(e.getExpenseDate()).append(',')
                    .append(Csv.field(e.getDescription())).append(',')
                    .append(Csv.field(names.getOrDefault(e.getCategoryId(), ""))).append(',')
                    .append(typeLabel(e.getCategoryType())).append(',')
                    .append(Csv.rupees(e.getAmountPaise())).append("\r\n");
        }
        return new Export(filename(from, to), csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String typeLabel(BudgetType type) {
        return switch (type) {
            case NEED -> "Need";
            case WANT -> "Want";
            case INVESTMENT -> "Investment";
        };
    }

    private static String filename(LocalDate from, LocalDate to) {
        if (from == null && to == null) {
            return "fifty30-expenses.csv";
        }
        return "fifty30-expenses-" + (from != null ? from : "start") + "-to-" + (to != null ? to : "today") + ".csv";
    }

}
