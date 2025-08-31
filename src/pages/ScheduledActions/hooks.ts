import React from "react";

export function useIntersectionObserver(
	callback: () => void,
	hasNextPage: boolean,
	isFetchingNextPage: boolean,
) {
	const sentinelRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => {
		if (!sentinelRef.current) return;
		const el = sentinelRef.current;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
					callback();
				}
			},
			{ root: null, rootMargin: "0px", threshold: 1.0 },
		);
		observer.observe(el);
		return () => observer.unobserve(el);
	}, [callback, hasNextPage, isFetchingNextPage]);

	return sentinelRef;
}

export function useConfirmDialog() {
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
		null,
	);

	const requestDelete = (id: string) => {
		setPendingDeleteId(id);
		setConfirmOpen(true);
	};

	const closeConfirm = () => {
		setConfirmOpen(false);
		setPendingDeleteId(null);
	};

	return {
		confirmOpen,
		pendingDeleteId,
		requestDelete,
		closeConfirm,
		setConfirmOpen,
	};
}
