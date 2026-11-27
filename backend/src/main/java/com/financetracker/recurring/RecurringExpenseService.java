package com.financetracker.recurring;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Month;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.category.Category;
import com.financetracker.category.CategoryRepository;
import com.financetracker.common.BudgetType;
import com.financetracker.expense.ExpenseService;
import com.financetracker.expense.ExpenseView;

// Weekly, monthly or yearly expenses that the user confirms (or skips) each time they come due. Confirming logs a
// normal expense through ExpenseService, so every expense rule (limits, archived categories,
// type snapshot, no future dates) applies unchanged.
@Service
public class RecurringExpenseService {

    private static final long MAX_RECURRING_PER_USER = 50;
    private static final long MIN_AMOUNT_PAISE = 1;
    private static final long MAX_AMOUNT_PAISE = 10_000_000_000L;

    // Due first, then by next due date, then by description.
    private static final Comparator<RecurringExpenseView> ORDER = Comparator
            .comparing((RecurringExpenseView r) -> !r.due())
            .thenComparing(RecurringExpenseView::nextDueDate)
            .thenComparing(RecurringExpenseView::description, String.CASE_INSENSITIVE_ORDER);

    public record ConfirmResult(ExpenseView expense, RecurringExpenseView recurring) {
    }

    private final RecurringExpenseRepository recurringRepository;
    private final CategoryRepository categoryRepository;
    private final ExpenseService expenseService;
    private final Clock clock;

    public RecurringExpenseService(
            RecurringExpenseRepository recurringRepository,
            CategoryRepository categoryRepository,
            ExpenseService expenseService,
            Clock clock) {
        this.recurringRepository = recurringRepository;
        this.categoryRepository = categoryRepository;
        this.expenseService = expenseService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<RecurringExpenseView> list(UUID userId) {
        LocalDate today = today();
        return recurringRepository.findAllByUserId(userId).stream()
                .map(r -> RecurringExpenseView.from(r, today))
                .sorted(ORDER)
                .toList();
    }

    // The first due date is the next time the day comes round, today included. Earlier months
    // are never asked about: they were either logged by hand or are not wanted.
    @Transactional
    public RecurringExpenseView create(
            UUID userId,
            UUID categoryId,
            BudgetType type,
            Long amountPaise,
            String description,
            Frequency frequency,
            Integer dayOfMonth,
            Integer dayOfWeek,
            Integer monthOfYear) {
        Fields fields = validate(amountPaise, description, frequency, dayOfMonth, dayOfWeek, monthOfYear);
        if (recurringRepository.countByUserId(userId) >= MAX_RECURRING_PER_USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Recurring expense limit reached");
        }
        Category category = activeCategory(userId, categoryId);

        RecurringExpense saved = recurringRepository.saveAndFlush(new RecurringExpense(
                userId,
                categoryId,
                checkType(category, type),
                fields.amountPaise(),
                fields.description(),
                fields.schedule(),
                fields.schedule().firstOnOrAfter(today())));
        return RecurringExpenseView.from(saved, today());
    }

    @Transactional
    public RecurringExpenseView update(
            UUID userId,
            UUID id,
            UUID categoryId,
            BudgetType type,
            Long amountPaise,
            String description,
            Frequency frequency,
            Integer dayOfMonth,
            Integer dayOfWeek,
            Integer monthOfYear,
            Boolean paused) {
        Fields fields = validate(amountPaise, description, frequency, dayOfMonth, dayOfWeek, monthOfYear);
        if (paused == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paused is required");
        }
        RecurringExpense recurring = recurringRepository.findByIdAndUserIdForUpdate(id, userId)
                .orElseThrow(RecurringExpenseService::notFound);

        Category category;
        if (categoryId != null && categoryId.equals(recurring.getCategoryId())) {
            // Keeping an archived category is allowed; confirming will say it is archived.
            category = categoryRepository.findByIdAndUserId(categoryId, userId)
                    .orElseThrow(RecurringExpenseService::categoryNotFound);
        } else {
            category = activeCategory(userId, categoryId);
        }

        LocalDate today = today();
        LocalDate nextDue = recurring.getNextDueDate();
        Schedule current = recurring.getSchedule();
        Schedule schedule = fields.schedule();
        if (schedule.frequency() != current.frequency()) {
            // A new rhythm starts again from today; occurrences of the old one are not asked about.
            nextDue = schedule.firstOnOrAfter(today);
        } else if (!schedule.equals(current)) {
            // Same week, month or year as the occurrence that is waiting, so a period already
            // answered is not asked again and one not answered yet is not lost.
            nextDue = schedule.inSamePeriodAs(nextDue);
        }
        if (recurring.isPaused() && !paused && nextDue.isBefore(today)) {
            // Occurrences that passed while paused are not asked about.
            nextDue = schedule.firstOnOrAfter(today);
        }

        recurring.setCategoryId(category.getId());
        recurring.setType(checkType(category, type));
        recurring.setAmountPaise(fields.amountPaise());
        recurring.setDescription(fields.description());
        recurring.setSchedule(schedule);
        recurring.setNextDueDate(nextDue);
        recurring.setPaused(paused);
        recurringRepository.flush();
        return RecurringExpenseView.from(recurring, today);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        if (recurringRepository.deleteByIdAndUserId(id, userId) == 0) {
            throw notFound();
        }
    }

    // Logs the expense for the waiting occurrence and moves on to the next one. The amount can
    // differ from the usual one (a bill that changed), and the date defaults to the due date.
    @Transactional
    public ConfirmResult confirm(
            UUID userId,
            UUID id,
            LocalDate dueDate,
            Long amountPaise,
            LocalDate expenseDate) {
        RecurringExpense recurring = lockDue(userId, id, dueDate);
        ExpenseView expense = expenseService.create(
                userId,
                amountPaise,
                recurring.getCategoryId(),
                recurring.getDescription(),
                expenseDate != null ? expenseDate : dueDate,
                recurring.getType());
        return new ConfirmResult(expense, advance(recurring));
    }

    @Transactional
    public RecurringExpenseView skip(UUID userId, UUID id, LocalDate dueDate) {
        return advance(lockDue(userId, id, dueDate));
    }

    // dueDate is the occurrence the user was looking at. If it no longer matches, another tap or
    // device already answered it, and adding the expense again would count it twice.
    private RecurringExpense lockDue(UUID userId, UUID id, LocalDate dueDate) {
        if (dueDate == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Due date is required");
        }
        RecurringExpense recurring = recurringRepository.findByIdAndUserIdForUpdate(id, userId)
                .orElseThrow(RecurringExpenseService::notFound);
        if (!dueDate.equals(recurring.getNextDueDate())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This payment was already handled");
        }
        if (recurring.isPaused()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This recurring expense is paused");
        }
        if (dueDate.isAfter(today())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This payment is not due yet");
        }
        return recurring;
    }

    private RecurringExpenseView advance(RecurringExpense recurring) {
        recurring.setNextDueDate(recurring.getSchedule().following(recurring.getNextDueDate()));
        recurringRepository.flush();
        return RecurringExpenseView.from(recurring, today());
    }

    private Category activeCategory(UUID userId, UUID categoryId) {
        if (categoryId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        }
        Category category = categoryRepository.findByIdAndUserId(categoryId, userId)
                .orElseThrow(RecurringExpenseService::categoryNotFound);
        if (category.isArchived()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This category is archived");
        }
        return category;
    }

    // Same rule as expenses: a type is chosen only for categories without a fixed type.
    private static BudgetType checkType(Category category, BudgetType type) {
        if (category.getType() != null) {
            if (type != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Type can only be set for categories without a fixed type");
            }
            return null;
        }
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type is required for this category");
        }
        return type;
    }

