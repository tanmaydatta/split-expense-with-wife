import { createJsonResponse, formatSQLiteTime } from "../utils";

export async function handleCron(env: Env, cron: string) {
	console.log(`Cron job for ${cron} started`);

	// Handle scheduled actions workflow trigger
	if (cron === "0 0 * * *") {
		// Daily at midnight UTC
		await triggerScheduledActionsOrchestrator(env);
	}

	console.log(`Cron job for ${cron} finished`);
}

async function triggerScheduledActionsOrchestrator(env: Env) {
	const triggerDate = formatSQLiteTime();

	console.log(`Triggering scheduled actions orchestrator for ${triggerDate}`);
	const id = `orchestrator-${triggerDate.split(" ")[0]}-${Date.now()}`;
	try {
		// Simply trigger the orchestrator workflow - it handles everything else
		await env.ORCHESTRATOR_WORKFLOW.create({
			id: id,
			params: { triggerDate },
		});

		console.log(`Successfully triggered orchestrator workflow: ${id}`);
		return createJsonResponse({
			message: `Successfully triggered orchestrator workflow: ${id}`,
			orchestratorWorkflowId: id,
		});
		// Optional: You can wait for the orchestrator to complete if needed
		// const result = await orchestratorWorkflow.result();
		// console.log('Orchestrator completed:', result);
	} catch (error) {
		console.error("Error triggering scheduled actions orchestrator:", error);
		throw error;
	}
}
