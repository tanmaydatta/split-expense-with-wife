import { expect } from "@playwright/test";
import type { TestHelper } from "./test-utils";
import { getCITimeout } from "./test-utils";

export class ScheduledActionsTestHelper {
	constructor(private readonly authenticatedPage: TestHelper) {}

	async gotoNewActionPage(): Promise<void> {
		await this.authenticatedPage.page.goto("/scheduled-actions/new");
		// Helpful debug
		console.log("navigated to:", this.authenticatedPage.page.url());
		await expect(
			this.authenticatedPage.page.locator(
				'[data-test-id="scheduled-actions-new"]',
			),
		).toBeVisible({ timeout: getCITimeout(20000) });
		await expect(
			this.authenticatedPage.page.locator(
				'[data-test-id="scheduled-actions-manager"]',
			),
		).toBeVisible({ timeout: getCITimeout(20000) });
	}

	async gotoListPage(): Promise<void> {
		await this.authenticatedPage.page.goto("/scheduled-actions");
		await this.authenticatedPage.page.waitForTimeout(2000);
		console.log("navigated to:", this.authenticatedPage.page.url());
		await expect(
			this.authenticatedPage.page.locator(
				'[data-test-id="scheduled-actions-page"]',
			),
		).toBeVisible({ timeout: getCITimeout(20000) });
	}

	async createExpenseAction(params: {
		description: string;
		amount: string | number;
		paidByValue?: string; // select option value; if not provided, pick first available
	}): Promise<string> {
		await this.gotoNewActionPage();
		const { description, amount, paidByValue } = params;

		await this.authenticatedPage.page.getByTestId("sa-action-expense").click();
		await this.authenticatedPage.page
			.getByTestId("sa-exp-description")
			.fill(description);
		await this.authenticatedPage.page
			.getByTestId("sa-exp-amount")
			.fill(String(amount));

		const paidBySelect =
			this.authenticatedPage.page.getByTestId("sa-exp-paid-by");
		if ((await paidBySelect.count()) > 0) {
			if (paidByValue) {
				await paidBySelect.selectOption(paidByValue);
			} else {
				const firstVal = await paidBySelect
					.locator("option")
					.nth(1)
					.getAttribute("value");
				if (firstVal) await paidBySelect.selectOption(firstVal);
			}
		}

		// capture start date shown in form before submit
		const startDate = await this.authenticatedPage.page
			.locator('[data-test-id="sa-start-date"]')
			.inputValue();

		await this.submitAndConfirmSuccess();
		return startDate;
	}

	async createBudgetAction(params: {
		description: string;
		amount: string | number;
		currencyLabel?: string; // optional currency label to select; default first
		selectFirstBudget?: boolean;
	}): Promise<string> {
		await this.gotoNewActionPage();
		const {
			description,
			amount,
			currencyLabel,
			selectFirstBudget = true,
		} = params;

		await this.authenticatedPage.page.getByTestId("sa-action-budget").click();
		await this.authenticatedPage.page
			.getByTestId("sa-bud-description")
			.fill(description);
		await this.authenticatedPage.page
			.getByTestId("sa-bud-amount")
			.fill(String(amount));

		const currencySelect =
			this.authenticatedPage.page.getByTestId("sa-bud-currency");
		if (currencyLabel) {
			await currencySelect.selectOption({ label: currencyLabel });
		} else {
			const firstLabel =
				(await currencySelect.locator("option").first().textContent()) ||
				undefined;
			if (firstLabel) {
				await currencySelect.selectOption({ label: firstLabel });
			}
		}

		if (selectFirstBudget) {
			const firstBudget = this.authenticatedPage.page
				.locator('[data-test-id^="budget-radio-"]')
				.first();
			if ((await firstBudget.count()) > 0) {
				await firstBudget.click();
			}
		}

		const startDate = await this.authenticatedPage.page
			.locator('[data-test-id="sa-start-date"]')
			.inputValue();

		await this.submitAndConfirmSuccess();
		return startDate;
	}

	async submitAndConfirmSuccess(): Promise<void> {
		await this.authenticatedPage.page.getByTestId("sa-submit").click();
		await this.authenticatedPage.page.waitForTimeout(2000);
		await expect(
			this.authenticatedPage.page.getByTestId("success-container"),
		).toBeVisible();
	}

	async expectActionCardVisible(params: {
		description: string;
		containsText?: string | RegExp;
	}): Promise<void> {
		const { description, containsText } = params;
		const card = this.authenticatedPage.page
			.locator(".settings-card")
			.filter({ hasText: description });
		await expect(card.first()).toBeVisible();
		if (containsText) {
			const expected =
				typeof containsText === "string"
					? new RegExp(containsText, "i")
					: containsText;
			await expect(card.first()).toContainText(expected as RegExp);
		}
	}

