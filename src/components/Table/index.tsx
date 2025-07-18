import styled from 'styled-components';

export const TableWrapper = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.small};

  @media (max-width: 768px) {
    margin: 0 -${({ theme }) => theme.spacing.small};
    border-radius: 0;
  }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 600px; /* Ensure table doesn't get too compressed */

  th, td {
    border: 1px solid ${({ theme }) => theme.colors.secondary};
    padding: ${({ theme }) => theme.spacing.medium};
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  th {
    background: ${({ theme }) => theme.colors.light};
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  /* Column width distribution for desktop */
  th:nth-child(1), td:nth-child(1) { /* Date */
    width: 80px;
    min-width: 80px;
  }

  th:nth-child(2), td:nth-child(2) { /* Description */
    width: auto;
    min-width: 200px;
    max-width: 300px;
    white-space: normal;
    word-wrap: break-word;
    word-break: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  th:nth-child(3), td:nth-child(3) { /* Amount */
    width: 100px;
    min-width: 100px;
    text-align: right;
  }

  th:nth-child(4), td:nth-child(4) { /* Share */
    width: 100px;
    min-width: 100px;
    text-align: right;
  }

  th:nth-child(5), td:nth-child(5) { /* Actions */
    width: 60px;
    min-width: 60px;
    text-align: center;
  }

  /* Color coding for amounts */
  .positive {
    color: ${({ theme }) => theme.colors.success} !important;
    font-weight: 600;
  }

  .negative {
    color: ${({ theme }) => theme.colors.danger} !important;
    font-weight: 600;
  }

  .zero {
    color: ${({ theme }) => theme.colors.secondary} !important;
    font-weight: normal;
  }

  /* Description cell specific styling */
  .description-cell {
    line-height: 1.4;
    padding-right: ${({ theme }) => theme.spacing.small};
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    min-width: 500px; /* Smaller minimum width for mobile */
    font-size: 0.9rem;

    th, td {
      padding: ${({ theme }) => theme.spacing.small};
    }

    th:nth-child(1), td:nth-child(1) { /* Date */
      width: 60px;
      min-width: 60px;
      font-size: 0.8rem;
    }

    th:nth-child(2), td:nth-child(2) { /* Description */
      min-width: 150px;
      max-width: 200px;
      font-size: 0.85rem;
    }

    th:nth-child(3), td:nth-child(3), 
    th:nth-child(4), td:nth-child(4) { /* Amount & Share */
      width: 80px;
      min-width: 80px;
      font-size: 0.8rem;
    }

    th:nth-child(5), td:nth-child(5) { /* Actions */
      width: 50px;
      min-width: 50px;
    }
  }

  @media (max-width: 480px) {
    min-width: 450px;
    font-size: 0.85rem;

    th, td {
      padding: 8px;
    }

    th:nth-child(1), td:nth-child(1) { /* Date */
      width: 50px;
      min-width: 50px;
      font-size: 0.75rem;
    }

    th:nth-child(2), td:nth-child(2) { /* Description */
      min-width: 120px;
      max-width: 150px;
      font-size: 0.8rem;
    }

    th:nth-child(3), td:nth-child(3), 
    th:nth-child(4), td:nth-child(4) { /* Amount & Share */
      width: 70px;
      min-width: 70px;
      font-size: 0.75rem;
    }

    th:nth-child(5), td:nth-child(5) { /* Actions */
      width: 40px;
      min-width: 40px;
    }
  }
`;
