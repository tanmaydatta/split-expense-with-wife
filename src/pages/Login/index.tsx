import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { unsetData } from "@/redux/data";
import { authClient } from "@/utils/authClient";
import { LoginFormSchema } from "split-expense-shared-types";
import type { LoginFormInput } from "split-expense-shared-types";
import "./index.css";
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
		<div className="login-container" data-test-id="login-container">
			{loading && <Loader data-test-id="login-loader" />}
			{!loading && (
				<form
					className="login-form"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					data-test-id="login-form"
				>
					<h2>Welcome Back</h2>

					{successMessage && (
						<div className="login-success" data-test-id="login-success">
							{successMessage}
						</div>
					)}

					<form.Field name="identifier">
						{(field) => (
							<Input
								placeholder="Username or Email"
								type="text"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
								data-test-id="username-input"
							/>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<Input
								placeholder="Password"
								type="password"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
								data-test-id="password-input"
							/>
						)}
					</form.Field>

					{error && (
						<div className="login-error" data-test-id="login-error">
							{error}
						</div>
					)}

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
