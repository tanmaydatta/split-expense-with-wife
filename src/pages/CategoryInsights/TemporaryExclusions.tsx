import { useEffect, useState } from "react";
import type { GroupCategory } from "split-expense-shared-types";
import { Surface, UiButton } from "@/components/ui";
export function temporaryCategoryIds(params: URLSearchParams) {
	return Array.from(new Set(params.getAll("exclude"))).sort();
}
export function applyTemporaryExclusions(
	params: URLSearchParams,
	ids: string[],
) {
	const next = new URLSearchParams(params);
	next.delete("exclude");
	Array.from(new Set(ids))
		.sort()
		.forEach((id) => next.append("exclude", id));
	return next;
}
export function TemporaryExclusions({
	categories,
	applied,
	onApply,
}: {
	categories: GroupCategory[];
	applied: string[];
	onApply: (ids: string[]) => void;
}) {
	const key = applied.join("\u0000"),
		[draft, setDraft] = useState(applied);
	// Synchronize when browser navigation or Reset changes the applied URL.
	useEffect(() => {
		setDraft(key ? key.split("\u0000") : []);
	}, [key]);
	const options = [
		{ id: "uncategorised", name: "Uncategorised", excludeFromInsights: false },
		...categories,
	];
	return (
		<Surface>
			<details className="insights-temporary">
				<summary>
					Temporary category exclusions ({applied.length} applied)
				</summary>
				<p className="insights-help">
					Exclude additional categories for this view only. Saved Settings
					exclusions still apply and cannot be overridden here. Reset clears
					only this temporary filter.
				</p>
				<fieldset>
					<legend>Categories to exclude from this view</legend>
					<div className="insights-exclusion-options">
						{options.map((category) => (
							<label key={category.id}>
								<input
									type="checkbox"
									checked={
										Boolean(category.excludeFromInsights) ||
										draft.includes(category.id)
									}
									disabled={Boolean(category.excludeFromInsights)}
									onChange={(event) =>
										setDraft((previous) =>
											event.target.checked
												? [...previous, category.id]
												: previous.filter((id) => id !== category.id),
										)
									}
								/>
								<span>
									{category.name}
									{category.excludeFromInsights
										? " · excluded in Settings"
										: ""}
								</span>
							</label>
						))}
					</div>
				</fieldset>
				<div className="insights-filter-actions">
					<UiButton
						type="button"
						$tone="primary"
						onClick={() => onApply(draft)}
					>
						Apply exclusions
					</UiButton>
					<UiButton
						type="button"
						onClick={() => {
							setDraft([]);
							onApply([]);
						}}
					>
						Reset temporary exclusions
					</UiButton>
				</div>
			</details>
		</Surface>
	);
}
