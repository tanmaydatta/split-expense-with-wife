import axios from "axios";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useSelector } from "react-redux";
import TransactionList, { Transaction } from "./TransactionList";
import "./Transactions.css";
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
  const data = useSelector((state: any) => state.value);
  const fetchTransactions = useCallback(
    (offset: number, transactions: Transaction[]) => {
      axios
        .post("/.netlify/functions/transactions_list", {
          offset: offset,
        })
        .then((res) => {
          var entries: Transaction[] = [];
          res.data.transactions.map(
            (e: {
              id: number;
              description: string;
              amount: number;
              created_at: string;
              metadata: TransactionMetadata;
              currency: string;
              transaction_id: string;
              group_id: number;
            }) => {
              var totalOwed: number = 0.0;

              const txnDetails = res.data.transactionDetails[
                e.transaction_id
              ] as TransactionUser[];
              console.log("txnDetails", txnDetails);
              txnDetails.forEach((txn) => {
                if (data.userId === txn.owed_to_user_id) {
                  totalOwed += txn.amount;
                }
                if (data.userId === txn.user_id) {
                  totalOwed -= txn.amount;
                }
              });
              return entries.push({
                id: e.id,
                transactionId: e.transaction_id,
                description: e.description as string,
                totalAmount: e.amount,
                date: e.created_at,
                amountOwed: e.metadata.owedAmounts,
                paidBy: e.metadata.paidByShares,
                owedTo: e.metadata.owedToAmounts,
                totalOwed: totalOwed,
                currency: e.currency,
              });
            }
          );
          setTransactions([...transactions, ...entries]);
        })
        .catch((e) => {
          console.log(e);
        });
    },
    [data.userId]
  );

  useEffect(() => {
    fetchTransactions(0, []);
  }, [fetchTransactions]);

  return (
    <div className="TransactionsWraper">
      <TransactionList transactions={transactions} />
      <Button
        variant="outline-secondary"
        onClick={() => {
          fetchTransactions(transactions.length, transactions);
        }}
      >
        Show more
      </Button>
    </div>
  );
};

export default Transactions;
