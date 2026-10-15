import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({test:{globals:true,include:["src/tests/category-jobs.workflow.integration.ts"],fileParallelism:false,poolOptions:{workers:{wrangler:{configPath:"./wrangler.toml"},isolatedStorage:false,singleWorker:true,miniflare:{bindings:{CATEGORIES_ENABLED:"true",CATEGORY_AI_ENABLED:"false"}}}}}});
