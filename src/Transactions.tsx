import React, { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import TransactionList, { Transaction } from "./TransactionList";
import "./Transactions.css";
import "./common.css";
import api from "./utils/api";
type TransactionMetadata = {
  owedAmounts: Map<string, number>;
  paidByShares: Map<string, number>;
  owedToAmounts: Map<string, number>;
};
type TransactionUser = {
  transaction_id: string;
  user_id: number;
  amount: number;
  owed_to_user_id: number;
  group_id: number;
};

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const navigate = useNavigate();

  const data = useSelector((state: any) => state.value);
  const [loading, setLoading] = useState<boolean>(false);
  const fetchTransactions = useCallback(
    (offset: number, transactions: Transaction[]) => {
      setLoading(true);
      api
        .post("/transactions_list", {
          offset: offset,
        })
        .then((res) => {
          console.log("txnslist", res);
          var entries: Transaction[] = [];
          res.data.transactions.map(
            (e: {
              id: number;
              description: string;
              amount: number;
              created_at: string;
              metadata: string;
              currency: string;
              transaction_id: string;
              group_id: number;
            }) => {
              var totalOwed: number = 0.0;
              const txnDetails = res.data.transactionDetails[
                e.transaction_id
              ] as TransactionUser[] || [];
              console.log("txnDetails", txnDetails);
              txnDetails.forEach((txn) => {
                if (data.userId === txn.owed_to_user_id) {
                  totalOwed += txn.amount;
                }
                if (data.userId === txn.user_id) {
                  totalOwed -= txn.amount;
                }
              });
              const metadata = JSON.parse(e.metadata) as TransactionMetadata || {
                owedAmounts: new Map(),
                paidByShares: new Map(),
                owedToAmounts: new Map(),
              };
              console.log("metadata for txn", e.description, metadata);
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
        })
        .catch((e) => {
          console.log(e);
          if (e.response.status === 401) {
            navigate("/login");
          }
        })
        .finally(() => setLoading(false));
    },
    [data.userId, navigate]
  );

  useEffect(() => {
    fetchTransactions(0, []);
  }, [fetchTransactions]);

  const deleteTransaction = (id: number) => {
    setLoading(true);
    api
      .post("/split_delete", {
        id: id,
      })
      .then((res) => {
        alert(res.status);
        fetchTransactions(0, []);
      })
      .catch((e) => {
        alert(e.response.data);
        if (e.response.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="TransactionsWraper">
      {loading && <div className="loader"></div>}
      {!loading && (
        <TransactionList
          transactions={transactions}
          deleteTransaction={deleteTransaction}
        />
      )}
      {!loading && (
        <Button
          variant="outline-secondary"
          onClick={() => {
            fetchTransactions(transactions.length, transactions);
          }}
          className="showMoreButton"
        >
          Show more
        </Button>
      )}
    </div>
  );
};

export default Transactions;
