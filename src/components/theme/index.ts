import { DefaultTheme } from "styled-components";

export const theme: DefaultTheme = {
	colors: {
		primary: "#2459c5",
		secondary: "#526078",
		success: "#146c36",
		danger: "#a52828",
		warning: "#ffc107",
		info: "#2459c5",
		light: "#f3f6fb",
		dark: "#182338",
		white: "#fff",
		black: "#000",
	},
	fonts: {
		main: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
	},
	fontSizes: {
		small: "0.8rem",
		medium: "1rem",
		large: "1.2rem",
		xlarge: "3rem",
	},
	spacing: {
		small: "0.5rem",
		medium: "1rem",
		large: "2rem",
		xlarge: "3rem",
	},
	borderRadius: "9px",
	shadows: {
		small: "0 3px 16px rgba(30,54,90,0.055)",
		medium: "0 8px 26px rgba(30,54,90,0.11)",
		large: "0 20px 50px rgba(11,26,52,0.22)",
	},
};
