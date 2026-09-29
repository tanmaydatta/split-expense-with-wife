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

export const UiPage = styled.main`
  width: min(100%, 960px);
  margin: 0 auto;
  padding: 24px 16px 60px;
  color: var(--ui-text);
  @media (max-width: 600px) { padding: 16px 0 40px; }
`;

export const UiPageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
  flex-wrap: wrap;
`;

export const UiPageTitle = styled.h1`
  margin: 0;
  color: var(--ui-text);
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 750;
  line-height: 1.15;
`;

export const UiPageDescription = styled.p`
  margin: 8px 0 0;
  color: var(--ui-text-muted);
  font-size: 14px;
`;

export const UiSectionTitle = styled.h2`
  margin: 0 0 16px;
  color: var(--ui-text);
  font-size: 18px;
  font-weight: 700;
`;
