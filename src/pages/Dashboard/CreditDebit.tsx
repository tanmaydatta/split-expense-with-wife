import {
	ToggleButton,
	ToggleButtonGroup,
} from "@/components/ToggleButtonGroup";

interface SelectBudgetProps {
	budget: string;
	handleChangeBudget: (val: string) => void;
	disabled?: boolean;
}

export const CreditDebit: React.FC<SelectBudgetProps> = ({
	budget,
	handleChangeBudget,
	disabled = false,
}) => {
	return (
		<div data-test-id="credit-debit-toggle">
			<ToggleButtonGroup
				style={{ width: "100%" }}
				className="mb-2"
				data-test-id="credit-debit-group"
				name="credit-debit"
				value={budget}
				onChange={handleChangeBudget}
				disabled={disabled}
			>
				{["Credit", "Debit"].map((b: string) => (
					<ToggleButton
						key={b}
						id={`radio-${b}`}
						data-test-id={`${b.toLowerCase()}-radio`}
						type="radio"
						variant="outline-primary"
						value={b}
						checked={budget === b}
					>
						{b}
					</ToggleButton>
				))}
			</ToggleButtonGroup>
		</div>
	);
};
