import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import {
	type BankSyncParams,
	runBankBackgroundSync,
} from "../utils/bank-background-sync";
/** Workflow payload contains only the owned connection ID; credentials stay encrypted in D1. */
export class BankSyncWorkflow extends WorkflowEntrypoint<Env, BankSyncParams> {
	async run(event: WorkflowEvent<BankSyncParams>, step: WorkflowStep) {
		return step.do(
			"fetch private bank activity",
			{
				retries: { limit: 1, delay: "1 minute", backoff: "constant" },
				timeout: "5 minutes",
			},
			() => runBankBackgroundSync(this.env, event.payload.connectionId),
		);
	}
}
