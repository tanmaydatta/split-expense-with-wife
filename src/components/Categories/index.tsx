import React, { useEffect, useId, useState } from "react";
import { useCategories } from "@/hooks/useCategories";
import api from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UiButton } from "@/components/ui";
import type { RecordCategory, RecordKind } from "split-expense-shared-types";
import "./index.css";
export function CategorySelect({value,onChange,automatic=true,label="Category (optional)",disabled=false,automaticLabel="Automatic",automaticHelp="Chosen automatically when you save. You can choose a category instead."}:{value:string|null|undefined;onChange:(value:string|null|undefined)=>void;automatic?:boolean;label?:string;disabled?:boolean;automaticLabel?:string;automaticHelp?:string}) {
 const query=useCategories(),id=useId();if(!query.data?.enabled)return null;
 return <div className="category-field"><label htmlFor={id}>{label}</label><select id={id} value={value===undefined?"automatic":value===null?"uncategorised":value} disabled={disabled} onChange={e=>onChange(e.target.value==="automatic"?undefined:e.target.value==="uncategorised"?null:e.target.value)}>
 {automatic&&<option value="automatic">{automaticLabel}</option>}<option value="uncategorised">Uncategorised</option>
 {query.data.categories.filter(c=>!c.archivedAt||c.id===value).map(c=><option key={c.id} value={c.id}>{c.name}{c.archivedAt?" (archived)":""}</option>)}</select>
 {automatic&&value===undefined&&<small>{automaticHelp}</small>}</div>;
}
const categoryIcons: Record<string, string> = {
	groceries: "🛒",
	eating_out: "🍽",
	transport: "🚆",
	housing: "🏠",
	utilities: "💡",
	shopping: "🛍",
	health: "🩺",
	entertainment: "🎟",
	income: "💷",
	other: "🏷",
};
export function CategoryBadge({ record }: { record: RecordCategory }) {
	const query = useCategories();
	if (!query.data?.enabled) return null;
	const category = query.data.categories.find((category) => category.id === record.categoryId);
	const name = record.categoryName ?? category?.name ?? "Uncategorised";
	const icon = record.categoryId ? (categoryIcons[category?.slug ?? ""] ?? "🏷") : "❔";
	return (
		<span className="category-badge">
			<span className="category-badge-icon" aria-hidden="true">
				{icon}
			</span>
			<span className="category-badge-label">{name}</span>
		</span>
	);
}
export function CategoryEditor({kind,id,record,linked}:{kind:RecordKind;id:string;record:RecordCategory;linked?:RecordCategory}) {
 const query=useCategories(),client=useQueryClient();const [value,setValue]=useState<string|null>(record.categoryId??null);
 useEffect(()=>setValue(record.categoryId??null),[record.categoryId,record.categoryVersion]);
 const mutation=useMutation({mutationFn:async()=>api.post("/record-category",{kind,id,categoryId:value,version:record.categoryVersion??0}),onSuccess:()=>Promise.all(["transactions","transaction","budget","budgetEntry","linkedCategories"].map(key=>client.invalidateQueries({queryKey:[key]})))});
 if(!query.data?.enabled)return null;
 const conflict=linked && (linked.categoryId??null)!==(record.categoryId??null);
 return <div className="category-editor" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
 {conflict&&<p role="status">Linked categories differ. Choose one to align them.</p>}
 <CategorySelect automatic={false} value={value} onChange={v=>setValue(v??null)} disabled={mutation.isPending}/>
 <UiButton type="button" onClick={()=>mutation.mutate()} disabled={mutation.isPending||(!conflict&&value===(record.categoryId??null))}>{mutation.isPending?"Saving…":"Save category"}</UiButton>
 <small>Applies to linked expense and budget records.</small>{mutation.error&&<p role="alert">Could not update category. Refresh and try again.</p>}
 </div>;
}
