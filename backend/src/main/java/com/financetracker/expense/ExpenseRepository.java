package com.financetracker.expense;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.financetracker.common.BudgetType;

// Deliberately extends Repository (not JpaRepository/CrudRepository) so no method that
// fetches by id alone is exposed; every query must explicitly filter by userId.
public interface ExpenseRepository extends Repository<Expense, UUID> {

    Expense save(Expense expense);

    Expense saveAndFlush(Expense expense);

    Optional<Expense> findByIdAndUserId(UUID id, UUID userId);

    Optional<Expense> findByUserIdAndClientId(UUID userId, UUID clientId);

    long deleteByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndCategoryId(UUID userId, UUID categoryId);

    long countByUserId(UUID userId);

    // The list's filters (see ExpenseFilter). A null parameter matches everything.
    String FILTERED = """
            from Expense e
            where e.userId = :userId and e.expenseDate between :from and :to
              and (:categoryId is null or e.categoryId = :categoryId)
              and (:type is null or e.categoryType = :type)
              and (:pattern is null or lower(e.description) like :pattern escape '!')
            """;

    @Query(value = "select e " + FILTERED, countQuery = "select count(e) " + FILTERED)
    Page<Expense> search(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("categoryId") UUID categoryId,
            @Param("type") BudgetType type,
            @Param("pattern") String pattern,
            Pageable pageable);

    // For the CSV export: every match, oldest first. Bounded by the 20,000-per-user limit.
    @Query("select e " + FILTERED + " order by e.expenseDate asc, e.createdAt asc, e.id asc")
    List<Expense> searchAll(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("categoryId") UUID categoryId,
            @Param("type") BudgetType type,
            @Param("pattern") String pattern);

    @Query("select coalesce(sum(e.amountPaise), 0) " + FILTERED)
    long sumFiltered(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("categoryId") UUID categoryId,
            @Param("type") BudgetType type,
            @Param("pattern") String pattern);

    // Day totals for the dates shown on one page, over every matching expense (a day can continue
    // on the next page, so the page's own rows are not enough).
    @Query("select new com.financetracker.expense.DayTotal(e.expenseDate, sum(e.amountPaise)) " + FILTERED
            + " and e.expenseDate in :dates group by e.expenseDate")
    List<DayTotal> sumByDayIn(
            @Param("userId") UUID userId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("categoryId") UUID categoryId,
            @Param("type") BudgetType type,
            @Param("pattern") String pattern,
            @Param("dates") Collection<LocalDate> dates);

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

    // Spending per cycle and category in one query, for the category trends report. Matched to
    // cycles by date range like sumByCycle; the category join checks the user like sumByCategory.
    @Query("""
            select new com.financetracker.expense.CycleCategorySpend(
                cy.periodStart, e.categoryId, c.name, c.archived, e.categoryType, sum(e.amountPaise), count(e))
            from Expense e
            join Category c on c.id = e.categoryId and c.userId = e.userId
            join Cycle cy on cy.userId = e.userId and e.expenseDate between cy.periodStart and cy.periodEnd
            where e.userId = :userId and cy.periodStart between :firstStart and :lastStart
            group by cy.periodStart, e.categoryId, c.name, c.archived, e.categoryType
            order by cy.periodStart asc, sum(e.amountPaise) desc, c.name asc
            """)
    List<CycleCategorySpend> sumByCycleAndCategory(
            @Param("userId") UUID userId,
            @Param("firstStart") LocalDate firstStart,
            @Param("lastStart") LocalDate lastStart);

    @Query("select max(e.createdAt) from Expense e where e.userId = :userId")
    Optional<OffsetDateTime> findLastCreatedAt(@Param("userId") UUID userId);
}
