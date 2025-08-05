import styled from "styled-components";

export const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.small};
  padding: ${({ theme }) => theme.spacing.medium};
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    padding: ${({ theme }) => theme.spacing.small};
    border-radius: ${({ theme }) => theme.borderRadius};
  }

  @media (max-width: 480px) {
    padding: 12px;
    margin: 0 4px; /* Small side margins on very small screens */
  }
`;
