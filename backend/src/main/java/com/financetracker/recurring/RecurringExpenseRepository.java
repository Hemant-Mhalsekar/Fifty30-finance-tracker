package com.financetracker.recurring;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

// Deliberately extends Repository (not JpaRepository/CrudRepository) so no method that
// fetches by id alone is exposed; every query must explicitly filter by userId.
public interface RecurringExpenseRepository extends Repository<RecurringExpense, UUID> {

    RecurringExpense saveAndFlush(RecurringExpense recurringExpense);

    void flush();

    Optional<RecurringExpense> findByIdAndUserId(UUID id, UUID userId);

    // SELECT ... FOR UPDATE: two taps on Confirm (or Confirm on two devices) cannot both add the
    // same month's expense, because the second waits and then sees the due date has moved on.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RecurringExpense r where r.id = :id and r.userId = :userId")
    Optional<RecurringExpense> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    List<RecurringExpense> findAllByUserId(UUID userId);

    long countByUserId(UUID userId);

    long deleteByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndCategoryId(UUID userId, UUID categoryId);
}
