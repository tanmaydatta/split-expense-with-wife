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
