import sha256 from "crypto-js/sha256";
import getSymbolFromCurrency from "currency-symbol-map";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./Budget.css";
import BudgetTable from "./BudgetTable";
import { SelectBudget } from "./SelectBudget";
import { entry } from "./model";
import { typedApi } from "./utils/api";
import { BudgetListRequest, BudgetTotalRequest, BudgetDeleteRequest, BudgetEntry, BudgetTotal } from '../shared-types';

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
  const fetchTotal = useCallback(async () => {
    try {
      const request: BudgetTotalRequest = {
        pin: "", // Will be updated when we implement PIN properly
        name: budget,
      };
      
      const response: BudgetTotal[] = await typedApi.post("/budget_total", request);
      setBudgetsLeft(response);
    } catch (e: any) {
      console.log(e);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    }
  }, [budget, navigate]);

  const fetchHistory = useCallback(
    async (offset: number, history: entry[]) => {
      setLoading(true);
      try {
        const request: BudgetListRequest = {
          name: budget,
          offset: offset,
          pin: "", // Will be updated when we implement PIN properly
        };
        
        const response: BudgetEntry[] = await typedApi.post("/budget_list", request);
        console.log(response);
        var entries: entry[] = [];
        response.map(
          (e: BudgetEntry) =>
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
      } catch (e: any) {
        console.log(e);
        if (e.response?.status === 401) {
          navigate("/login");
        }
      } finally {
        setLoading(false);
      }
    },
    [budget, navigate]
  );
  const deleteBudgetEntry = async (id: number) => {
    setLoading(true);
    try {
      const request: BudgetDeleteRequest = {
        id: id,
        pin: sha256(pin).toString(),
      };
      
      const response: { message: string } = await typedApi.post("/budget_delete", request);
      alert(response.message);
      fetchTotal();
      fetchHistory(0, []);
    } catch (e: any) {
      alert(e.response?.data);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
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