	async expectActionCardMeta(params: {
		description: string;
		frequency?: string; // daily/weekly/monthly (case-insensitive)
		typeText?: "Add Expense" | "Add to Budget";
		nextDate?: string; // YYYY-MM-DD, optional if startDate provided
		startDate?: string; // YYYY-MM-DD to derive expected next based on server logic
	}): Promise<void> {
		const { description, frequency, typeText } = params;
		const card = this.authenticatedPage.page
			.locator(".settings-card")
			.filter({ hasText: description })
			.first();
		await expect(card).toBeVisible();

		if (frequency) await expect(card).toContainText(new RegExp(frequency, "i"));
		if (typeText) await expect(card).toContainText(typeText);
		// Next date assertion with tolerance to avoid midnight/TZ flakes
		const text = (await card.textContent()) || "";
		const match = text.match(/Next:\s*(\d{4}-\d{2}-\d{2})/);
		expect(match).not.toBeNull();
		const shown = match ? match[1] : "";
		const allowed = new Set<string>();
		const addDays = (iso: string, d: number) => {
			const dt = new Date(iso);
			dt.setUTCDate(dt.getUTCDate() + d);
			return dt.toISOString().split("T")[0];
		};
		if (params.nextDate) {
			allowed.add(params.nextDate);
			allowed.add(addDays(params.nextDate, 1));
			allowed.add(addDays(params.nextDate, -1));
		} else if (params.startDate && frequency) {
			const expectedNext = this.calculateNextExecutionDateLikeServer(
				params.startDate,
				frequency.toLowerCase() as "daily" | "weekly" | "monthly",
			);
			allowed.add(expectedNext);
			allowed.add(params.startDate);
			allowed.add(addDays(params.startDate, 1));
			allowed.add(addDays(params.startDate, -1));
		}
		if (allowed.size > 0) {
			expect(Array.from(allowed)).toContain(shown);
		}
	}

	private calculateNextExecutionDateLikeServer(
		startDate: string,
		frequency: "daily" | "weekly" | "monthly",
	): string {
		const start = new Date(startDate); // parsed as UTC midnight
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		if (start > today) return startDate;
		const originalTargetDay = start.getUTCDate();
		const next = new Date(start);
		while (next <= today) {
			if (frequency === "daily") {
				next.setUTCDate(next.getUTCDate() + 1);
			} else if (frequency === "weekly") {
				next.setUTCDate(next.getUTCDate() + 7);
			} else {
				// monthly
				const targetMonth = next.getUTCMonth() + 1;
				const targetYear = next.getUTCFullYear() + Math.floor(targetMonth / 12);
				const normalizedMonth = ((targetMonth % 12) + 12) % 12;
				const firstOfTarget = new Date(
					Date.UTC(targetYear, normalizedMonth, 1),
				);
				const lastDay = new Date(
					Date.UTC(targetYear, normalizedMonth + 1, 0),
				).getUTCDate();
				const day = Math.min(originalTargetDay, lastDay);
				firstOfTarget.setUTCDate(day);
				next.setTime(firstOfTarget.getTime());
			}
		}
		return next.toISOString().split("T")[0];
	}

	private async findCard(description: string) {
		return this.authenticatedPage.page
			.locator(".settings-card")
			.filter({ hasText: description });
	}

	async openEditForAction(description: string): Promise<void> {
		await this.gotoListPage();
		const card = await this.findCard(description);
		await expect(card.first()).toBeVisible();
		await card.first().locator('[data-test-id^="sa-edit-"]').click();
		await expect(
			this.authenticatedPage.page.getByTestId("scheduled-actions-edit"),
		).toBeVisible();
	}

	async changeFrequencyWeekly(): Promise<void> {
		await this.authenticatedPage.page
			.getByTestId("sa-frequency-weekly")
			.click();
	}

	async changeExpenseAmount(amount: string | number): Promise<void> {
		await this.authenticatedPage.page
			.getByTestId("sa-exp-amount")
			.fill(String(amount));
	}

	async deleteAction(description: string, opts?: { confirm?: boolean }) {
		await this.gotoListPage();
		const card = await this.findCard(description);
		await expect(card.first()).toBeVisible();
		const deleteBtn = card.first().locator('[data-test-id^="sa-delete-"]');
		const deleteBtnTestId = await deleteBtn.getAttribute("data-test-id");
		const actionId = deleteBtnTestId?.replace("sa-delete-", "");
		await deleteBtn.click();
		const dialog = this.authenticatedPage.page
			.getByRole("dialog", { name: "Delete action?" })
			.first();
		await expect(dialog).toBeVisible();
		if (opts?.confirm === false) {
			await dialog
				.getByRole("button", { name: "Cancel" })
				.click({ force: true });
			await expect(card.first()).toBeVisible();
		} else {
			await dialog
				.getByRole("button", { name: "Delete" })
				.click({ force: true });
			if (actionId) {
				await expect(
					this.authenticatedPage.page.locator(
						`[data-test-id="sa-item-${actionId}"]`,
					),
				).toHaveCount(0);
			} else {
				// Fallback: remove by description if id not found (less precise)
				await expect(
					this.authenticatedPage.page
						.locator(".settings-card")
						.filter({ hasText: description }),
				).toHaveCount(0);
			}
		}
	}

	async openHistoryForAction(description: string): Promise<void> {
		await this.gotoListPage();
		const card = await this.findCard(description);
		await expect(card.first()).toBeVisible();
		await card.first().getByText(description).click();
		await expect(
			this.authenticatedPage.page.getByTestId("scheduled-actions-history"),
		).toBeVisible();
		await this.authenticatedPage.page.waitForTimeout(2000); // allow re-render
	}

	async getActionIdFromCard(description: string): Promise<string | null> {
		await this.gotoListPage();
		const card = await this.findCard(description);
		await expect(card.first()).toBeVisible();
		const editBtn = card.first().locator('[data-test-id^="sa-edit-"]');
		const editTestId = await editBtn.getAttribute("data-test-id");
		return editTestId ? editTestId.replace("sa-edit-", "") : null;
	}
}
