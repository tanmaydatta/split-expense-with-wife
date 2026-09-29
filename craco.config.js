const path = require("path");

module.exports = {
	webpack: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@shared-types": path.resolve(__dirname, "shared-types"),
		},
	},
	jest: {
		configure: {
			moduleNameMapper: {
				// Jest 27 cannot resolve Radix's development/production conditional export.
				"^@radix-ui/primitive/is-development$":
					"<rootDir>/node_modules/@radix-ui/primitive/dist/internal/is-development.true.js",
				"^@/(.*)$": "<rootDir>/src/$1",
				"^@shared-types/(.*)$": "<rootDir>/shared-types/$1",
			},
			testPathIgnorePatterns: ["/node_modules/", "/src/e2e/"],
		},
	},
};
