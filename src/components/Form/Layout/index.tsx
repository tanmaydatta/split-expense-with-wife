import styled from "styled-components";

export const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 500px;

  label {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.dark};
    font-size: ${({ theme }) => theme.fontSizes.medium};
    margin-bottom: 0.25rem;
    margin-top: 1rem;
  }

  label:first-child {
    margin-top: 0;
  }

  input,
  select {
    margin-bottom: 0.5rem;
  }

  @media (max-width: 1024px) {
    max-width: 100%;
  }

  @media (max-width: 768px) {
    gap: ${({ theme }) => theme.spacing.small};

    label {
      font-size: ${({ theme }) => theme.fontSizes.medium};
      margin-bottom: 0.5rem;
    }

    input,
    select {
      min-height: 44px;
      font-size: ${({ theme }) => theme.fontSizes.medium};
      padding: ${({ theme }) => theme.spacing.medium};
    }
  }

  @media (max-width: 480px) {
    input,
    select {
      font-size: 16px; /* Prevent zoom on iOS */
    }
  }
`;

export const SplitPercentageContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.medium};
  width: 100%;
  margin-bottom: 0.5rem;
  margin-top: 0.5rem;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

export const SplitPercentageInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;

  label {
    font-weight: 500;
    color: ${({ theme }) => theme.colors.dark};
    font-size: ${({ theme }) => theme.fontSizes.medium};
    margin-bottom: 0.25rem;
    margin-top: 0;
  }

  input {
    margin-bottom: 0;
  }
`;

export const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.medium};
  margin-top: ${({ theme }) => theme.spacing.medium};

  button {
    flex: 1;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    margin-top: ${({ theme }) => theme.spacing.large};
  }
`;


