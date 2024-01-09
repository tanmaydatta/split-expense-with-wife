import axios from "axios";
import sha256 from "crypto-js/sha256";
import React, { useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useSelector } from "react-redux";
import "./App.css";
import { SelectBudget } from "./SelectBudget";

function App(): JSX.Element {
  const [budget, setBudget] = useState("house");
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [splitPct, setSplitPct] = useState<number>(65);
  const [currencies, setCurrencies] = useState<Map<string, number>>(
    new Map<string, number>()
  );
  const [splitPctShares, setSplitPctShares] = useState<Map<string, number>>(
    new Map<string, number>()
  );
  const data = useSelector((state: any) => state.value);
  const [paidBy, setPaidBy] = useState<{ Id: number; Name: string }>({
    Id: data.userId,
    Name:
      data.users.find(
        (u: { Id: number; FirstName: string }) => u.Id === data.userId
      )?.FirstName || "",
  });
  const [currency, setCurrency] = useState<string>(
    data.metadata.defaultCurrency || "INR"
  );
  React.useEffect(() => {
    var localSplitShares = new Map<string, number>();
    Object.keys(data.metadata.defaultShare).forEach((key) =>
      localSplitShares.set(String(key), data.metadata.defaultShare[key])
    );
    setSplitPctShares(localSplitShares);
  }, [data.metadata.defaultShare, setSplitPctShares]);
  // const [entries, setEntries] = useState<entry>();
  // const handleChange = (val: string) => setPaidBy(val);
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
    if (data.groupId === 1) {
      axios
        .post("/.netlify/functions/split", {
          amount: Number(target.amount.value) / (currencies.get(currency) || 1),
          description: target.description.value,
          paidBy: paidBy.Name,
          pin: sha256(target.pin.value).toString(),
          splitPct: splitPct,
        })
        .then((res) => alert(res.status))
        .catch((e) => alert(e.response.data));
    }
    axios
      .post("/.netlify/functions/split_new", {
        amount: Number(target.amount.value),
        currency: currency,
        description: target.description.value,
        paidByShares: {
          [paidBy.Id]: Number(target.amount.value),
        },
        pin: sha256(target.pin.value).toString(),
        splitPctShares: Object.fromEntries(splitPctShares),
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
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {data.users.map((u: { FirstName: string; Id: number }, i: Number) => (
            <div
              style={{
                height: "fit-content",
                width: "fit-content",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Form.Label>
                {u.FirstName}
                {"%"}
              </Form.Label>
              <Form.Control
                type="number"
                placeholder={u.FirstName + "%"}
                value={splitPctShares.get(String(u.Id))}
                onChange={(e) => {
                  var newSplitPctShares = new Map(splitPctShares);
                  newSplitPctShares.set(String(u.Id), Number(e.target.value));
                  setSplitPctShares(newSplitPctShares);
                }}
              />
            </div>
          ))}
        </div>
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
        <Form.Group className="mb-3">
          <Form.Label>Paid by</Form.Label>{" "}
          <Form.Select
            defaultValue={data.userId}
            name="paidBy"
            onChange={(v) => {
              console.log(v.target.value);
              setPaidBy({
                Id: Number(v.target.value),
                Name:
                  data.users.find(
                    (u: { Id: number; FirstName: string }) =>
                      u.Id === Number(v.target.value)
                  )?.FirstName || "",
              });
            }}
          >
            {data.users.map(
              (u: { FirstName: string; Id: number }, i: Number) => (
                <option value={u.Id}>{u.FirstName}</option>
              )
            )}
          </Form.Select>
        </Form.Group>
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
