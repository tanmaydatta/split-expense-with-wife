import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		fileParallelism: false,

		// keep exactly one worker alive
		minWorkers: 1,
		maxWorkers: 1,
		globals: true,
		coverage: {
			provider: "istanbul",
			reporter: ["text", "json", "html"],
			reportsDirectory: "./coverage",
			exclude: [
				"coverage/**",
				"dist/**",
				"**/[.]**",
				"packages/*/test?(s)/**",
				"**/*.d.ts",
				"**/virtual:*",
				"**/__x00__*",
				"**/\x00*",
				"cypress/**",
				"test?(s)/**",
				"test?(-*).?(c|m)[jt]s?(x)",
				"**/*{.,-}{test,spec}.?(c|m)[jt]s?(x)",
				"**/__tests__/**",
				"**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
				"**/vitest.{workspace,projects}.[jt]s?(on)",
				"**/.{eslint,mocha,prettier}rc.{?(c|m)js,yml}",
			],
			include: ["src/**/*.{js,ts}"],
		},
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.toml" },
				isolatedStorage: false,
				singleWorker: true,
			},
		},
	},
});
