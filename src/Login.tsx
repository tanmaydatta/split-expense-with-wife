import axios from "axios";
import sha256 from "crypto-js/sha256";
import { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import { useCookies } from "react-cookie";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { setData } from "./redux/data";

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [, setCookie] = useCookies(["userinfo"]);
  const dispatch = useDispatch();

  const handleLogin = (event: any) => {
    event.preventDefault();

    axios
      .post("/.netlify/functions/login", {
        username: username,
        password: sha256(password).toString(),
      })
      .then((res) => {
        setCookie("userinfo", res.data, { path: "/" });
        dispatch(setData(res.data));
        navigate("/");
      })
      .catch((e) => {
        console.log(e);
        alert(e.response.data);
      });
  };

  return (
    <Container className="LoginWrapper">
      <Form onSubmit={handleLogin}>
        <Form.Group>
          <Form.Control
            placeholder="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Form.Group>
        <Form.Group>
          <Form.Control
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Form.Group>
        <Button variant="primary" type="submit" className="LoginButton">
          Login
        </Button>
      </Form>
    </Container>
  );
}

export default LoginPage;