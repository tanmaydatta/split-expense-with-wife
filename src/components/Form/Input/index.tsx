import styled from "styled-components";

export const Input = styled.input`
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 10px 14px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: ${({ theme }) => theme.fontSizes.medium};
  width: 100%;
  min-height: 44px; /* Touch-friendly */
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus-visible {
    outline: 3px solid var(--ui-focus);
    outline-offset: 2px;
    border-color: var(--ui-accent);
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    min-height: 48px; /* Larger touch target on mobile */
    padding: ${({ theme }) => theme.spacing.medium};
    font-size: ${({ theme }) => theme.fontSizes.medium};
  }

  @media (max-width: 480px) {
    font-size: 16px; /* Prevent zoom on iOS */
    padding: 12px;
  }
`;
