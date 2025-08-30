import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { authClient } from "@/utils/authClient";
import { SignUpFormSchema } from "split-expense-shared-types";
import type { SignUpFormInput } from "split-expense-shared-types";
import "./index.css";

function SignUpPage() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			username: "",
			email: "",
			password: "",
			confirmPassword: "",
		} as SignUpFormInput,
		validators: {
			onChange: SignUpFormSchema,
		},
		onSubmit: async ({ value }) => {
			setLoading(true);
			setError("");

			try {
				// Use the better-auth client to make the API call
				const result = await authClient.signUp.email({
					email: value.email,
					password: value.password,
					username: value.username,
					name: `${value.firstName} ${value.lastName}`,
					firstName: value.firstName,
					lastName: value.lastName,
				} as any);
				if (result.error) {
					throw new Error(result.error.message);
				}
				// On success, redirect the user to the login page
				navigate("/login", {
					state: {
						message: "Account created successfully! Please log in.",
					},
				});
			} catch (err: any) {
				// Handle errors, e.g., username already exists
				console.error("Sign-up error:", err);
				setError(err.message || "Failed to create account. Please try again.");
			} finally {
				setLoading(false);
			}
		},
	});

	return (
		<div className="signup-container">
			<form
				className="signup-form"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<h1 className="signup-title">Create Account</h1>

				<form.Field name="firstName">
					{(field) => (
						<Input
							type="text"
							placeholder="First Name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-firstname-input"
						/>
					)}
				</form.Field>

				<form.Field name="lastName">
					{(field) => (
						<Input
							type="text"
							placeholder="Last Name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-lastname-input"
						/>
					)}
				</form.Field>

				<form.Field name="username">
					{(field) => (
						<Input
							type="text"
							placeholder="Username"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-username-input"
						/>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<Input
							type="email"
							placeholder="Email"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-email-input"
						/>
					)}
				</form.Field>

				<form.Field name="password">
					{(field) => (
						<Input
							type="password"
							placeholder="Password"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							minLength={6}
							data-test-id="signup-password-input"
						/>
					)}
				</form.Field>

				<form.Field name="confirmPassword">
					{(field) => (
						<Input
							type="password"
							placeholder="Confirm Password"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							minLength={6}
							data-test-id="signup-confirm-password-input"
						/>
					)}
				</form.Field>

				{error && (
					<div className="signup-error" data-test-id="signup-error">
						{error}
					</div>
				)}

				<Button
					type="submit"
					disabled={loading}
					data-test-id="signup-submit-button"
				>
					{loading ? <Loader /> : "Create Account"}
				</Button>

				<p className="signup-link">
					Already have an account? <a href="/login">Log in here</a>
				</p>
			</form>
		</div>
	);
}

export default SignUpPage;
