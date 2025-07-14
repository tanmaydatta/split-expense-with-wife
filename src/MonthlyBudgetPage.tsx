import { useCallback, useEffect, useState } from "react";
import { Card } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import "./Budget.css";
import BudgetBarChart from "./BudgetBarChart";
import { MonthlyBudget, AverageSpendPeriod } from "./MonthlyBudget";
import { SelectBudget } from "./SelectBudget";

type MonthlyBudgetData = {
  month: string;
  year: number;
  amounts: {
    currency: string;
    amount: number;
  }[];
};

export const MonthlyBudgetPage: React.FC = () => {
  const { budgetName } = useParams<{ budgetName: string }>();
  const [budget, setBudget] = useState(budgetName || "house");
  const [monthlyData, setMonthlyData] = useState<MonthlyBudgetData[]>([]);
  const [averageData, setAverageData] = useState<AverageSpendPeriod[]>([]);
  const [timeRange, setTimeRange] = useState<number>(6); // Default to 6 months
  const navigate = useNavigate();

  const handleChangeBudget = useCallback(
    (val: string) => {
      setBudget(val);
      navigate(`/monthly-budget/${val}`);
    },
    [navigate]
  );

  useEffect(() => {
    if (budgetName) {
      setBudget(budgetName);
    }
  }, [budgetName]);

  // Callback function to receive data from the MonthlyBudget component
  const handleDataReceived = useCallback((data: MonthlyBudgetData[]) => {
    setMonthlyData(data);
  }, []);

  // Callback function to receive average data from the MonthlyBudget component
  const handleAverageDataReceived = useCallback((data: AverageSpendPeriod[]) => {
    setAverageData(data);
  }, []);

  // Callback function to receive time range changes from BudgetBarChart
  const handleTimeRangeChange = useCallback((newTimeRange: number) => {
    setTimeRange(newTimeRange);
  }, []);

  return (
    <div className="Budget">
      <Card className="w-100 mb-3">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h4 className="mb-0">Monthly Budget Breakdown</h4>
        </Card.Header>
        <Card.Body>
          <SelectBudget
            budget={budget}
            handleChangeBudget={handleChangeBudget}
          />

          {/* Chart section */}
          <BudgetBarChart 
            data={monthlyData} 
            averageData={averageData}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
          />

          {/* Data fetching component (renders nothing) */}
          <MonthlyBudget
            budget={budget}
            timeRange={timeRange}
            onDataReceived={handleDataReceived}
            onAverageDataReceived={handleAverageDataReceived}
          />
        </Card.Body>
      </Card>
    </div>
  );
};
