import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./Budget.css";
import api from "./utils/api";

type MonthlyAmount = {
  currency: string;
  amount: number;
};

type MonthlyBudgetData = {
  month: string;
  year: number;
  amounts: MonthlyAmount[];
};

type AverageSpendData = {
  currency: string;
  averageMonthlySpend: number;
  totalSpend: number;
  monthsAnalyzed: number;
};

type AverageSpendPeriod = {
  periodMonths: number;
  averages: AverageSpendData[];
};

interface MonthlyBudgetProps {
  budget: string;
  timeRange?: number; // Selected time period in months
  onDataReceived?: (data: MonthlyBudgetData[]) => void;
  onAverageDataReceived?: (data: AverageSpendPeriod[]) => void;
}

export const MonthlyBudget: React.FC<MonthlyBudgetProps> = ({
  budget,
  timeRange,
  onDataReceived,
  onAverageDataReceived,
}) => {
  const [monthlyData, setMonthlyData] = useState<MonthlyBudgetData[]>([]);
  const [averageData, setAverageData] = useState<AverageSpendPeriod[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const dataFetchedRef = useRef(false);
  const navigate = useNavigate();

  const fetchMonthlyBudget = useCallback(() => {
    if (dataFetchedRef.current) return;
    setLoading(true);
    api
      .post("/budget_monthly", {
        name: budget,
      })
      .then((res) => {
        // Handle new response format with monthlyBudgets property
        const budgetData = res.data.monthlyBudgets || res.data; // Fallback for old format
        const avgData = res.data.averageMonthlySpend || []; // New average data
        
        setMonthlyData(budgetData);
        setAverageData(avgData);
        dataFetchedRef.current = true;

        // Pass data to parent component if callback provided
        if (onDataReceived) {
          onDataReceived(budgetData);
        }
        if (onAverageDataReceived) {
          onAverageDataReceived(avgData);
        }
      })
      .catch((e) => {
        console.log(e);
        if (e.response?.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [budget, navigate, onDataReceived, onAverageDataReceived]);

  useEffect(() => {
    dataFetchedRef.current = false;
    fetchMonthlyBudget();
  }, [budget, fetchMonthlyBudget]);

  // This component now only handles data fetching and doesn't render any UI
  return null;
};

// Export the types for use in other components
export type { AverageSpendData, AverageSpendPeriod };
