import sha256 from "crypto-js/sha256";
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { setData, unsetData } from "@/redux/data";
import { typedApi } from "@/utils/api";
import { LoginRequest, LoginResponse } from '@shared-types';

const LoginContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
`;

const LoginForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.medium};
  width: 300px;
`;

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
      const loginRequest: LoginRequest = {
        username,
        password: sha256(password).toString()
      };
      
      const response: LoginResponse = await typedApi.post('/login', loginRequest);
      const { token, ...userData } = response;

      // Store token in local storage
      localStorage.setItem('sessionToken', token);

      // Dispatch user data to Redux store
      dispatch(setData(userData));

      // Redirect to home page
      navigate('/');
    } catch (err) {
      console.log('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    dispatch(unsetData());
  }, [dispatch]);
  return (
    <LoginContainer>
      {loading && <Loader />}
      {!loading && (
        <LoginForm onSubmit={handleLogin}>
          <Input
            placeholder="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit">
            Login
          </Button>
        </LoginForm>
      )}
    </LoginContainer>
  );
}

export default LoginPage;
