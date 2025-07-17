import styled from 'styled-components';

export const Select = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.secondary};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.medium};
  font-size: ${({ theme }) => theme.fontSizes.medium};
  width: 100%;
  min-height: 44px; /* Touch-friendly */
  box-sizing: border-box;
  background: ${({ theme }) => theme.colors.white};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
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
