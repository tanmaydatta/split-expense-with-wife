import styled from "styled-components";

/** Shared visual building blocks. Behavior-heavy controls can wrap Radix primitives. */
export const Surface = styled.div`
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow);
  padding: 20px;

  @media (max-width: 600px) {
    padding: 16px;
  }
`;

export const UiButton = styled.button<{ $tone?: "primary" | "neutral" | "danger" | "quiet" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid ${({ $tone }) =>
    $tone === "primary" ? "var(--ui-accent)" :
    $tone === "danger" ? "var(--ui-danger-border)" : "var(--ui-border-strong)"};
  border-radius: var(--ui-radius-sm);
  background: ${({ $tone }) =>
    $tone === "primary" ? "var(--ui-accent)" :
    $tone === "danger" ? "var(--ui-danger-soft)" :
    $tone === "quiet" ? "transparent" : "var(--ui-surface)"};
  color: ${({ $tone }) =>
    $tone === "primary" ? "#fff" :
    $tone === "danger" ? "var(--ui-danger)" : "var(--ui-text)"};
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.25;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;

  &:hover:not(:disabled) {
    background: ${({ $tone }) =>
      $tone === "primary" ? "var(--ui-accent-hover)" :
      $tone === "danger" ? "#ffe9e9" : "var(--ui-surface-muted)"};
  }
  &:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: 2px; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

export const FieldLabel = styled.label`
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 650;

  .form-select {
    border-color: var(--ui-border-strong);
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text);
    background-color: var(--ui-surface);
  }
`;
