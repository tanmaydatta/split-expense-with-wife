export * from "../../shared-types";
import type { GroupMetadata } from "../../shared-types";
import { auth } from "./auth";
import { user } from "./db/schema/auth-schema";
export type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof auth>["api"]["getSession"]>>>;
export type User = Session["user"];
export interface CurrentSession {
    currentUser: typeof user.$inferSelect;
    usersById: Record<string, typeof user.$inferSelect>;
    group: ParsedGroup | null;
    currencies?: string[];
}
export interface ParsedGroup {
    groupid: number;
    budgets: string[];
    userids: string[];
    metadata: GroupMetadata;
}
export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
    expires?: Date;
    domain?: string;
}
export interface UserRow {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    groupid: number;
    password: string;
    created_at: string;
}
export interface TransactionRow {
    id: number;
    description: string;
    amount: number;
    created_at: string;
    metadata: string;
    currency: string;
    transaction_id: string;
    group_id: number;
    deleted?: string;
}
export interface TransactionDetailRow {
    transaction_id: string;
    user_id: number;
    amount: number;
    owed_to_user_id: number;
    group_id: number;
    currency: string;
    deleted?: string;
    first_name: string;
}
export interface SplitAmount {
    user_id: string;
    amount: number;
    owed_to_user_id: string;
    currency: string;
}
export interface BatchStatement {
    sql: string;
    params: (string | number)[];
}
export interface UserBalance {
    user_id: string;
    owed_to_user_id: string;
    currency: string;
    amount: number;
}
export interface BudgetTotal {
    currency: string;
    amount: number;
}
export interface BudgetEntry {
    name: string;
    currency: string;
    amount: number;
}
export type UserBalancesByUser = Record<string, Record<string, number>>;
export interface SplitwiseResponse {
    id: number;
}
export interface TransactionCreateResponse {
    message: string;
    transactionId: string;
}
export interface UpdateGroupMetadataRequest {
    groupid: number;
    defaultShare?: Record<string, number>;
    defaultCurrency?: string;
    groupName?: string;
    budgets?: string[];
}
export interface UpdateGroupMetadataResponse {
    message: string;
    metadata: GroupMetadata;
}
