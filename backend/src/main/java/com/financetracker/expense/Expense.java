package com.financetracker.expense;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.Generated;

import com.financetracker.common.BudgetType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "expenses")
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    @Enumerated(EnumType.STRING)
    @Column(name = "category_type", nullable = false)
    private BudgetType categoryType;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(nullable = false)
    private String description;

    // Set by the phone for expenses queued offline (V8); null otherwise. Never changes.
    @Column(name = "client_id", updatable = false)
    private UUID clientId;

    // Set by the database default (now()), never written by the app; @Generated reads it back
    // after the insert, so a newly created expense already has it.
    @Generated
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected Expense() {
        // required by JPA
    }

    public Expense(
            UUID userId,
            UUID categoryId,
            BudgetType categoryType,
            long amountPaise,
            LocalDate expenseDate,
            String description) {
        this.userId = userId;
        this.categoryId = categoryId;
        this.categoryType = categoryType;
        this.amountPaise = amountPaise;
        this.expenseDate = expenseDate;
        this.description = description;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getCategoryId() {
        return categoryId;
    }

    public BudgetType getCategoryType() {
        return categoryType;
    }

    public long getAmountPaise() {
        return amountPaise;
    }

    public LocalDate getExpenseDate() {
        return expenseDate;
    }

    public String getDescription() {
        return description;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public UUID getClientId() {
        return clientId;
    }

    public void setClientId(UUID clientId) {
        this.clientId = clientId;
    }

    public void setCategoryId(UUID categoryId) {
        this.categoryId = categoryId;
    }

    public void setCategoryType(BudgetType categoryType) {
        this.categoryType = categoryType;
    }

    public void setAmountPaise(long amountPaise) {
        this.amountPaise = amountPaise;
    }

    public void setExpenseDate(LocalDate expenseDate) {
        this.expenseDate = expenseDate;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}

