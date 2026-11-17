package com.financetracker.expense;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// Deliberately extends Repository (not JpaRepository/CrudRepository) so no method that
// fetches by id alone is exposed; every query must explicitly filter by userId.
public interface ExpenseRepository extends Repository<Expense, UUID> {

    Expense save(Expense expense);

    Expense saveAndFlush(Expense expense);

    Optional<Expense> findByIdAndUserId(UUID id, UUID userId);

    long deleteByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndCategoryId(UUID userId, UUID categoryId);

    long countByUserId(UUID userId);

    Page<Expense> findByUserIdAndExpenseDateBetween(
            UUID userId,
            LocalDate from,
            LocalDate to,
            Pageable pageable);

    Page<Expense> findByUserIdAndCategoryIdAndExpenseDateBetween(
            UUID userId,
            UUID categoryId,
            LocalDate from,
            LocalDate to,
            Pageable pageable);

    // Aggregated in the database so a report never loads individual expenses.
    // The join also checks the user, matching the composite foreign key.
    @Query("""
            select new com.financetracker.expense.CategorySpend(
                e.categoryId, c.name, c.archived, e.categoryType, sum(e.amountPaise), count(e))
            from Expense e join Category c on c.id = e.categoryId and c.userId = e.userId
            where e.userId = :userId and e.expenseDate between :from and :to
            group by e.categoryId, c.name, c.archived, e.categoryType
            order by sum(e.amountPaise) desc, c.name asc
            """)
    List<CategorySpend> sumByCategory(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    // Daily totals for the "spending over the cycle" chart, aggregated in the database.
    @Query("""
            select new com.financetracker.expense.DailySpend(e.expenseDate, e.categoryType, sum(e.amountPaise))
            from Expense e
            where e.userId = :userId and e.expenseDate between :from and :to
            group by e.expenseDate, e.categoryType
            order by e.expenseDate asc, e.categoryType asc
            """)
    List<DailySpend> sumByDay(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    // Totals per stored cycle and type in one query: each expense is matched to the cycle whose
    // date range contains it (there is deliberately no foreign key from expenses to cycles).
    @Query("""
            select new com.financetracker.expense.CycleTypeSpend(
                c.periodStart, e.categoryType, sum(e.amountPaise), count(e))
            from Expense e
            join Cycle c on c.userId = e.userId and e.expenseDate between c.periodStart and c.periodEnd
            where e.userId = :userId and c.periodStart between :firstStart and :lastStart
            group by c.periodStart, e.categoryType
            """)
    List<CycleTypeSpend> sumByCycle(
            @Param("userId") UUID userId,
            @Param("firstStart") LocalDate firstStart,
            @Param("lastStart") LocalDate lastStart);

    @Query("select max(e.createdAt) from Expense e where e.userId = :userId")
    Optional<OffsetDateTime> findLastCreatedAt(@Param("userId") UUID userId);
}
