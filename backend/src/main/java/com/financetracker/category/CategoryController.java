package com.financetracker.category;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.common.BudgetType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Categories")
@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    public record CreateCategoryRequest(
            @NotBlank(message = "Name is required")
            @Size(max = 50, message = "Name must be at most 50 characters")
            String name,

            @NotNull(message = "Type is required")
            BudgetType type) {

        public CreateCategoryRequest {
            if (name != null) {
                name = name.trim();
            }
        }
    }

    public record UpdateCategoryRequest(String name, BudgetType type, Boolean archived) {
    }

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @Operation(summary = "List categories")
    @GetMapping
    public List<CategoryView> list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "false") boolean includeArchived) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return categoryService.list(userId, includeArchived);
    }

    @Operation(summary = "Create a category", description = "At most 50 per user.")
    @PostMapping
    public ResponseEntity<CategoryView> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateCategoryRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        CategoryView created = categoryService.create(userId, request.name(), request.type());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Rename, retype, archive or restore a category",
            description = "The Other category cannot be changed.")
    @PatchMapping("/{id}")
    public CategoryView update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody UpdateCategoryRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return categoryService.update(
                userId,
                id,
                request.name(),
                request.type(),
                request.archived());
    }

    @Operation(summary = "Delete a category",
            description = "409 while expenses or recurring expenses use it: archive it instead.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id) {
        UUID userId = UUID.fromString(jwt.getSubject());
        categoryService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }
}
