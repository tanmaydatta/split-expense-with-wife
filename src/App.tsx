import React, { useState } from "react";
import "./App.css";
import Button from "react-bootstrap/Button";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import ToggleButton from "react-bootstrap/ToggleButton";
import Form from "react-bootstrap/Form";
import axios from "axios";
import sha256 from "crypto-js/sha256";

function App(): JSX.Element {
  const [paidBy, setPaidBy] = useState("Tanmay");

  const handleChange = (val: string) => setPaidBy(val);

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
      <Form onSubmit={submit} style={{ justifyContent: "center" }}>
        <Form.Group className="mb-3" controlId="formBasicEmail">
          <Form.Control
            name="description"
            type="text"
            placeholder="Description"
          />
        </Form.Group>

        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Control
            type="number"
            placeholder="Amount"
            name="amount"
            step=".01"
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="formBasicPassword">
          <Form.Control type="password" placeholder="PIN" name="pin" />
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
    </div>
  );
}

export default App;
