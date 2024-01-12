import axios from "axios";
import sha256 from "crypto-js/sha256";
import React, { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import { useCookies } from "react-cookie";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { setData, unsetData } from "./redux/data";

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [, setCookie] = useCookies(["userinfo"]);
  const dispatch = useDispatch();
  const [loading, setLoading] = useState<boolean>(false);
  const data = useSelector((state: any) => state.value);

  const handleLogin = (event: any) => {
    event.preventDefault();
    setLoading(true);
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
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    dispatch(unsetData());
  }, [dispatch]);
  return (
    <Container className="LoginWrapper">
      {loading && <div className="loader" style={{ margin: "auto" }}></div>}
      {!loading && (
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
      )}
    </Container>
  );
}

export default LoginPage;
