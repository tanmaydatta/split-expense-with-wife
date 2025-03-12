import axios from "axios";
import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./Budget.css";

type MonthlyBudgetData = {
  month: string;
  year: number;
  amounts: {
    currency: string;
    amount: number;
  }[];
};

export const MonthlyBudget: React.FC<{ budget: string }> = ({ budget }) => {
  const [monthlyData, setMonthlyData] = useState<MonthlyBudgetData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const dataFetchedRef = useRef(false);
  const navigate = useNavigate();

  const fetchMonthlyBudget = useCallback(() => {
    if (dataFetchedRef.current) return;
    setLoading(true);
    axios
      .post("/.netlify/functions/budget_monthly", {
        name: budget,
      })
      .then((res) => {
        setMonthlyData(res.data);
        dataFetchedRef.current = true;
      })
      .catch((e) => {
        console.log(e);
        if (e.response?.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [budget, navigate]);

  useEffect(() => {
    dataFetchedRef.current = false;
    fetchMonthlyBudget();
  }, [budget, fetchMonthlyBudget]);

  const formatAmount = (amount: number, currency: string) => {
    const symbol = getSymbolFromCurrency(currency) || currency;
    return `${symbol}${Math.abs(amount).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="text-center mt-3">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <Card className="mt-3 mb-3">
      <Card.Header className="text-center">
        <h5>Monthly Budget Breakdown</h5>
      </Card.Header>
      <Card.Body>
        {monthlyData.length === 0 ? (
          <div className="text-center">No data available</div>
        ) : (
          <div className="monthly-budget-container">
            {monthlyData.map((monthData, index) => (
              <Card key={index} className="mb-2">
                <Card.Header>
                  {monthData.month} {monthData.year}
                </Card.Header>
                <Card.Body>
                  {monthData.amounts.map((amount, amtIndex) => (
                    <div
                      key={amtIndex}
                      className={`d-flex justify-content-between ${
                        amount.amount >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      <span>{amount.amount >= 0 ? "Income" : "Expenses"}:</span>
                      <span>
                        {formatAmount(amount.amount, amount.currency)}
                      </span>
                    </div>
                  ))}
                </Card.Body>
              </Card>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};
