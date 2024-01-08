import axios from "axios";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import TransactionList, { Transaction } from "./TransactionList";

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
  useEffect(() => {
    const fetchTransactions = async () => {
      await axios
        .post("/.netlify/functions/transactions_list", {})
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
          setTransactions(entries);
        })
        .catch((e) => {
          console.log(e);
        });
    };

    fetchTransactions();
  }, [data.userId]);

  return <TransactionList transactions={transactions} />;
};

export default Transactions;
