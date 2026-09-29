import styled from "styled-components";

export const Card = styled.div`
  min-width: 0;
  padding: 20px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow);

  @media (max-width: 600px) { padding: 16px; }
`;
