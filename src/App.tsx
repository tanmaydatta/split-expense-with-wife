import axios from "axios";
import sha256 from "crypto-js/sha256";
import React, { useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import { useSelector } from "react-redux";
import "./App.css";
import { SelectBudget } from "./SelectBudget";

function App(): JSX.Element {
  const [paidBy, setPaidBy] = useState("Tanmay");
  const [budget, setBudget] = useState("house");
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [splitPct, setSplitPct] = useState<number>(65);
  const [currency, setCurrency] = useState<string>("GBP");
  const [currencies, setCurrencies] = useState<Map<string, number>>(
    new Map<string, number>()
  );
  const data = useSelector((state: any) => state.value);
  // const [entries, setEntries] = useState<entry>();
  const handleChange = (val: string) => setPaidBy(val);
  const handleChangeBudget = (val: string) => setBudget(val);

  const fetchCurrencies = useCallback(() => {
    axios
      .get("https://api.exchangerate-api.com/v4/latest/GBP")
      .then((res) => {
        console.log(res.data);
        var currencies: Map<string, number> = new Map<string, number>();
        Object.keys(res.data.rates).map((key) =>
          currencies.set(key, res.data.rates[key])
        );
        console.log(currencies);
        setCurrencies(currencies);
      })
      .catch((e) => {
        console.log(e);
        alert(e);
      });
  }, []);

  React.useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);
  const submitBudget = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(currency);
    console.log(pin);
    axios
      .post("/.netlify/functions/budget", {
        amount: (-1 * Number(amount)) / (currencies.get(currency) || 1),
        description: description,
        pin: sha256(pin).toString(),
        name: budget,
        groupid: data.groupId,
      })
      .then((res) => {
        alert(res.status);
      })
      .catch((e) => alert(e.response.data));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      description: { value: string };
      amount: { value: number };
      pin: { value: string };
      splitPct: { value: number };
    };

    console.log(target);
    axios
      .post("/.netlify/functions/split", {
        amount: Number(target.amount.value) / (currencies.get(currency) || 1),
        description: target.description.value,
        paidBy: paidBy,
        pin: sha256(target.pin.value).toString(),
        splitPct: splitPct,
      })
      .then((res) => alert(res.status))
      .catch((e) => alert(e.response.data));
    var pctShares = new Map<string, number>();
    Object.keys(data.metadata.defaultShare).forEach((key) =>
      pctShares.set(String(key), data.metadata.defaultShare[key])
    );
    axios
      .post("/.netlify/functions/split_new", {
        amount: Number(target.amount.value),
        currency: currency,
        description: target.description.value,
        paidByShares: {
          [data.userId]: Number(target.amount.value),
        },
        pin: sha256(target.pin.value).toString(),
        splitPctShares: Object.fromEntries(pctShares),
      })
      .then((res) => alert(res.status))
      .catch((e) => alert(e.response.data));
  };
  return (
    <div className="App">
      <Form
        onSubmit={submit}
        style={{
          justifyContent: "center",
          width: "fit-content",
          margin: "1%",
        }}
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
            onChange={(e) => {
              setAmount(parseFloat(e.target.value));
            }}
          />
        </Form.Group>
        <Form.Label>Split Percentage: {splitPct}</Form.Label>
        <Form.Range
          name="splitPct"
          step={1}
          min={0}
          max={100}
          value={splitPct}
          onChange={(e) => {
            setSplitPct(parseInt(e.target.value));
          }}
        />
        <Form.Group className="mb-3">
          <Form.Select
            defaultValue={currency}
            name="currency"
            onChange={(v) => setCurrency(v.target.value)}
          >
            <option>Currency</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="INR">INR</option>
          </Form.Select>
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
          {data.users.map((u: { FirstName: string }) => (
            <ToggleButton
              key={u.FirstName}
              id={`radio-${u}`}
              type="radio"
              variant="outline-primary"
              name="radio"
              value={u.FirstName}
              checked={paidBy === u.FirstName}
            >
              {u.FirstName}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button variant="primary" type="submit" style={{ width: "100%" }}>
          Submit
        </Button>
      </Form>

      <Form
        onSubmit={submitBudget}
        style={{
          justifyContent: "center",
          width: "fit-content",
          margin: "1%",
        }}
      >
        <SelectBudget budget={budget} handleChangeBudget={handleChangeBudget} />

        <Button variant="primary" type="submit" style={{ width: "100%" }}>
          Submit
        </Button>
      </Form>
    </div>
  );
}

export default App;
