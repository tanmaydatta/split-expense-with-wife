import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { unsetData } from "@/redux/data";
import { authClient } from "@/utils/authClient";
import { LoginFormSchema } from "split-expense-shared-types";
import type { LoginFormInput } from "split-expense-shared-types";
import "../auth.css";
import { store } from "@/redux/store";

function LoginPage() {
	const location = useLocation();
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");
	// Get success message from signup redirect
	const successMessage = location.state?.message;

	const form = useForm({
		defaultValues: {
			identifier: "",
			password: "",
		} as LoginFormInput,
		validators: {
			onChange: LoginFormSchema,
		},
		onSubmit: async ({ value }) => {
			setLoading(true);
			setError("");

			try {
				// Use username for better-auth username plugin
				const { data, error } = await authClient.signIn.username({
					username: value.identifier,
					password: value.password,
				});
				if (error) {
					throw error;
				}

				if (!data || !data.user) {
					throw new Error("No data returned from login");
				}
				console.log("login success, navigating to /");
				window.location.href = "/";
			} catch (err: any) {
				console.error("Login error:", err);
				setError("Invalid credentials. Please try again.");
			} finally {
				setLoading(false);
			}
		},
	});

	React.useEffect(() => {
		store.dispatch(unsetData());
	}, []);

	return (
		<div className="login-container auth-container" data-test-id="login-container">
			<Link className="auth-brand" to="/">Split Expense</Link>
			{loading && <Loader data-test-id="login-loader" />}
			{!loading && (
				<form
					className="login-form auth-form"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					data-test-id="login-form"
				>
					<h1 className="auth-title">Welcome Back</h1>
					<p className="auth-subtitle">Log in to see your group's expenses and budgets.</p>

					{successMessage && (
						<div className="login-success auth-message auth-message-success" role="status" data-test-id="login-success">
							{successMessage}
						</div>
					)}

					<div className="auth-field">
						<label htmlFor="login-identifier">Username or email</label>
					<form.Field name="identifier">
						{(field) => (
							<Input
								id="login-identifier"
								placeholder="Username or Email"
								type="text"
								autoComplete="username"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
								data-test-id="username-input"
							/>
						)}
					</form.Field>
					</div>

					<div className="auth-field">
						<label htmlFor="login-password">Password</label>
					<form.Field name="password">
						{(field) => (
							<Input
								id="login-password"
								placeholder="Password"
								type="password"
								autoComplete="current-password"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
								data-test-id="password-input"
							/>
						)}
					</form.Field>
					</div>

					{error && (
						<div className="login-error auth-message auth-message-error" role="alert" data-test-id="login-error">
							{error}
						</div>
					)}

					<Button type="submit" className="auth-submit" disabled={loading} data-test-id="login-button">
						{loading ? <Loader /> : "Login"}
					</Button>

					<p className="login-link auth-switch">
						Don't have an account? <Link to="/signup">Create an account</Link>
					</p>
				</form>
			)}
		</div>
	);
}

export default LoginPage;
