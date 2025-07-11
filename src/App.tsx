import sha256 from "crypto-js/sha256";
import React, { useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { CreditDebit } from "./CreditDebit";
import { SelectBudget } from "./SelectBudget";
import api from "./utils/api";
import axios from "axios";

function App(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const [budget, setBudget] = useState("house");
  const [creditDebit, setCreditDebit] = useState("Debit");
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
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
  const handleChangeCreditDebit = (val: string) => setCreditDebit(val);

  const submitBudget = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log(currency);
    api
      .post("/budget", {
        amount: (creditDebit === 'Debit' ? -1 : 1) * Number(amount),
        description: description,
        pin: sha256(pin).toString(),
        name: budget,
        groupid: data.groupId,
        currency: currency,
      })
      .then((res) => {
        console.log("res", res);
        alert(res.status);
      })
      .catch((e) => {
        alert(e.response.data);
        if (e.response.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
          amount: Number(target.amount.value),
          description: target.description.value,
          paidBy: paidBy.Name,
          pin: sha256(target.pin.value).toString(),
          splitPct: splitPctShares.get("1"),
          currency: currency,
        })
        .then((res) => alert(res.status))
        .catch((e) => alert(e.response.data));
    }
    api
      .post("/split_new", {
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
      .catch((e) => {
        alert(e.response.data);
        if (e.response.status === 401) {
          navigate("/login");
        }
      })
      .finally(() => setLoading(false));
  };
  return (
    <>
      {loading && (
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="loader"></div>
        </div>
      )}
      {!loading && (
        <div className="App">
          <Form
            onSubmit={submit}
            className="ExpenseForm"
            style={{
              justifyContent: "center",
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
              className="SplitPercentageContainer"
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                flexWrap: "wrap",
                width: "100%",
              }}
            >
              {data.users.map(
                (u: { FirstName: string; Id: number }, i: Number) => (
                  <div
                    className="SplitPercentageInput"
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
                        newSplitPctShares.set(
                          String(u.Id),
                          Number(e.target.value)
                        );
                        setSplitPctShares(newSplitPctShares);
                      }}
                    />
                  </div>
                )
              )}
            </div>
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
            <SelectBudget
              budget={budget}
              handleChangeBudget={handleChangeBudget}
            />
            <CreditDebit
              budget={creditDebit}
              handleChangeBudget={handleChangeCreditDebit}
            />

            <Button variant="primary" type="submit" style={{ width: "100%" }}>
              Submit
            </Button>
          </Form>
        </div>
      )}
    </>
  );
}

export default App;
