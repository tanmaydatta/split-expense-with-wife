import { useCallback, useEffect, useState } from "react";
import { Card } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import "./Budget.css";
import BudgetBarChart from "./BudgetBarChart";
import { MonthlyBudget } from "./MonthlyBudget";
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
          <BudgetBarChart data={monthlyData} />

          {/* We still need the MonthlyBudget component for data fetching, but we'll hide it */}
          <div style={{ display: "none" }}>
            <MonthlyBudget
              budget={budget}
              onDataReceived={handleDataReceived}
            />
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};
