import styled from 'styled-components';

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    border: 1px solid ${({ theme }) => theme.colors.secondary};
    padding: ${({ theme }) => theme.spacing.medium};
    text-align: left;
  }

  th {
    background: ${({ theme }) => theme.colors.light};
  }
`;
