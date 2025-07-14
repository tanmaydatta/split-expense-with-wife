import React, { useCallback, useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import TransactionList from "./TransactionList";
import "./Transactions.css";
import "./common.css";
import { typedApi } from "./utils/api";
import type { TransactionsListRequest, TransactionsListResponse, SplitDeleteRequest, TransactionMetadata, TransactionUser, FrontendTransaction } from '../shared-types';

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
        
        console.log("txnslist", response);
        var entries: FrontendTransaction[] = [];
        response.transactions.map(
          (e) => {
            var totalOwed: number = 0.0;
            const txnDetails = response.transactionDetails[
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
              owedAmounts: {},
              paidByShares: {},
              owedToAmounts: {},
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
