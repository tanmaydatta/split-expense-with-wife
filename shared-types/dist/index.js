// Shared types for both frontend and backend
// These types ensure consistency across API requests and responses
// Constants
export const CURRENCIES = [
    "USD",
    "EUR",
    "GBP",
    "INR",
    "CAD",
    "AUD",
    "JPY",
    "CHF",
    "CNY",
    "SGD",
];
const BillDateSchema = z.iso.date();
export const BillCreateSchema = z.object({
    title: z.string().trim().min(2).max(100),
    amountMinor: z.number().int().positive().max(1000000000),
    currency: z.enum(CURRENCIES),
    firstDueDate: BillDateSchema,
    recurrence: z.enum(["once", "daily", "weekly", "monthly"]),
    payerUserId: z.string().min(1),
    splitBasisPoints: z.record(z.string(), z.number().int().min(0).max(10000)),
    scheduledActionId: z.string().min(1).nullable().optional(),
    scheduledBudgetActionId: z.string().min(1).nullable().optional(),
}).refine((value) => Object.values(value.splitBasisPoints).reduce((sum, share) => sum + share, 0) === 10000, {
    message: "Split shares must total 100%",
    path: ["splitBasisPoints"],
});
export const BillUpdateSchema = z.object({
    id: z.string().min(1),
    title: z.string().trim().min(2).max(100).optional(),
    amountMinor: z.number().int().positive().max(1000000000).optional(),
    currency: z.enum(CURRENCIES).optional(),
    firstDueDate: BillDateSchema.optional(),
    recurrence: z.enum(["once", "daily", "weekly", "monthly"]).optional(),
    payerUserId: z.string().min(1).optional(),
    splitBasisPoints: z.record(z.string(), z.number().int().min(0).max(10000)).optional(),
    scheduledActionId: z.string().min(1).nullable().optional(),
    scheduledBudgetActionId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
}).refine((value) => !value.splitBasisPoints || Object.values(value.splitBasisPoints).reduce((sum, share) => sum + share, 0) === 10000, {
    message: "Split shares must total 100%",
    path: ["splitBasisPoints"],
});
export const BillMonthQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export const BillPaymentSchema = z.object({
    occurrenceId: z.string().min(1),
    paid: z.boolean(),
    linkedTransactionId: z.string().min(1).optional(),
    createExpense: z.boolean().optional(),
    budgetId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
    if (!value.paid && (value.linkedTransactionId || value.createExpense || value.budgetId))
        ctx.addIssue({ code: "custom", message: "Payment options require paid=true" });
    if (value.linkedTransactionId && value.createExpense)
        ctx.addIssue({ code: "custom", message: "Choose an existing expense or create a new one" });
    if (value.budgetId && !value.createExpense)
        ctx.addIssue({ code: "custom", message: "Budget debit requires a new expense" });
});
export const BillIdSchema = z.object({ id: z.string().min(1) });
// Group Budget Data Schema
export const GroupBudgetDataSchema = z.object({
    id: z.string().min(1),
    budgetName: z
        .string()
        .min(1, "Budget name cannot be empty")
        .max(60, "Budget name cannot exceed 60 characters")
        .regex(/^[a-zA-Z0-9\s\-_]+$/, "Budget names can only contain letters, numbers, spaces, hyphens, and underscores")
        .transform((name) => name.trim()),
    description: z.string().nullable().optional(),
});
// Update Group Metadata Request Schema
export const UpdateGroupMetadataRequestSchema = z
    .object({
    groupid: z.union([z.string(), z.number()]).transform((val) => String(val)),
    defaultShare: z
        .record(z.string(), z.number())
        .refine((shares) => {
        const values = Object.values(shares);
        return values.every((v) => v >= 0);
    }, { message: "Default share percentages must be positive" })
        .refine((shares) => {
        const total = Object.values(shares).reduce((sum, p) => sum + p, 0);
        return Math.abs(total - 100) <= 0.001;
    }, { message: "Default share percentages must add up to 100%" })
        .optional(),
    defaultCurrency: z
        .enum(CURRENCIES)
        .optional(),
    groupName: z
        .string()
        .transform((name) => name.trim())
        .refine((name) => name.length >= 1, {
        message: "Group name cannot be empty",
    })
        .optional(),
    budgets: z
        .array(GroupBudgetDataSchema)
        .refine((budgets) => {
        const names = budgets.map((b) => b.budgetName.toLowerCase());
        return names.length === new Set(names).size;
    }, { message: "Budget names must be unique" })
        .optional(),
})
    .refine((data) => {
    // Ensure at least one field is being updated
    const hasChanges = data.defaultShare !== undefined ||
        data.defaultCurrency !== undefined ||
        data.groupName !== undefined ||
        data.budgets !== undefined;
    return hasChanges;
}, { message: "No changes provided" });
// ============================
// Zod Schemas (shared)
// ============================
import { z } from "zod";
// Authentication form schemas
export const LoginFormSchema = z.object({
    identifier: z.string().min(1, "Username or email is required"),
    password: z.string().min(1, "Password is required"),
});
export const SignUpFormSchema = z
    .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
})
    .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});
