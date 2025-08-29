import React from "react";
import { useBalances } from "@/hooks/useBalances";
import { Loader } from "@/components/Loader";
import { AmountGrid, AmountItem } from "@/components/AmountGrid";
import "./index.css";

const Balances: React.FC = () => {
	const { data: balances, isLoading, error } = useBalances();

	if (isLoading) {
		return <Loader />;
	}

	if (error) {
		return (
			<div className="balances-container" data-test-id="balances-container">
				<div className="empty-state">
					Error loading balances: {error.message}
				</div>
			</div>
		);
	}

	if (!balances || balances.size === 0) {
		return (
			<div className="balances-container" data-test-id="balances-container">
				<div className="empty-state" data-test-id="empty-balances">
					No balances to display
				</div>
			</div>
		);
	}

	return (
		<div className="balances-container" data-test-id="balances-container">
			{Array.from(balances, ([userName, userBalances]) => {
				const amounts: AmountItem[] = Array.from(
					userBalances,
					([currency, amount]) => ({
						currency,
						amount,
					}),
				);

				return (
					<div
						key={userName}
						className="balance-section"
						data-test-id={`balance-section-${userName.toLowerCase()}`}
					>
						<h3
							className="user-header"
							data-test-id={`user-header-${userName.toLowerCase()}`}
						>
							{userName}
						</h3>
						<AmountGrid amounts={amounts} />
					</div>
				);
			})}
		</div>
	);
};

export default Balances;
