import axios from "axios";
import sha256 from "crypto-js/sha256";
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
  const [budgetLeft, setBudgetLeft] = useState(0.0);
  const [pin, setPin] = useState("");
  const handleChangeBudget = (val: string) => setBudget(val);
  const navigate = useNavigate();
  const fetchTotal = useCallback(() => {
    axios
      .post("/.netlify/functions/budget_total", {
        name: budget,
      })
      .then((res) => {
        setBudgetLeft(res.data.sum);
      })
      .catch((e) => {
        console.log(e);
        navigate("/login");
      });
  }, [budget, navigate]);

  const fetchHistory = useCallback(
    (offset: number, history: entry[]) => {
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
            }) =>
              entries.push({
                id: e.id,
                date: e.added_time,
                description: e.description as string,
                amount: e.price,
                deleted: e.deleted,
              })
          );

          console.log([...history, ...entries]);
          setBudgetHistory([...history, ...entries]);
        })
        .catch((e) => {
          console.log(e);
          navigate("/login");
        });
    },
    [budget, navigate]
  );
  const deleteBudgetEntry = (id: number) => {
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
      .catch((e) => alert(e.response.data));
  };
  useEffect(() => {
    fetchTotal();
    fetchHistory(0, []);
  }, [fetchTotal, fetchHistory]);
  return (
    <div className="Budget">
      <Form.Group className="mb-3" controlId="formBasicPassword">
        <Form.Control
          type="password"
          placeholder="PIN"
          name="pin"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </Form.Group>
      <Card.Title style={{ marginTop: "1%" }}>
        Budget left:{" "}
        <span style={{ color: budgetLeft > 0 ? "green" : "red" }}>
          {budgetLeft}
        </span>
      </Card.Title>
      <SelectBudget budget={budget} handleChangeBudget={handleChangeBudget} />

      <BudgetTable entries={budgetHistory} onDelete={deleteBudgetEntry} />
      <Button
        variant="outline-secondary"
        style={{ width: "100%", marginBottom: "1%" }}
        onClick={() => fetchHistory(budgetHistory.length, budgetHistory)}
      >
        Show more
      </Button>
    </div>
  );
};
