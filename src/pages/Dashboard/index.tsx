import { useLinkedCategories } from "@/hooks/useLinkedCategories";
import { CategorySelect } from "@/components/Categories";
import { Button } from "@/components/Button";
import { ButtonRow, FormContainer } from "@/components/Form/Layout";
import { Loader } from "@/components/Loader";
import { Surface, UiPageDescription, UiPageTitle } from "@/components/ui";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { useDashboardSubmit } from "@/hooks/useDashboard";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { DashboardUser, ReduxState } from "split-expense-shared-types";
import { DashboardFormSchema } from "split-expense-shared-types";
import {
	DescriptionField,
	AmountField,
	SplitPercentageFields,
	CurrencyField,
	PaidByField,
	BudgetFields,
	ActionSelection,
} from "./FormFields";
import { buildDefaultFormValues } from "./helpers";
import {
	createFormSubmitHandler,
	createUserPercentageUpdater,
	getSuccessMessage,
} from "./formHandlers";
import "./index.css";

import { useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/utils/api";
import { SelectBudget } from "@/SelectBudget";
import { CURRENCIES } from "split-expense-shared-types";
import type { Currency } from "split-expense-shared-types";
import type { BankTransaction } from "../BankImport/types";
import { bankAmount } from "../BankImport/types";

function buildBankDefaultValues(data: ReduxState["value"], budgets: Parameters<typeof buildDefaultFormValues>[1], row: BankTransaction, mode: string) {
 const defaults = buildDefaultFormValues(data, budgets);
 const digits = new Intl.NumberFormat("en", { style: "currency", currency: row.currency }).resolvedOptions().maximumFractionDigits ?? 2;
 defaults.amount = Math.abs(row.amountMinor) / 10 ** digits;
 defaults.currency = row.currency as Currency;
 defaults.description = row.name.slice(0, 100);
 defaults.paidBy = data?.extra?.currentUser?.id || data?.user?.id || "";
 defaults.creditDebit = row.amountMinor > 0 ? "Debit" : "Credit";
 defaults.addExpense = mode !== "budget" && row.amountMinor > 0 && !row.linkedTransactionId;
 defaults.updateBudget = mode !== "expense" && !row.linkedBudgetEntryId;
 return defaults;
}

function BankSourceBanner({ source }: { source: BankTransaction }) {
 return <Surface className="bank-add-source">
  <div className="bank-add-source-top">
   <div><p className="bank-add-eyebrow">Bank activity</p><h2>{source.name}</h2></div>
   <strong className="bank-add-amount">{bankAmount(Math.abs(source.amountMinor), source.currency)}</strong>
  </div>
  <p className="bank-add-meta">{source.date} · {source.accountName || "Bank account"} · {source.currency} · {source.amountMinor > 0 ? "Money out" : "Money in"}</p>
  <p className="bank-add-hint">Amount, currency and date come from your bank. Edit the description, payer, splits and budget below.</p>
  {source.linkedTransactionId && <p>The expense is already associated.</p>}
  {source.linkedBudgetEntryId && <p>The budget entry is already associated.</p>}
 </Surface>;
}

function BankActionFields({ form, source, loading, updateBudget }: { form: any; source: BankTransaction; loading: boolean; updateBudget: boolean }) {
 const expenseAvailable = source.amountMinor > 0 && !source.linkedTransactionId;
 const budgetAvailable = !source.linkedBudgetEntryId;
 return <>
  {updateBudget && <div className="bank-add-budget"><p className="bank-add-field-label">Budget</p><form.Field name="budgetId">{(field: any) => <SelectBudget budgetId={field.state.value || ""} handleChangeBudget={value => field.handleChange(value)} disabled={loading} />}</form.Field></div>}
  <div className="action-selection">
   <p>Choose records to add:</p>
   <div className="bank-add-options">
   {expenseAvailable && <form.Field name="addExpense">{(field: any) => <label className="bank-add-option"><input type="checkbox" checked={field.state.value} onChange={event => field.handleChange(event.target.checked)} disabled={loading} /> Add expense</label>}</form.Field>}
   {budgetAvailable && <form.Field name="updateBudget">{(field: any) => <label className="bank-add-option"><input type="checkbox" checked={field.state.value} onChange={event => field.handleChange(event.target.checked)} disabled={loading} /> Add budget {source.amountMinor > 0 ? "debit" : "credit"}</label>}</form.Field>}
   </div>
  </div>
 </>;
}

// eslint-disable-next-line max-lines-per-function -- Unified financial form preserves reviewed bank snapshot and category submission together.
function Dashboard(): JSX.Element {
	// React Query hook for form submission
	const dashboardSubmit = useDashboardSubmit();
 const [categoryId,setCategoryId]=useState<string|null|undefined>(undefined);

	// Keep some state for session-dependent logic
	const [usersState, setUsersState] = useState<DashboardUser[]>([]);
	const initializedKey = useRef<string | null>(null);
	const [bankSnapshot, setBankSnapshot] = useState<{ key: string; row: BankTransaction; defaults: ReturnType<typeof buildDefaultFormValues> } | null>(null);
	const { id: bankId } = useParams<{ id: string }>();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const requestedMode = searchParams.get("mode") ?? "both";
	const mode = ["expense", "budget", "both"].includes(requestedMode) ? requestedMode : "both";

	// Get auth data from the data store (where login puts it)
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	const userId = data?.user?.id;
	const groupId = data?.extra?.group?.groupid;
	const initializationKey = `${userId ?? ""}:${groupId ?? ""}:${bankId ?? "ordinary"}:${bankId ? mode : ""}`;
 useEffect(()=>setCategoryId(undefined),[initializationKey]);
	const bankQuery = useQuery({
		queryKey: ["bank", "transaction", userId, groupId, bankId],
		enabled: Boolean(bankId && userId && groupId),
		queryFn: async () => {
			const response = await api.get<{ transaction: BankTransaction }>("/bank-import/transaction", { params: { id: bankId } });
			return response.data.transaction;
		},
		retry: false,
	});
	// Keep the version the user actually reviewed. Background refetches must not
	// replace unsaved choices or silently advance the version submitted to the API.
	const bankSource = bankSnapshot?.key === initializationKey ? bankSnapshot.row : null;
	const retainedCategories=useLinkedCategories(bankSource?.linkedTransactionId,bankSource?.linkedBudgetEntryId);
	const reviewPath = bankId ? `/bank-import/transactions/${encodeURIComponent(bankId)}` : "/bank-import";
	const sourceUnavailable = Boolean(bankId && bankQuery.data && (
		bankQuery.data.pending || bankQuery.data.readonlySnapshot || bankQuery.data.removedAt ||
		bankQuery.data.reviewStatus === "ignored" || bankQuery.data.rowVersion === undefined ||
		bankQuery.data.amountMinor === 0 || !(CURRENCIES as readonly string[]).includes(bankQuery.data.currency)
	));

	// Calculate default form values from session data
	const getDefaultValues = useCallback(() => {
		return buildDefaultFormValues(data, budgets);
	}, [data, budgets]);

	// Create submit handler
	const handleSubmit = createFormSubmitHandler(dashboardSubmit, data, { categoryId, onSaved:()=>setCategoryId(undefined), categoryVersions:Object.fromEntries(Object.entries(retainedCategories.data??{}).map(([key,value])=>[key,value.categoryVersion??0])), ...(bankSource ? {
		bankSource: { bankTransactionId: bankSource.id, sourceVersion: bankSource.rowVersion! },
		onSuccess: () => navigate(reviewPath),
	} : {}) });

	// TanStack Form setup
	const form = useForm({
		defaultValues: bankSnapshot?.key === initializationKey ? bankSnapshot.defaults : getDefaultValues(),
		validators: {
			onChange: DashboardFormSchema,
		},
		onSubmit: (options) => handleSubmit(options, form),
	});

	// Use reactive form state for conditional rendering
	const addExpense = useStore(
		form.store,
		(state: any) => state.values.addExpense,
	);
	const updateBudget = useStore(
		form.store,
		(state: any) => state.values.updateBudget,
	);
	const users = useStore(form.store, (state: any) => state.values.users || []);

	// Initialize form with session data when available
	useEffect(() => {
		// AppWrapper ensures we're authenticated, but data might still be loading
		if (!data?.extra?.usersById) {
			return; // Wait for session data to load
		}

		// Get users from session data
		const usersFromAuth: DashboardUser[] = Object.values(
			data.extra.usersById,
		).map((v) => ({
			FirstName: v.firstName,
			Id: v.id,
		}));
		setUsersState(usersFromAuth);

		if (initializedKey.current === initializationKey) return;
		if (bankId && (!bankQuery.data || sourceUnavailable)) return;
		const defaults = bankId && bankQuery.data ? buildBankDefaultValues(data, budgets, bankQuery.data, mode) : getDefaultValues();
		if (bankId && bankQuery.data) setBankSnapshot({ key: initializationKey, row: bankQuery.data, defaults });
		else setBankSnapshot(null);
		form.reset(defaults);
		initializedKey.current = initializationKey;
	}, [data, initializationKey, bankId, bankQuery.data, sourceUnavailable, mode, userId, budgets, getDefaultValues, form]);

	// Helper function to update user percentage in form state
	const updateUserPercentage = createUserPercentageUpdater(form);

	// React Query state variables
	const loading = dashboardSubmit.isPending;
	const error = dashboardSubmit.error?.message || "";
	const success = getSuccessMessage(dashboardSubmit);

	// Show loading while session data is being fetched
	if (!data?.extra?.usersById || (bankId && bankQuery.isPending)) {
		return <Loader />;
	}
	if (bankId && (bankQuery.isError || sourceUnavailable || !bankQuery.data)) {
		return <Surface><h1>Bank activity unavailable</h1><p>This activity changed, is pending, or cannot be used to create shared records. Return to review and refresh.</p><Link to={reviewPath}>Return to bank review</Link></Surface>;
	}
	if (bankId && !bankSource) return <Loader />;

	return (
		<div className={`dashboard-container${bankSource ? " bank-add-dashboard" : ""}`} data-test-id="dashboard-container">
			<header className={bankSource ? "bank-add-header" : undefined}>
				<UiPageTitle>{bankSource ? "Add from bank activity" : "Add an expense"}</UiPageTitle>
				<UiPageDescription>Record a shared expense, update a budget, or do both at once.</UiPageDescription>
			</header>
			{bankSource && <BankSourceBanner source={bankSource} />}
			<Surface className="dashboard-form-surface">
			<FormContainer className={bankSource ? "bank-add-form" : undefined} data-test-id="expense-form">
				{/* Error Container */}
				{error && (
					<ErrorContainer
						message={error}
						onClose={() => dashboardSubmit.reset()}
					/>
				)}

				{/* Success Container */}
				{success && (
					<SuccessContainer
						message={success}
						onClose={() => dashboardSubmit.reset()}
						data-test-id="success-container"
					/>
				)}

				<DescriptionField form={form} loading={loading} />
 <CategorySelect automaticLabel={bankSource?.linkedTransactionId||bankSource?.linkedBudgetEntryId?"Keep existing category":"Automatic"} automaticHelp={bankSource?.linkedTransactionId||bankSource?.linkedBudgetEntryId?"Uses the linked record’s category unless you choose a shared category.":undefined} value={categoryId} onChange={setCategoryId} disabled={loading||retainedCategories.isFetching}/>
				<AmountField form={form} loading={loading || Boolean(bankSource)} />

				<SplitPercentageFields
                    className={bankSource ? "bank-add-splits" : undefined}
					users={users}
					updateUserPercentage={updateUserPercentage}
					loading={loading}
					addExpense={addExpense}
				/>

				<CurrencyField form={form} loading={loading || Boolean(bankSource)} />

				<PaidByField
					form={form}
					loading={loading}
					addExpense={addExpense}
					usersState={usersState}
				/>

				{bankSource ? <BankActionFields form={form} source={bankSource} loading={loading} updateBudget={updateBudget} /> :
					<><BudgetFields form={form} loading={loading} updateBudget={updateBudget} /><ActionSelection form={form} loading={loading} /></>}

				{/* Single submit button */}
				<ButtonRow>
					<Button
						type="submit"
						data-test-id="submit-button"
						onClick={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
						disabled={loading || (Boolean(bankSource) && !addExpense && !updateBudget)}
						className="submit-button"
					>
						{loading ? "Processing..." : bankSource ? "Save and associate" : "Submit"}
					</Button>
					{bankSource && <Button type="button" disabled={loading} onClick={() => navigate(reviewPath)}>Cancel</Button>}
				</ButtonRow>
			</FormContainer>
			</Surface>
		</div>
	);
}

export default Dashboard;
