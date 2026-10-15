import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type {
	CategorySource,
	RecordKind,
	ReduxState,
} from "split-expense-shared-types";
import { useCategories } from "@/hooks/useCategories";
import api from "@/utils/api";
import {UiButton} from "@/components/ui";
import "./BulkCategories.css";
export type CategoryJobChange = {
	kind: RecordKind;
	id: string;
	categoryId: string;
	categoryName?: string;
	categorySource: CategorySource;
	categoryVersion: number;
};
type Job = {
	id: string;
	status: "queued" | "running" | "completed" | "failed";
	total: number;
	categorised: number;
	skipped: number;
	failed: number;
	changedRecords: number;
	error?: string;
	changes?: CategoryJobChange[];
};
export function useBulkCategories(
	kind: RecordKind,
	ids: string[],
	context: string,
	onComplete?: (changes: CategoryJobChange[]) => void,
) {
	const scope = useSelector(
		(s: ReduxState) =>
			`${s.value?.user?.id ?? ""}:${s.value?.extra?.group?.groupid ?? ""}`,
	);
	const enabled = Boolean(useCategories().data?.enabled);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [starting, setStarting] = useState(false),
		[error, setError] = useState("");
	const request = useRef<{
		requestId: string;
		records: { kind: RecordKind; id: string }[];
	} | null>(null);
	const callback = useRef(onComplete);
	callback.current = onComplete;
 const applied=useRef("");
 const [hidden,setHidden]=useState("");
 const loadedKey=ids.join("\u0000");
	const client = useQueryClient();
	const query = useQuery<{ job: Job | null }>({
		queryKey: ["category-job", scope],
		enabled,
		staleTime: 2000,
		retry: false,
		queryFn: async () => (await api.get("/category-jobs")).data,
		refetchInterval: (q) =>
			q.state.data?.job &&
			["queued", "running"].includes(q.state.data.job.status)
				? 2000
				: false,
		refetchIntervalInBackground: false,
	});
	const job = query.data?.job,
		active =
			starting || Boolean(job && ["queued", "running"].includes(job.status));
	// biome-ignore lint/correctness/useExhaustiveDependencies: selection belongs to the current list and authenticated scope.
	useEffect(() => {
		setSelected(new Set());
		request.current = null;
		setError("");
	}, [context, scope]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: replay completed metadata when a cached list or another loaded page arrives.
 useEffect(()=>{
 if(job?.status==='completed'){
 callback.current?.(job.changes??[]);
 if(applied.current!==job.id){applied.current=job.id;setSelected(new Set());}
 }
 },[job,loadedKey,context]);
	const toggle = (id: string) => {
		request.current = null;
		setSelected((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else if (next.size < 100) next.add(id);
			return next;
		});
	};
	const start = async () => {
		setStarting(true);
		setError("");
		try {
			request.current ??= {
				requestId: crypto.randomUUID(),
				records: Array.from(selected).map((id) => ({ kind, id })),
			};
			await client.cancelQueries({queryKey:["category-job",scope],exact:true});
			const { data } = await api.post<{ job: Job }>(
				"/category-jobs",
				request.current,
			);
			client.setQueryData(["category-job", scope], data);
			if (data.job.status === "failed")
				setError(
					data.job.error ?? "Could not start categorisation. Try again.",
				);
			else request.current = null;
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Could not start categorisation. Try again.",
			);
		} finally {
			setStarting(false);
		}
	};
	return {
		enabled,
		selected,
		active,
		job:hidden===job?.id?null:job,
 dismiss:()=>setHidden(job?.id??""),
		error: error || query.error?.message || "",
		toggle,
		selectPage: () => {
			request.current = null;
			setSelected(new Set(ids.slice(0, 100)));
		},
		clear: () => {
			request.current = null;
			setSelected(new Set());
		},
		start,
	};
}
export type BulkCategories = ReturnType<typeof useBulkCategories>;
export function BulkCategoryCheckbox({
	bulk,
	id,
	label,
}: {
	bulk: BulkCategories;
	id: string;
	label: string;
}) {
	if (!bulk.enabled) return null;
	return (
		<input
			type="checkbox"
			aria-label={`Select ${label}`}
			checked={bulk.selected.has(id)}
			disabled={
				bulk.active || (!bulk.selected.has(id) && bulk.selected.size >= 100)
			}
			onClick={(event) => event.stopPropagation()}
 onKeyDown={event=>event.stopPropagation()}
			onChange={() => bulk.toggle(id)}
		/>
	);
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: compact selection controls show active and terminal outcomes together.
export function BulkCategoryToolbar({ bulk }: { bulk: BulkCategories }) {
	if (!bulk.enabled) return null;
	const job = bulk.job;
	return (
		<section className="bulk-categories" aria-label="Bulk categorisation">
			<div className="bulk-category-actions">
				<UiButton type="button" disabled={bulk.active} onClick={bulk.selectPage}>
					Select this page
				</UiButton>
				<span>{bulk.selected.size} selected</span>
				<UiButton
					type="button" $tone="primary"
					disabled={bulk.active || bulk.selected.size === 0}
					onClick={() => void bulk.start()}
				>
					Auto-categorise
				</UiButton>
				{bulk.selected.size > 0 && (
					<UiButton type="button" disabled={bulk.active} onClick={bulk.clear}>
						Clear selection
					</UiButton>
				)}
			</div>
			<p>
				Select up to 100 entries. Linked expenses and budget entries are
				included. Saved categories and manually cleared Uncategorised choices
				are preserved.
			</p>
			{job && (
				<output aria-live="polite">
					{job.status === "completed"
						? `Completed: ${job.categorised} categorised, ${job.skipped} skipped, ${job.failed} failed. ${job.changedRecords} linked records updated.`
						: job.status === "failed"
							? (job.error ?? "Job failed. Select entries to try again.")
							: `${job.status === "queued" ? "Queued" : "Categorising"}: ${job.categorised + job.skipped + job.failed} of ${job.total} selected entries processed. You can leave this page and return.`}
				</output>
			)}
 {job&&["completed","failed"].includes(job.status)&&<UiButton type="button" onClick={bulk.dismiss}>Hide result</UiButton>}
			{bulk.error && <div role="alert">{bulk.error}</div>}
		</section>
	);
}

/** Completed background metadata must never replace a later explicit category edit. */
export function applyCategoryChange<T extends {categoryVersion?:number}>(row:T,change:CategoryJobChange|undefined):T{
 if(!change||(row.categoryVersion??0)>=change.categoryVersion)return row;
 const {kind:_kind,id:_id,...metadata}=change;
 return {...row,...metadata};
}

export function useBulkCategoryRows<T extends {categoryVersion?:number}>(kind:RecordKind,rows:T[],getId:(row:T)=>string,context:string,setRows:Dispatch<SetStateAction<T[]>>){
 return useBulkCategories(kind,rows.map(getId),context,changes=>{
 const byId=new Map(changes.filter(c=>c.kind===kind).map(c=>[c.id,c]));
 setRows(current=>current.map(row=>applyCategoryChange(row,byId.get(getId(row)))));
 });
}
