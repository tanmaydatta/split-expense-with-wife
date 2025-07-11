import sha256 from "crypto-js/sha256";
import React, { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import { useCookies } from "react-cookie";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { setData, unsetData } from "./redux/data";
import api from "./utils/api";

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/login', { username, password: sha256(password).toString() });
      const { token, ...userData } = response.data;

      // Store token in local storage
      localStorage.setItem('sessionToken', token);

      // Dispatch user data to Redux store
      dispatch(setData(userData));

      // Redirect to home page
      navigate('/');
    } catch (err) {
      console.log('Invalid username or password');
    }
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
