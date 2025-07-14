import getSymbolFromCurrency from "currency-symbol-map";
import React, { useState } from "react";
import {
  ArrowDownUp,
  Calendar,
  CardText,
  Coin,
  Trash,
  XLg,
} from "react-bootstrap-icons";
import { dateToShortStr } from "./BudgetTable";
import "./TransactionList.css";
import type { FrontendTransaction } from '../shared-types';

type TransactionListProps = {
  transactions: FrontendTransaction[];
  deleteTransaction(id: number): void;
};

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  deleteTransaction,
}) => {
  console.log(transactions);
  const [selectedTransaction, setSelectedTransaction] =
    useState<FrontendTransaction | null>(null);

  const handleClick = (transaction: FrontendTransaction) => {
    console.log("clicked", transaction);
    if (
      selectedTransaction?.transactionId ??
      "" === transaction.transactionId
    ) {
      setSelectedTransaction(null);
    } else {
      console.log("setting selected transaction", transaction);
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
        <div>
          <Trash />
        </div>
      </div>
      {transactions.map((transaction) => (
        <>
          <div className="transactionListItemWrapper" key={transaction.id}>
            <div onClick={() => handleClick(transaction)}>
              {dateToShortStr(new Date(transaction.date))}
            </div>
            <div onClick={() => handleClick(transaction)}>
              {transaction.description.length > 50 ? transaction.description.slice(0, 30) + "..." : transaction.description}
            </div>
            <div onClick={() => handleClick(transaction)}>
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalAmount)}
            </div>
            <div
              onClick={() => handleClick(transaction)}
              className={transaction.totalOwed > 0 ? "positive" : "negative"}
            >
              {" "}
              {transaction.totalOwed > 0 ? "+" : "-"}
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalOwed)}
            </div>
            <div onClick={() => deleteTransaction(transaction.id)}>
              <XLg
                style={{
                  fontWeight: 500,
                  color: "red",
                }}
              />
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

function TransactionDetails(selectedTransaction: FrontendTransaction) {
  console.log("TransactionDetails", selectedTransaction);
  console.log("amountOwed", selectedTransaction.amountOwed);
  console.log("paidBy", selectedTransaction.paidBy);
  console.log("owedTo", selectedTransaction.owedTo);
  console.log("totalOwed", selectedTransaction.totalOwed);
  console.log("currency", selectedTransaction.currency);
  return (
    <div className="detailsWrapper">
      <div>
        Amount owed:{" "}
        {Object.entries(selectedTransaction.amountOwed).map(
          ([user, amount]: [string, number]) => {
            console.log("user", user, "amount", amount);
            return (
              <div>
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
            <div>
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
    </div>
  );
}
export default TransactionList;