// Dashboard user schema for dynamic percentage fields
export const DashboardUserSchema = z.object({
    Id: z.string().min(1),
    FirstName: z.string().min(1),
    percentage: z
        .number()
        .min(0, "Percentage cannot be negative")
        .max(100, "Percentage cannot exceed 100%"),
});
// Core dashboard fields (shared between expense and budget)
export const DashboardCoreFieldsSchema = z.object({
    amount: z
        .number()
        .positive("Amount must be greater than 0")
        .max(999999, "Amount cannot exceed 999,999"),
    description: z
        .string()
        .min(2, "Description must be at least 2 characters")
        .max(100, "Description cannot exceed 100 characters")
        .trim(),
    currency: z.enum(CURRENCIES),
});
// Dashboard expense-specific fields
export const DashboardExpenseFieldsSchema = z.object({
    paidBy: z.string().min(1, "Please select who paid for this expense"),
    users: z
        .array(DashboardUserSchema)
        .min(1, "At least one user is required")
        .refine((users) => {
        const total = users.reduce((sum, user) => sum + (user.percentage || 0), 0);
        return Math.abs(total - 100) < 0.01;
    }, {
        message: "Split percentages must total exactly 100%",
        path: ["users"],
    }),
});
// Dashboard budget-specific fields
export const DashboardBudgetFieldsSchema = z.object({
    budgetId: z.string().min(1, "Please select a budget category"),
    creditDebit: z.union([z.literal("Credit"), z.literal("Debit")]),
});
// Action selection schema
export const DashboardActionSelectionSchema = z
    .object({
    addExpense: z.boolean(),
    updateBudget: z.boolean(),
})
    .refine((data) => data.addExpense || data.updateBudget, {
    message: "Please select at least one action to perform",
    path: ["addExpense"],
});
// Complete dashboard form schema with conditional validation
export const DashboardFormSchema = z
    .object({
    // Action selection
    addExpense: z.boolean(),
    updateBudget: z.boolean(),
    // Core fields (always present) - amount can be undefined initially
    amount: DashboardCoreFieldsSchema.shape.amount.optional(),
    description: DashboardCoreFieldsSchema.shape.description,
    currency: DashboardCoreFieldsSchema.shape.currency,
    // Expense-specific fields (conditional)
    paidBy: z.string().optional(),
    users: z.array(DashboardUserSchema).optional(),
    // Budget-specific fields (conditional)
    budgetId: z.string().optional(),
    creditDebit: z.union([z.literal("Credit"), z.literal("Debit")]).optional(),
})
    .superRefine((data, ctx) => {
    // Validate expense fields when addExpense is true
    if (data.addExpense) {
        if (!data.paidBy) {
            ctx.addIssue({
                code: "custom",
                message: "Please select who paid for this expense",
                path: ["paidBy"],
            });
        }
        if (!data.users || data.users.length === 0) {
            ctx.addIssue({
                code: "custom",
                message: "At least one user is required for expense splitting",
                path: ["users"],
            });
        }
        else {
            // Validate percentage totals
            const total = data.users.reduce((sum, user) => sum + (user.percentage || 0), 0);
            if (Math.abs(total - 100) > 0.01) {
                ctx.addIssue({
                    code: "custom",
                    message: "Split percentages must total exactly 100%",
                    path: ["users"],
                });
            }
        }
    }
    // Validate budget fields when updateBudget is true
    if (data.updateBudget) {
        if (!data.budgetId) {
            ctx.addIssue({
                code: "custom",
                message: "Please select a budget category",
                path: ["budgetId"],
            });
        }
        if (!data.creditDebit) {
            ctx.addIssue({
                code: "custom",
                message: "Please select Credit or Debit",
                path: ["creditDebit"],
            });
        }
    }
    // Ensure at least one action is selected
    if (!data.addExpense && !data.updateBudget) {
        ctx.addIssue({
            code: "custom",
            message: "Please select at least one action to perform",
            path: ["addExpense"],
        });
    }
});
export const AddExpenseActionSchema = z.object({
    amount: z.number().positive(),
    description: z.string().min(2).max(100),
    currency: z.string(),
    paidByUserId: z.string().min(1),
    splitPctShares: z
        .record(z.string(), z.number())
        .refine((shares) => Math.abs(Object.values(shares).reduce((a, b) => a + b, 0) - 100) < 0.01, { message: "Split percentages must total 100%" }),
});
export const AddBudgetActionSchema = z.object({
    amount: z.number().positive(),
    description: z.string().min(2).max(100),
    budgetId: z.string().min(1),
    currency: z.string(),
    type: z.union([z.literal("Credit"), z.literal("Debit")]),
});
export const CreateScheduledActionSchema = z.object({
    actionType: z.union([z.literal("add_expense"), z.literal("add_budget")]),
    frequency: z.union([
        z.literal("daily"),
        z.literal("weekly"),
        z.literal("monthly"),
    ]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    actionData: z.union([AddExpenseActionSchema, AddBudgetActionSchema]),
});
export const UpdateScheduledActionSchema = z
    .object({
    id: z.string().min(1),
    isActive: z.boolean().optional(),
    frequency: z
        .union([z.literal("daily"), z.literal("weekly"), z.literal("monthly")])
        .optional(),
    actionData: z
        .union([AddExpenseActionSchema, AddBudgetActionSchema])
        .optional(),
    nextExecutionDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    skipNext: z.boolean().optional(),
})
    .superRefine((data, ctx) => {
    if (data.nextExecutionDate && data.skipNext) {
        ctx.addIssue({
            code: "custom",
            message: "Provide only one of nextExecutionDate or skipNext",
            path: ["nextExecutionDate"],
        });
    }
});
export const ScheduledActionListQuerySchema = z.object({
    offset: z.coerce
        .number()
        .int()
        .catch(0)
        .transform((n) => (n < 0 ? 0 : n)),
    limit: z.coerce
        .number()
        .int()
        .catch(10)
        .transform((n) => (n < 1 ? 10 : n > 50 ? 50 : n)),
    status: z.enum(["all", "active", "paused"]).default("all"),
    actionType: z.enum(["all", "add_expense", "add_budget"]).default("all"),
    frequency: z.enum(["all", "daily", "weekly", "monthly"]).default("all"),
    sort: z.enum(["recent", "next_run", "name"]).default("recent"),
});
export const ScheduledActionHistoryQuerySchema = z.object({
    offset: z.coerce
        .number()
        .int()
        .catch(0)
        .transform((n) => (n < 0 ? 0 : n)),
    limit: z.coerce
        .number()
        .int()
        .catch(10)
        .transform((n) => (n < 1 ? 10 : n > 50 ? 50 : n)),
    scheduledActionId: z.string().min(1),
    executionStatus: z
        .union([z.literal("success"), z.literal("failed"), z.literal("started")])
        .optional(),
});
