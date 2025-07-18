import React from "react";
import getSymbolFromCurrency from "currency-symbol-map";
import { Card } from "@/components/Card";
import {
  ArrowDownUp,
  Calendar,
  CardText,
  Coin,
  XLg,
} from "@/components/Icons";
import { dateToFullStr } from "@/utils/date";
import type { FrontendTransaction } from '@shared-types';
import "./TransactionCard.css";

interface TransactionCardProps {
  transaction: FrontendTransaction;
  isSelected: boolean;
  onSelect: (transaction: FrontendTransaction) => void;
  onDelete: (id: number) => void;
  children?: React.ReactNode; // For expanded details
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  transaction,
  isSelected,
  onSelect,
  onDelete,
  children
}) => {
  const handleClick = () => {
    onSelect(transaction);
  };

  return (
    <Card 
      className="transaction-card"
      data-test-id="transaction-card"
      onClick={handleClick}
    >
      <div className="transaction-card-header">
        <div className="transaction-date">
          <Calendar />
          <span>{dateToFullStr(new Date(transaction.date))}</span>
        </div>
        <button
          className="delete-button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(transaction.id);
          }}
          aria-label="Delete transaction"
        >
          <XLg />
        </button>
      </div>
      
      <div className="transaction-card-content">
        <div className="transaction-description">
          <CardText />
          <span>{transaction.description}</span>
        </div>
        
        <div className="transaction-amounts">
          <div className="transaction-total">
            <Coin />
            <span className="total-value">
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalAmount).toFixed(2)}
            </span>
          </div>
          
          <div 
            className={`transaction-share-container ${
              transaction.totalOwed > 0 
                ? "positive" 
                : transaction.totalOwed < 0 
                ? "negative" 
                : "zero"
            }`}
          >
            <div className="share-icon">
              <ArrowDownUp />
            </div>
            <span className="share-value">
              {transaction.totalOwed !== 0 && (transaction.totalOwed > 0 ? "+" : "-")}
              {getSymbolFromCurrency(transaction.currency)}
              {Math.abs(transaction.totalOwed).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      {isSelected && children && (
        <div className="transaction-card-details">
          {children}
        </div>
      )}
    </Card>
  );
}; 