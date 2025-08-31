import React from "react";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";
import type { User } from "split-expense-shared-types";

interface SharesSectionProps {
	users: User[];
	userPercentages: Record<string, number>;
	onUpdateUserPercentage: (userId: string, percentage: number) => void;
	totalPercentage: number;
}

export const SharesSection: React.FC<SharesSectionProps> = ({
	users,
	userPercentages,
	onUpdateUserPercentage,
	totalPercentage,
}) => {
	return (
		<Card className="settings-card" data-test-id="shares-section">
			<h3>Default Share Percentages</h3>
			<div className="shares-form">
				{users.map((user: User) => (
					<div key={user.Id} className="form-group">
						<label htmlFor={`user-${user.Id}`}>
							{user.FirstName}
							{user.LastName ? ` ${user.LastName}` : ""}
						</label>
						<div
							className="percentage-input-wrapper"
							data-test-id={`percentage-wrapper-${user.Id}`}
						>
							<Input
								id={`user-${user.Id}`}
								type="number"
								min="0"
								max="100"
								step="0.01"
								value={userPercentages[user.Id.toString()]?.toString() || "0"}
								onChange={(e) =>
									onUpdateUserPercentage(
										user.Id.toString(),
										parseFloat(e.target.value) || 0,
									)
								}
								className="percentage-input"
								data-test-id={`user-${user.Id}-percentage`}
							/>
							<span
								className="percentage-symbol"
								data-test-id="percentage-symbol"
							>
								%
							</span>
						</div>
					</div>
				))}
				<div
					className={`total-percentage ${Math.abs(totalPercentage - 100) > 0.001 ? "invalid" : "valid"}`}
					data-test-id="total-percentage"
				>
					Total: {totalPercentage.toFixed(2)}%
				</div>
			</div>
		</Card>
	);
};
