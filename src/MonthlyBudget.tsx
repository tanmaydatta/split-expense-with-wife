import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Budget.css";
import { typedApi } from "./utils/api";
import type { BudgetMonthlyRequest, BudgetMonthlyResponse, MonthlyBudget, AverageSpendPeriod } from '../shared-types';

interface MonthlyBudgetProps {
  budget: string;
  timeRange?: number; // Selected time period in months
  onDataReceived?: (data: MonthlyBudget[]) => void;
  onAverageDataReceived?: (data: AverageSpendPeriod[]) => void;
}

export const MonthlyBudgetComponent: React.FC<MonthlyBudgetProps> = ({
  budget,
  onDataReceived,
  onAverageDataReceived,
}) => {
  const [, setMonthlyData] = useState<MonthlyBudget[]>([]);
  const [, setAverageData] = useState<AverageSpendPeriod[]>([]);
  const [, setLoading] = useState<boolean>(false);
  const dataFetchedRef = useRef(false);
  const navigate = useNavigate();

  const fetchMonthlyBudget = useCallback(async () => {
    if (dataFetchedRef.current) return;
    setLoading(true);
    try {
      const request: BudgetMonthlyRequest = {
        name: budget,
      };
      
      const response: BudgetMonthlyResponse = await typedApi.post("/budget_monthly", request);
      
      // Handle new response format with monthlyBudgets property
      const budgetData = response.monthlyBudgets;
      const avgData = response.averageMonthlySpend;
      
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
    } catch (e: any) {
      console.log(e);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [budget, navigate, onDataReceived, onAverageDataReceived]);

  useEffect(() => {
    dataFetchedRef.current = false;
    fetchMonthlyBudget();
  }, [budget, fetchMonthlyBudget]);

  // This component now only handles data fetching and doesn't render any UI
  return null;
};

// Types are now exported from shared-types package
