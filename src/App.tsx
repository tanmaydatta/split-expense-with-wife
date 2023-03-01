import React from "react";
import "./App.css";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import axios from "axios";

function App(): JSX.Element {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      description: { value: string };
      amount: { value: number };
    };
    console.log(target.amount.value);
    console.log(target.description.value);
    axios
      .post("/.netlify/functions/split", {
        amount: Number(target.amount.value),
        description: target.description.value,
      })
      .then((res) => alert(res.status))
      .catch((e) => alert(e.response.data));
  };
  return (
    <div className="App">
      <Form onSubmit={submit} style={{ justifyContent: "center" }}>
        <Form.Group
          style={{ width: "fit-content", alignItems: "center" }}
          className="mb-3"
          controlId="formBasicEmail"
        >
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
        <Button variant="primary" type="submit" style={{ width: "100%" }}>
          Submit
        </Button>
      </Form>
    </div>
  );
}

export default App;
