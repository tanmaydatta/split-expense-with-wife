import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { setData, unsetData } from "@/redux/data";
import { authClient } from "@/utils/authClient";
import "./index.css";
import { store } from "@/redux/store";

function LoginPage() {
  const [identifier, setIdentifier] = useState(""); // Can be username or email
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  // Get success message from signup redirect
  const successMessage = location.state?.message;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      // Use username for better-auth username plugin
      const {data, error} = await authClient.signIn.username({ 
        username: identifier, 
        password 
      });
      if (error) {
        throw error;
      }
      
      if (!data || !data.user) {
        throw new Error("No data returned from login");
      }
      console.log("login success, navigating to /");
      window.location.href = '/';
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    store.dispatch(unsetData());
  }, [store]);
  return (
    <div className="login-container" data-test-id="login-container">
      {loading && <Loader data-test-id="login-loader" />}
      {!loading && (
        <form className="login-form" onSubmit={handleLogin} data-test-id="login-form">
          <h2>Welcome Back</h2>
          
          {successMessage && (
            <div className="login-success" data-test-id="login-success">
              {successMessage}
            </div>
          )}
          
          <Input
            placeholder="Username or Email"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            data-test-id="username-input"
          />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            data-test-id="password-input"
          />
          
          {error && <div className="login-error" data-test-id="login-error">{error}</div>}
          
          <Button type="submit" disabled={loading} data-test-id="login-button">
            {loading ? <Loader /> : "Login"}
          </Button>
          
          <p className="login-link">
            Don't have an account? <a href="/signup">Sign up here</a>
          </p>
        </form>
      )}
    </div>
  );
}

export default LoginPage;
