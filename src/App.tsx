import axios from "axios";
import sha256 from "crypto-js/sha256";
import React, { useCallback, useState } from "react";
import { Card } from "react-bootstrap";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import "./App.css";
import BudgetTable, { entry } from "./BudgetTable";

function App(): JSX.Element {
  const [paidBy, setPaidBy] = useState("Tanmay");
  const [budget, setBudget] = useState("house");
  const [budgetLeft, setBudgetLeft] = useState(0.0);
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [budgetHistory, setBudgetHistory] = useState<entry[]>([]);
  // const [entries, setEntries] = useState<entry>();
  const handleChange = (val: string) => setPaidBy(val);
  const handleChangeBudget = (val: string) => setBudget(val);
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
        alert(e.response.data);
      });
  }, [budget]);

  const fetchHistory = useCallback(() => {
    axios
      .post("/.netlify/functions/budget_list", {
        name: budget,
      })
      .then((res) => {
        console.log(res.data);
        var entries: entry[] = [];
        (res.data as []).map(
          (e: { added_time: string; description: string; price: string }) =>
            entries.push({
              date: e.added_time,
              description: e.description as string,
              amount: e.price,
            })
        );
        console.log(entries);
        setBudgetHistory(entries);
      })
      .catch((e) => {
        console.log(e);
        alert(e.response.data);
      });
  }, [budget]);

  React.useEffect(() => {
    fetchTotal();
    fetchHistory();
  }, [fetchTotal, fetchHistory]);

  const submitBudget = (e: React.FormEvent) => {
    e.preventDefault();
    axios
      .post("/.netlify/functions/budget", {
        amount: -1 * Number(amount),
        description: description,
        pin: sha256(pin).toString(),
        name: budget,
      })
      .then((res) => {
        alert(res.status);
        fetchTotal();
        fetchHistory();
      })
      .catch((e) => alert(e.response.data));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      description: { value: string };
      amount: { value: number };
      pin: { value: string };
    };

    console.log(target.amount.value);
    console.log(target.description.value);
    axios
      .post("/.netlify/functions/split", {
        amount: Number(target.amount.value),
        description: target.description.value,
        paidBy: paidBy,
        pin: sha256(target.pin.value).toString(),
      })
      .then((res) => alert(res.status))
      .catch((e) => alert(e.response.data));
  };

  return (
    <div className="App">
      <Form
        onSubmit={submit}
        style={{ justifyContent: "center", width: "fit-content", margin: "1%" }}
      >
        <Form.Group className="mb-3" controlId="formBasicEmail">
          <Form.Control
            name="description"
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Form.Group>

        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Control
            type="number"
            placeholder="Amount"
            name="amount"
            step=".01"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Control
            type="password"
            placeholder="PIN"
            name="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </Form.Group>
        <ToggleButtonGroup
          style={{ width: "100%" }}
          className="mb-2"
          name="paidBy"
          value={paidBy}
          onChange={handleChange}
        >
          <ToggleButton
            key={0}
            id={`radio-0`}
            type="radio"
            variant="outline-primary"
            name="radio"
            value={"Aayushi"}
            checked={true}
          >
            Aayushi
          </ToggleButton>
          <ToggleButton
            key={1}
            id={`radio-1`}
            type="radio"
            variant="outline-primary"
            name="radio"
            value={"Tanmay"}
            checked={false}
          >
            Tanmay
          </ToggleButton>
        </ToggleButtonGroup>
        <Button variant="primary" type="submit" style={{ width: "100%" }}>
          Submit
        </Button>
      </Form>
      <Card.Title style={{ marginTop: "1%" }}>
        Budget left:{" "}
        <span style={{ color: budgetLeft > 0 ? "green" : "red" }}>
          {budgetLeft}
        </span>
      </Card.Title>
      ;
      <Form
        onSubmit={submitBudget}
        style={{ justifyContent: "center", width: "fit-content", margin: "1%" }}
      >
        <ToggleButtonGroup
          style={{ width: "100%" }}
          className="mb-2"
          name="budget"
          value={budget}
          onChange={handleChangeBudget}
        >
          <ToggleButton
            key={"house-budget"}
            id={`radio-budget`}
            type="radio"
            variant="outline-primary"
            name="radio"
            value={"house"}
            checked={true}
          >
            House
          </ToggleButton>
          <ToggleButton
            key={"aayushi-budget"}
            id={`radio-aayushi`}
            type="radio"
            variant="outline-primary"
            name="radio"
            value={"aayushi"}
            checked={false}
          >
            Aayushi
          </ToggleButton>
          <ToggleButton
            key={"tanmay-budget"}
            id={`radio-tanmay`}
            type="radio"
            variant="outline-primary"
            name="radio"
            value={"tanmay"}
            checked={false}
          >
            Tanmay
          </ToggleButton>
        </ToggleButtonGroup>
        <BudgetTable entries={budgetHistory} />
        <Button variant="primary" type="submit" style={{ width: "100%" }}>
          Submit
        </Button>
      </Form>
    </div>
  );
}

export default App;
