import { lunchFlowProvider } from "./lunch-flow";
import { plaidProvider } from "./plaid-provider";
import type { BankProvider, BankProviderId } from "./bank-provider";
export const bankProviders: Partial<Record<BankProviderId, BankProvider>> = {
	plaid: plaidProvider,
	lunch_flow: lunchFlowProvider,
};
export function bankProvider(provider: BankProviderId): BankProvider {
	const adapter = bankProviders[provider];
	if (!adapter) throw new Error("Unsupported bank provider");
	return adapter;
}
export function bankingEnabled(env: Env): boolean {
	return Object.values(bankProviders).some((provider) => provider.enabled(env));
}
