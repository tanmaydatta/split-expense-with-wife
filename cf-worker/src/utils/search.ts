// Substring-search helper for list endpoints.
// Length validation lives in the calling handler so it can return a 400
// via createErrorResponse (handlers do not throw for client errors).

export const MAX_Q_LENGTH = 100;

export function buildLikePattern(q: string | undefined): string | null {
	if (!q) return null;
	const trimmed = q.trim();
	if (!trimmed) return null;
	const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
	return `%${escaped}%`;
}