    private record Fields(long amountPaise, String description, Schedule schedule) {
    }

    private static Fields validate(
            Long amountPaise,
            String description,
            Frequency frequency,
            Integer dayOfMonth,
            Integer dayOfWeek,
            Integer monthOfYear) {
        if (amountPaise == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount is required");
        }
        if (amountPaise < MIN_AMOUNT_PAISE || amountPaise > MAX_AMOUNT_PAISE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Amount must be between ₹0.01 and ₹10,00,00,000");
        }
        String trimmed = description == null ? "" : description.trim();
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Description is required");
        }
        if (trimmed.length() > 200) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Description must be at most 200 characters");
        }
        return new Fields(amountPaise, trimmed, schedule(frequency, dayOfMonth, dayOfWeek, monthOfYear));
    }

    // No frequency means monthly (the API before weekly and yearly existed). Fields that do not
    // belong to the frequency are ignored, so a form can send everything it holds.
    private static Schedule schedule(Frequency frequency, Integer dayOfMonth, Integer dayOfWeek, Integer monthOfYear) {
        Frequency chosen = frequency == null ? Frequency.MONTHLY : frequency;
        if (chosen == Frequency.WEEKLY) {
            if (dayOfWeek == null || dayOfWeek < 1 || dayOfWeek > 7) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Day of week must be between 1 (Monday) and 7 (Sunday)");
            }
            return Schedule.weekly(dayOfWeek);
        }
        if (chosen == Frequency.YEARLY && (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Month must be between 1 and 12");
        }
        if (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day of month must be between 1 and 31");
        }
        if (chosen == Frequency.MONTHLY) {
            return Schedule.monthly(dayOfMonth);
        }
        // 29 Feb is allowed (it falls on 28 Feb in other years); 30 Feb or 31 Apr never happen.
        if (dayOfMonth > Month.of(monthOfYear).maxLength()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That month does not have this day");
        }
        return Schedule.yearly(monthOfYear, dayOfMonth);
    }

    private LocalDate today() {
        return LocalDate.now(clock);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Recurring expense not found");
    }

    private static ResponseStatusException categoryNotFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found");
    }
}
