export function dateToShortStr(date: Date): string {
	const currentYear = new Date().getFullYear();
	const options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "2-digit",
	};

	if (date.getFullYear() !== currentYear) {
		options.year = "numeric";
	}

	return date.toLocaleDateString("en-US", options);
}

export function dateToFullStr(date: Date): string {
	const options: Intl.DateTimeFormatOptions = {
		weekday: "short",
		month: "short",
		day: "2-digit",
		year: "numeric",
	};

	return date.toLocaleDateString("en-US", options);
}
