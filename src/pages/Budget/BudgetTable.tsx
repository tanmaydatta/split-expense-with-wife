import { BudgetCard } from "@/components/BudgetCard";
import { BudgetEntryCard } from "@/components/BudgetEntryCard";
import { Trash } from "@/components/Icons";
import { Table, TableWrapper } from "@/components/Table";
import { useBudgetEntry } from "@/hooks/useBudgetEntry";
import { getCurrencySymbol } from "@/utils/currency";
import { dateToFullStr } from "@/utils/date";
import React, { useState } from "react";
import type { BudgetEntry } from "split-expense-shared-types";

interface Props {
	entries: BudgetEntry[];
	onDelete(id: string): void;
}

function ExpandedBudgetRow({ entry, onDelete }: { entry: BudgetEntry; onDelete(id: string): void }) {
	const { data } = useBudgetEntry(entry.id);
	return (
		<tr>
			<td colSpan={4}>
				<BudgetEntryCard
					budgetEntry={entry}
					onDelete={onDelete}
					linkedTransaction={data?.linkedTransaction}
					linkedTransactionUsers={data?.linkedTransactionUsers}
				/>
			</td>
		</tr>
	);
}

export default function BudgetTable(props: Props): JSX.Element {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const handleRowClick = (id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	};

	return (
		<>
			{/* Desktop Table View */}
			<div className="desktop-table" data-test-id="desktop-table">
				<TableWrapper>
					<Table>
						<thead>
							<tr>
								<th>Date</th>
								<th>Description</th>
								<th>Amount</th>
								<th>Deleted</th>
							</tr>
						</thead>
						<tbody>
							{props.entries.map((e) => {
								const isExpanded = expandedId === e.id;
								return (
									<React.Fragment key={e.addedTime}>
										<tr
											className="budget-row"
											style={{ cursor: "pointer" }}
											onClick={() => handleRowClick(e.id)}
											data-test-id="budget-entry-item"
											data-budget-entry-id={e.id}
										>
											<td>{dateToFullStr(new Date(e.addedTime))}</td>
											<td className="description-cell">
												{e.description}
												{(e.linkedTransactionIds?.length ?? 0) > 0 && (
													<span
														data-test-id="budget-entry-linked-icon"
														title="Linked to an expense"
														style={{ marginLeft: 6, fontSize: "0.85em", opacity: 0.8 }}
													>
														🔗
													</span>
												)}
											</td>
											<td
												style={{
													color: e.price.startsWith("+") ? "green" : "red",
												}}
											>
												{e.price[0]}
												{getCurrencySymbol(e.currency)}
												{e.price.substring(1)}
											</td>
											<td
												style={{
													textAlign: "center",
												}}
											>
												{e.deleted != null ? (
													dateToFullStr(new Date(e.deleted))
												) : (
													<button
														className="delete-button"
														data-test-id="delete-button"
														onClick={(ev) => {
															ev.stopPropagation();
															props.onDelete(e.id);
														}}
														style={{
															background: "none",
															border: "none",
															cursor: "pointer",
															padding: "4px",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															margin: "0 auto",
														}}
														aria-label="Delete budget entry"
													>
														<Trash />
													</button>
												)}
											</td>
										</tr>
										{isExpanded && (
											<ExpandedBudgetRow entry={e} onDelete={props.onDelete} />
										)}
									</React.Fragment>
								);
							})}
						</tbody>
					</Table>
				</TableWrapper>
			</div>

			{/* Mobile Card View */}
			<div className="mobile-cards" data-test-id="mobile-cards">
				{props.entries.map((e) => (
					<BudgetCard key={e.addedTime} entry={e} onDelete={props.onDelete} />
				))}
			</div>
		</>
	);
}

export function dateToStr(d: Date): string {
	return d.toTimeString().split(" ")[0] + " " + d.toDateString();
}
