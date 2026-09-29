import styled from "styled-components";

export const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--ui-accent);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover:not(:disabled) { background: var(--ui-accent-hover); border-color: var(--ui-accent-hover); }
  &:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: 2px; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }

  @media (max-width: 480px) { font-size: 16px; }
`;
