import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import {
	applyCategoryJobItem,
	type CategoryJobParams,
	failCategoryJob,
	finishCategoryJob,
	prepareCategoryJobItem,
} from "../utils/category-jobs";
export class CategoryJobsWorkflow extends WorkflowEntrypoint<
	Env,
	CategoryJobParams
> {
	async run(event: WorkflowEvent<CategoryJobParams>, step: WorkflowStep) {
		const id = event.payload.jobId;
		try {
			const count = await step.do("read selection size", async () => {
				const row = await this.env.DB.prepare(
					"SELECT selection FROM category_jobs WHERE id=?",
				)
					.bind(id)
					.first<{ selection: string }>();
				return row ? Math.min(100, JSON.parse(row.selection).length) : 0;
			});
			for (let i = 0; i < count; i++) {
				// AI reservation is persisted before inference; replay never makes a second AI request.
				await step.do(
					`resolve ${i}`,
					{ retries: { limit: 0, delay: "1 second" }, timeout: "30 seconds" },
					() => prepareCategoryJobItem(this.env, id, i),
				);
				await step.do(
					`apply ${i}`,
					{ retries: { limit: 2, delay: "1 second" }, timeout: "30 seconds" },
					() => applyCategoryJobItem(this.env, id, i),
				);
			}
			await step.do("complete job", () => finishCategoryJob(this.env, id));
		} catch {
			await failCategoryJob(this.env, id);
			throw Error("Category job failed");
		}
	}
}
