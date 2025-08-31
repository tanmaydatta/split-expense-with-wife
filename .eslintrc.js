module.exports = {
	extends: ["react-app", "react-app/jest"],
	rules: {
		// Allow console statements
		"no-console": "off",
		// Handle unused variables with underscore prefix
		"@typescript-eslint/no-unused-vars": [
			"warn",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		"no-unused-vars": "off",
		"max-depth": ["warn", { max: 3 }],
		// "complexity": ["error", { "max": 10 }],
		"max-lines-per-function": [
			"error",
			{
				max: 150,
				skipBlankLines: true,
				skipComments: true,
				IIFEs: false,
			},
		],
	},
	ignorePatterns: [
		"build/**",
		"node_modules/**",
		"cf-worker/**",
		"shared-types/**",
		"public/**",
		"src/e2e/**",
	],
};
