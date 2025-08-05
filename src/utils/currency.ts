import getSymbolFromCurrency from "currency-symbol-map";

/**
 * Get currency symbol with custom overrides to avoid conflicts
 * Specifically handles CAD to return "C$" instead of "$" to distinguish from USD
 */
export function getCurrencySymbol(currencyCode: string): string {
	// Override specific currencies that have symbol conflicts
	const customSymbols: Record<string, string> = {
		CAD: "C$", // Canadian Dollar - use C$ instead of $ to distinguish from USD
		// Add more custom mappings here if needed in the future
	};

	// Return custom symbol if available, otherwise use the standard library
	return (
		customSymbols[currencyCode] ||
		getSymbolFromCurrency(currencyCode) ||
		currencyCode
	);
}
