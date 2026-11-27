package com.financetracker.recurring;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

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
@Table(name = "recurring_expenses")
public class RecurringExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    // Only for categories without a fixed type; null otherwise.
    @Enumerated(EnumType.STRING)
    private BudgetType type;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Frequency frequency;

    // Only the fields of the frequency are set (see Schedule); the database checks the combination.
    @Column(name = "day_of_month")
    private Short dayOfMonth;

    @Column(name = "day_of_week")
    private Short dayOfWeek;

    @Column(name = "month_of_year")
    private Short monthOfYear;

    @Column(name = "next_due_date", nullable = false)
    private LocalDate nextDueDate;

    @Column(nullable = false)
    private boolean paused;

    // Set by the database default (now()), so it is never written by the app.
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected RecurringExpense() {
        // required by JPA
    }

    public RecurringExpense(
            UUID userId,
            UUID categoryId,
            BudgetType type,
            long amountPaise,
            String description,
            Schedule schedule,
            LocalDate nextDueDate) {
        this.userId = userId;
        this.categoryId = categoryId;
        this.type = type;
        this.amountPaise = amountPaise;
        this.description = description;
        setSchedule(schedule);
        this.nextDueDate = nextDueDate;
        this.paused = false;
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

    public BudgetType getType() {
        return type;
    }

    public long getAmountPaise() {
        return amountPaise;
    }

    public String getDescription() {
        return description;
    }

    public Schedule getSchedule() {
        return new Schedule(frequency, toInteger(dayOfMonth), toInteger(dayOfWeek), toInteger(monthOfYear));
    }

    public LocalDate getNextDueDate() {
        return nextDueDate;
    }

    public boolean isPaused() {
        return paused;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCategoryId(UUID categoryId) {
        this.categoryId = categoryId;
    }

    public void setType(BudgetType type) {
        this.type = type;
    }

    public void setAmountPaise(long amountPaise) {
        this.amountPaise = amountPaise;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setSchedule(Schedule schedule) {
        this.frequency = schedule.frequency();
        this.dayOfMonth = toShort(schedule.dayOfMonth());
        this.dayOfWeek = toShort(schedule.dayOfWeek());
        this.monthOfYear = toShort(schedule.monthOfYear());
    }

    private static Short toShort(Integer value) {
        return value == null ? null : value.shortValue();
    }

    private static Integer toInteger(Short value) {
        return value == null ? null : value.intValue();
    }

    public void setNextDueDate(LocalDate nextDueDate) {
        this.nextDueDate = nextDueDate;
    }

    public void setPaused(boolean paused) {
        this.paused = paused;
    }
}
