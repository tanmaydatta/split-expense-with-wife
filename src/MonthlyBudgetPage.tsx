import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import "./Budget.css";
import { MonthlyBudget } from "./MonthlyBudget";
import { SelectBudget } from "./SelectBudget";

export const MonthlyBudgetPage: React.FC = () => {
  const { budgetName } = useParams<{ budgetName: string }>();
  const [budget, setBudget] = useState(budgetName || "house");
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

  return (
    <div className="Budget">
      <Card className="w-100 mb-3">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h4 className="mb-0">Monthly Budget Breakdown</h4>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => navigate("/budget")}
          >
            Back to Budget
          </Button>
        </Card.Header>
        <Card.Body>
          <SelectBudget
            budget={budget}
            handleChangeBudget={handleChangeBudget}
          />
          <MonthlyBudget budget={budget} />
        </Card.Body>
      </Card>
    </div>
  );
};
