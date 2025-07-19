import React from "react";
import { getCurrencySymbol } from "@/utils/currency";
import "./index.css";

export interface AmountItem {
  currency: string;
  amount: number;
}

interface AmountGridProps {
  amounts: AmountItem[];
  className?: string;
}

export const AmountGrid: React.FC<AmountGridProps> = ({ amounts, className = "" }) => {
  return (
    <div className={`amount-grid ${className}`.trim()} data-test-id="amount-grid">
      {amounts.map((item, index) => {
        const isPositive = item.amount > 0;
        const isZero = item.amount === 0;
        const sign = isZero ? "" : isPositive ? "+" : "-";
        const displayAmount = isZero ? "0.00" : Math.abs(item.amount).toFixed(2);
        const itemClassName = isZero 
          ? "amount-item zero" 
          : isPositive 
            ? "amount-item positive" 
            : "amount-item negative";
        
        return (
          <div key={`${item.currency}-${index}`} className={itemClassName} data-test-id="amount-item">
            {sign}{getCurrencySymbol(item.currency)}{displayAmount}
          </div>
        );
      })}
    </div>
  );
}; 