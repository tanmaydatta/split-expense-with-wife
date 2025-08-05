import styled from "styled-components";

export const Button = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.medium};
  font-size: ${({ theme }) => theme.fontSizes.medium};
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  min-height: 44px; /* Touch-friendly minimum */
  font-weight: 500;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.secondary};
    cursor: not-allowed;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    min-height: 48px; /* Larger touch target on mobile */
    padding: ${({ theme }) => theme.spacing.medium} ${({ theme }) => theme.spacing.large};
    font-size: ${({ theme }) => theme.fontSizes.medium};
    font-weight: 600;
  }

  @media (max-width: 480px) {
    width: 100%; /* Full width on small screens */
    padding: ${({ theme }) => theme.spacing.medium};
    font-size: 16px; /* Prevent zoom on iOS */
  }
`;
