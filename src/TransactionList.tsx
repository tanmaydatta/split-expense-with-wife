import getSymbolFromCurrency from "currency-symbol-map";
import React, { useState } from "react";
import { ArrowDownUp, Calendar, CardText, Coin } from "react-bootstrap-icons";
import { dateToShortStr } from "./BudgetTable";
import "./TransactionList.css";

export type Transaction = {
  id: number;
  transactionId: string;
  description: string;
  totalAmount: number;
  date: string;
  amountOwed: Map<string, number>;
  paidBy: Map<string, number>;
  owedTo: Map<string, number>;
  totalOwed: number;
  currency: string;
};

type TransactionListProps = {
  transactions: Transaction[];
};

const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
  console.log(transactions);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const handleClick = (transaction: Transaction) => {
    if (
      selectedTransaction?.transactionId ??
      "" === transaction.transactionId
    ) {
      setSelectedTransaction(null);
    } else {
      setSelectedTransaction(transaction);
    }
  };

  return (
    <div className="transactionListWrapper">
      <div className="transactionListItemWrapper">
        <div>
          <Calendar /> Date
        </div>
        <div>
          <CardText /> Description
        </div>
        <div>
          <Coin /> Amount
        </div>
        <div>
          <ArrowDownUp /> Share
        </div>
      </div>
      {transactions.map((transaction) => (
        <>
          <div
            className="transactionListItemWrapper"
            key={transaction.id}
            onClick={() => handleClick(transaction)}
          >
            <div>{dateToShortStr(new Date(transaction.date))}</div>
            <div>{transaction.description}</div>
            <div>
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalAmount)}
            </div>
            <div
              className={transaction.totalOwed > 0 ? "positive" : "negative"}
            >
              {" "}
              {transaction.totalOwed > 0 ? "+" : "-"}
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalOwed)}
            </div>
          </div>
          {selectedTransaction &&
            transaction.transactionId === selectedTransaction.transactionId &&
            TransactionDetails(selectedTransaction)}
        </>
      ))}
    </div>
  );
};

function TransactionDetails(selectedTransaction: Transaction) {
  return (
    <div className="detailsWrapper">
      <div>
        Amount owed:{" "}
        {Object.entries(selectedTransaction.amountOwed).map(
          ([user, amount]) => {
            return (
              <div>
                {user}: {getSymbolFromCurrency(selectedTransaction.currency)}
                {amount}
              </div>
            );
          }
        )}
      </div>
      <div>
        Paid by:{" "}
        {Object.entries(selectedTransaction.paidBy).map(([user, amount]) => {
          return (
            <div>
              {user}: {getSymbolFromCurrency(selectedTransaction.currency)}
              {amount}
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
          {Math.abs(selectedTransaction.totalOwed)}
        </div>
      </div>
    </div>
  );
}
export default TransactionList;
