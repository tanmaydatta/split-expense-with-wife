import { useEffect, useRef, useState } from "react";
import "./index.css";

type Props = {
	value: string;
	onDebouncedChange: (value: string) => void;
	placeholder?: string;
	debounceMs?: number;
};

export const SearchInput: React.FC<Props> = ({
	value,
	onDebouncedChange,
	placeholder = "Search by description",
	debounceMs = 300,
}) => {
	const [text, setText] = useState(value);
	const lastEmitted = useRef(value);

	useEffect(() => {
		setText(value);
		lastEmitted.current = value;
	}, [value]);

	useEffect(() => {
		if (text === lastEmitted.current) return;
		const t = setTimeout(() => {
			lastEmitted.current = text;
			onDebouncedChange(text);
		}, debounceMs);
		return () => clearTimeout(t);
	}, [text, debounceMs, onDebouncedChange]);

	const clear = () => {
		setText("");
		lastEmitted.current = "";
		onDebouncedChange("");
	};

	return (
		<div className="search-input-wrapper">
			<input
				type="search"
				className="search-input"
				data-test-id="search-input"
				data-testid="search-input"
				aria-label={placeholder}
				placeholder={placeholder}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") clear();
				}}
			/>
			{text.length > 0 && (
				<button
					type="button"
					className="search-clear-button"
					data-test-id="search-clear-button"
					data-testid="search-clear-button"
					aria-label="Clear search"
					onClick={clear}
				>
					×
				</button>
			)}
		</div>
	);
};
