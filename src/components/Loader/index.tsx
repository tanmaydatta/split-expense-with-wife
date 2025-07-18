import React from 'react';
import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const StyledLoader = styled.div`
  border: 4px solid ${({ theme }) => theme.colors.light};
  border-top: 4px solid ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: ${spin} 2s linear infinite;
`;

interface LoaderProps {
  'data-test-id'?: string;
}

export const Loader: React.FC<LoaderProps> = ({ 'data-test-id': testId = 'loader' }) => (
  <StyledLoader data-test-id={testId} />
);
