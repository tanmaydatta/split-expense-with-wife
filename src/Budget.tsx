import axios from "axios";
import sha256 from "crypto-js/sha256";
import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./Budget.css";
import BudgetTable from "./BudgetTable";
import { SelectBudget } from "./SelectBudget";
import { entry } from "./model";

export const Budget: React.FC = () => {
  const [budgetHistory, setBudgetHistory] = useState<entry[]>([]);
  const [budget, setBudget] = useState("house");
  const [budgetsLeft, setBudgetsLeft] = useState<
    { currency: string; amount: number }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [pin, setPin] = useState("");
  const handleChangeBudget = (val: string) => setBudget(val);
  const navigate = useNavigate();
  const fetchTotal = useCallback(() => {
    axios
      .post("/.netlify/functions/budget_total", {
        name: budget,
      })
      .then((res) => {
        setBudgetsLeft(res.data);
      })
      .catch((e) => {
        console.log(e);
        if (e.response.status === 401) {
          navigate("/login");
        }
      });
  }, [budget, navigate]);

  const fetchHistory = useCallback(
    (offset: number, history: entry[]) => {
      setLoading(true);
      axios
        .post("/.netlify/functions/budget_list", {
          name: budget,
          offset: offset,
        })
        .then((res) => {
          console.log(res.data);
          var entries: entry[] = [];
          res.data.map(
            (e: {
              added_time: string;
              description: string;
              price: string;
              id: number;
              deleted?: string;
              currency: string;
            }) =>
              entries.push({
                id: e.id,
                date: e.added_time,
                description: e.description as string,
                amount: e.price,
                deleted: e.deleted,
                currency: e.currency as string,
              })
          );

          console.log("budget list", [...history, ...entries]);
          setBudgetHistory([...history, ...entries]);
        })
        .catch((e) => {
          console.log(e);
          if (e.response.status === 401) {
            navigate("/login");
          }
        })
        .finally(() => setLoading(false));
    },
    [budget, navigate]
  );
  const deleteBudgetEntry = (id: number) => {
    setLoading(true);
    axios
      .post("/.netlify/functions/budget_delete", {
        id: id,
        pin: sha256(pin).toString(),
      })
      .then((res) => {
        alert(res.status);
        fetchTotal();
        fetchHistory(0, []);
      })
      .catch((e) => {
        alert(e.response.data);
        if (e.response.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    fetchTotal();
    fetchHistory(0, []);
  }, [fetchTotal, fetchHistory]);
  return (
    <div className="Budget">
      {loading && <div className="loader"></div>}
      {!loading && (
        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Control
            type="password"
            placeholder="PIN"
            name="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </Form.Group>
      )}
      {!loading && (
        <Card.Title style={{ marginTop: "1%" }}>
          Budget left
          <div className="budgetTotal">
            {budgetsLeft
              .map((e) => ({
                text:
                  (e.amount > 0 ? "+" : "-") +
                  getSymbolFromCurrency(e.currency) +
                  Math.abs(e.amount).toFixed(2),
                color: e.amount > 0 ? "green" : "red",
              }))
              .map((e) => (
                <div
                  style={{
                    color: e.color,
                  }}
                >
                  {e.text}
                </div>
              ))}
          </div>
        </Card.Title>
      )}
      {!loading && (
        <SelectBudget budget={budget} handleChangeBudget={handleChangeBudget} />
      )}

      {!loading && (
        <div style={{ width: "100%", marginBottom: "1%" }}>
          <Button
            variant="outline-primary"
            style={{ width: "100%", marginBottom: "1%" }}
            onClick={() => navigate(`/monthly-budget/${budget}`)}
          >
            View Monthly Budget Breakdown
          </Button>
        </div>
      )}

      {!loading && (
        <BudgetTable entries={budgetHistory} onDelete={deleteBudgetEntry} />
      )}
      {!loading && (
        <Button
          variant="outline-secondary"
          style={{ width: "100%", marginBottom: "1%" }}
          onClick={() => fetchHistory(budgetHistory.length, budgetHistory)}
        >
          Show more
        </Button>
      )}
    </div>
  );
};
