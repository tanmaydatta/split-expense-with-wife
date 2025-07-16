import getSymbolFromCurrency from "currency-symbol-map";
import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { Table } from "../components/Table";
import {
  ArrowDownUp,
  Calendar,
  CardText,
  Coin,
  Trash,
  XLg,
} from "react-bootstrap-icons";
import { dateToShortStr } from "../BudgetTable";
import { typedApi } from "../utils/api";
import type { FrontendTransaction, TransactionsListRequest, TransactionsListResponse, SplitDeleteRequest, TransactionMetadata, TransactionUser } from '../../shared-types';

const TransactionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.large};
  padding: ${({ theme }) => theme.spacing.large};
`;

const TransactionDetailsContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.medium};
  background: ${({ theme }) => theme.colors.light};
`;

const TransactionRow = styled.tr`
  cursor: pointer;
`;

const TransactionList: React.FC<{
  transactions: FrontendTransaction[];
  deleteTransaction(id: number): void;
}> = ({
  transactions,
  deleteTransaction,
}) => {
  const [selectedTransaction, setSelectedTransaction] =
    useState<FrontendTransaction | null>(null);

  const handleClick = (transaction: FrontendTransaction) => {
    if (
      selectedTransaction?.transactionId === transaction.transactionId
    ) {
      setSelectedTransaction(null);
    } else {
      setSelectedTransaction(transaction);
    }
  };

  return (
    <Table>
      <thead>
        <tr>
          <th><Calendar /> Date</th>
          <th><CardText /> Description</th>
          <th><Coin /> Amount</th>
          <th><ArrowDownUp /> Share</th>
          <th><Trash /></th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <React.Fragment key={transaction.id}>
            <TransactionRow onClick={() => handleClick(transaction)}>
              <td>{dateToShortStr(new Date(transaction.date))}</td>
              <td>{transaction.description}</td>
              <td>
                {getSymbolFromCurrency(transaction.currency)}
                {Math.abs(transaction.totalAmount).toFixed(2)}
              </td>
              <td
                className={transaction.totalOwed > 0 ? "positive" : "negative"}
              >
                {" "}
                {transaction.totalOwed > 0 ? "+" : "-"}
                {getSymbolFromCurrency(transaction.currency)}
                {Math.abs(transaction.totalOwed).toFixed(2)}
              </td>
              <td>
                <XLg
                  style={{
                    fontWeight: 500,
                    color: "red",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTransaction(transaction.id)
                  }}
                />
              </td>
            </TransactionRow>
            {selectedTransaction &&
              transaction.transactionId === selectedTransaction.transactionId && (
                <tr>
                  <td colSpan={5}>
                    <TransactionDetails {...selectedTransaction} />
                  </td>
                </tr>
              )}
          </React.Fragment>
        ))}
      </tbody>
    </Table>
  );
};

function TransactionDetails(selectedTransaction: FrontendTransaction) {
  return (
    <TransactionDetailsContainer>
      <div>
        Amount owed:{" "}
        {Object.entries(selectedTransaction.amountOwed).map(
          ([user, amount]: [string, number]) => {
            return (
              <div key={user}>
                {user}: {getSymbolFromCurrency(selectedTransaction.currency)}
                {amount.toFixed(2)}
              </div>
            );
          }
        )}
      </div>
      <div>
        Paid by:{" "}
        {Object.entries(selectedTransaction.paidBy).map(([user, amount]: [string, number]) => {
          return (
            <div key={user}>
              {user}: {getSymbolFromCurrency(selectedTransaction.currency)}
              {amount.toFixed(2)}
            </div>
          );
        })}
      </div>
      <div
        className={selectedTransaction.totalOwed > 0 ? "positive" : "negative"}
      >
        You {selectedTransaction.totalOwed > 0 ? "are owed " : "owe "}
        <div>
          {selectedTransaction.totalOwed > 0 ? "+" : "-"}
          {getSymbolFromCurrency(selectedTransaction.currency)}
          {Math.abs(selectedTransaction.totalOwed).toFixed(2)}
        </div>
      </div>
    </TransactionDetailsContainer>
  );
}

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<FrontendTransaction[]>([]);
  const navigate = useNavigate();

  const data = useSelector((state: any) => state.value);
  const [loading, setLoading] = useState<boolean>(false);
  const fetchTransactions = useCallback(
    async (offset: number, transactions: FrontendTransaction[]) => {
      setLoading(true);
      try {
        const request: TransactionsListRequest = { offset };
        const response: TransactionsListResponse = await typedApi.post("/transactions_list", request);

        var entries: FrontendTransaction[] = [];
        response.transactions.map(
          (e) => {
            var totalOwed: number = 0.0;
            const txnDetails = response.transactionDetails[
              e.transaction_id
            ] as TransactionUser[] || [];
            txnDetails.forEach((txn) => {
              if (data.userId === txn.owed_to_user_id) {
                totalOwed += txn.amount;
              }
              if (data.userId === txn.user_id) {
                totalOwed -= txn.amount;
              }
            });
            const metadata = JSON.parse(e.metadata) as TransactionMetadata || {
              owedAmounts: {},
              paidByShares: {},
              owedToAmounts: {},
            };

            return entries.push({
              id: e.id,
              transactionId: e.transaction_id,
              description: e.description as string,
              totalAmount: e.amount,
              date: e.created_at,
              amountOwed: metadata.owedAmounts,
              paidBy: metadata.paidByShares,
              owedTo: metadata.owedToAmounts,
              totalOwed: totalOwed,
              currency: e.currency,
            });
          }
        );
        setTransactions([...transactions, ...entries]);
      } catch (e: any) {
        console.log(e);
        if (e.response?.status === 401) {
          navigate("/login");
        }
      } finally {
        setLoading(false);
      }
    },
    [data.userId, navigate]
  );

  useEffect(() => {
    fetchTransactions(0, []);
  }, [fetchTransactions]);

  const deleteTransaction = async (id: number) => {
    setLoading(true);
    try {
      const request: SplitDeleteRequest = {
        id: id.toString(),
        pin: "", // Will be updated when we implement PIN properly
      };

      const response: { message: string } = await typedApi.post("/split_delete", request);
      alert(response.message);
      fetchTransactions(0, []);
    } catch (e: any) {
      alert(e.response?.data);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TransactionsContainer>
      {loading && <Loader />}
      {!loading && (
        <TransactionList
          transactions={transactions}
          deleteTransaction={deleteTransaction}
        />
      )}
      {!loading && (
        <Button
          onClick={() => {
            fetchTransactions(transactions.length, transactions);
          }}
        >
          Show more
        </Button>
      )}
    </TransactionsContainer>
  );
};

export default Transactions;
