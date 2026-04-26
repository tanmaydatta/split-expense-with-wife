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
				"^@/(.*)$": "<rootDir>/src/$1",
				"^@shared-types/(.*)$": "<rootDir>/shared-types/$1",
			},
		},
	},
};
