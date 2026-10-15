import type { GroupCategory } from "split-expense-shared-types";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { CategorySelect } from "@/components/Categories";
import { Card } from "@/components/Card";
import { UiButton } from "@/components/ui";
import api from "@/utils/api";
export function CategoriesSection() {
 const query=useCategories(),client=useQueryClient();const [name,setName]=useState("");const [pattern,setPattern]=useState("");const [kind,setKind]=useState("merchant");const [categoryId,setCategoryId]=useState<string|null|undefined>(null);const [consent,setConsent]=useState(false);
 const mutation=useMutation({mutationFn:async(body:unknown)=>api.post("/categories",body),onSuccess:()=>Promise.all(["categories","category-insights"].map(key=>client.invalidateQueries({queryKey:[key]})))});
 if(!query.data?.enabled)return null;
 return <Card className="settings-card category-settings"><h3>Transaction categories</h3><p>Categories describe purchases; budgets track the money set aside.</p>
 <p>Exclude a category explicitly for internal transfers or other movements you do not want in spending insights. This changes insights only; saved entries and their categories stay unchanged.</p>
 <ul className="category-settings-list">
  {query.data.categories.map(category => (
   <CategorySettingsRow
    key={category.id}
    category={category}
    pending={mutation.isPending}
    onArchive={() => mutation.mutate({action:"archive",id:category.id,archived:!category.archivedAt})}
    onExclusion={excluded => mutation.mutate({action:"insight-exclusion",id:category.id,excluded})}
   />
  ))}
 </ul>
 <div className="category-settings-create"><label>New category<input maxLength={50} value={name} onChange={e=>setName(e.target.value)} /></label><UiButton type="button" disabled={mutation.isPending||!name.trim()} onClick={()=>mutation.mutate({action:"create",name:name.trim()},{onSuccess:()=>setName("")})}>Add category</UiButton></div>
 <details><summary>Automatic category rules</summary><p>Rules affect future records in this group. Saved records keep their categories.</p>
 <label>Match<select value={kind} onChange={e=>setKind(e.target.value)}><option value="merchant">Always this exact merchant</option><option value="description">Description contains this text</option></select></label>
 <label>Text to match<input maxLength={160} value={pattern} onChange={e=>setPattern(e.target.value)} /></label>
 <CategorySelect label="Category" automatic={false} value={categoryId} onChange={setCategoryId}/>
 <label className="category-rule-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Share this text as a rule for everyone in this group. Private bank text is shared only by this explicit action.</label>
 <UiButton type="button" disabled={mutation.isPending||!consent||!categoryId||pattern.trim().length<2} onClick={()=>mutation.mutate({action:"rule",pattern:pattern.trim(),kind,categoryId,sharedGroupConsent:true},{onSuccess:()=>{setPattern("");setConsent(false)}})}>Save group rule</UiButton>
 {query.data.rules?.map(r=><div className="category-rule-row" key={r.id}><span>{r.kind}: {r.pattern} → {query.data?.categories.find(c=>c.id===r.categoryId)?.name}</span><UiButton type="button" disabled={mutation.isPending} onClick={()=>mutation.mutate({action:"delete-rule",id:r.id})}>Remove</UiButton></div>)}
 </details>{mutation.error&&<p role="alert">Could not change categories. Check the name, active category and group limits, then try again.</p>}</Card>;
}

function CategorySettingsRow({
	category,
	pending,
	onArchive,
	onExclusion,
}: {
	category: GroupCategory;
	pending: boolean;
	onArchive: () => void;
	onExclusion: (excluded: boolean) => void;
}) {
	return (
		<li>
			<div className="category-settings-identity">
				<span>
					{category.name}
					{category.archivedAt ? " · archived" : ""}
				</span>
				<label className="category-insight-exclusion">
					<input
						type="checkbox"
						aria-label={`Exclude ${category.name} from spending insights`}
						checked={Boolean(category.excludeFromInsights)}
						disabled={pending}
						onChange={(event) => onExclusion(event.target.checked)}
					/>
					Exclude from spending insights
				</label>
			</div>
			<UiButton type="button" disabled={pending} onClick={onArchive}>
				{category.archivedAt ? "Restore" : "Archive"}
			</UiButton>
		</li>
	);
}
