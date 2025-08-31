import React from "react";
import { Card } from "@/components/Card";
import { Select } from "@/components/Form/Select";

interface CurrencySectionProps {
	defaultCurrency: string;
	onCurrencyChange: (value: string) => void;
	availableCurrencies: string[];
	isLoading: boolean;
}

export const CurrencySection: React.FC<CurrencySectionProps> = ({
	defaultCurrency,
	onCurrencyChange,
	availableCurrencies,
	isLoading,
}) => {
	return (
		<Card className="settings-card" data-test-id="currency-section">
			<h3>Default Currency</h3>
			<div className="form-group">
				<label htmlFor="defaultCurrency">Currency</label>
				<Select
					id="defaultCurrency"
					value={defaultCurrency}
					onChange={(e) => onCurrencyChange(e.target.value)}
					className="currency-select"
					name="defaultCurrency"
					data-test-id="currency-select"
					disabled={isLoading}
					required
					title="Please select a currency"
				>
					{availableCurrencies.map((currency: string) => (
						<option key={currency} value={currency}>
							{currency}
						</option>
					))}
				</Select>
			</div>
		</Card>
	);
};
