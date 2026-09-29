import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { authClient } from "@/utils/authClient";
import { SignUpFormSchema } from "split-expense-shared-types";
import type { SignUpFormInput } from "split-expense-shared-types";
import "../auth.css";

function useSignUpForm(
	navigate: NavigateFunction,
	setLoading: Dispatch<SetStateAction<boolean>>,
	setError: Dispatch<SetStateAction<string>>,
) {
	return useForm({
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
}

function SignUpPage() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");
	const form = useSignUpForm(navigate, setLoading, setError);

	return (
		<div className="signup-container auth-container">
			<Link className="auth-brand" to="/">Split Expense</Link>
			<form
				className="signup-form auth-form"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<h1 className="signup-title auth-title">Create Account</h1>
				<p className="auth-subtitle">Account creation is currently available to approved users.</p>

				<div className="auth-name-grid">
				<div className="auth-field">
					<label htmlFor="signup-firstname">First name</label>
				<form.Field name="firstName">
					{(field) => (
						<Input
							id="signup-firstname"
							type="text"
							autoComplete="given-name"
							placeholder="First Name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-firstname-input"
						/>
					)}
				</form.Field>
				</div>

				<div className="auth-field">
					<label htmlFor="signup-lastname">Last name</label>
				<form.Field name="lastName">
					{(field) => (
						<Input
							id="signup-lastname"
							type="text"
							autoComplete="family-name"
							placeholder="Last Name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-lastname-input"
						/>
					)}
				</form.Field>
				</div>
				</div>

				<div className="auth-field">
					<label htmlFor="signup-username">Username</label>
				<form.Field name="username">
					{(field) => (
						<Input
							id="signup-username"
							type="text"
							autoComplete="username"
							placeholder="Username"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-username-input"
						/>
					)}
				</form.Field>
				</div>

				<div className="auth-field">
					<label htmlFor="signup-email">Email</label>
				<form.Field name="email">
					{(field) => (
						<Input
							id="signup-email"
							type="email"
							autoComplete="email"
							placeholder="Email"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							data-test-id="signup-email-input"
						/>
					)}
				</form.Field>
				</div>

				<div className="auth-field">
					<label htmlFor="signup-password">Password</label>
				<form.Field name="password">
					{(field) => (
						<Input
							id="signup-password"
							type="password"
							autoComplete="new-password"
							placeholder="Password"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							minLength={6}
							data-test-id="signup-password-input"
						/>
					)}
				</form.Field>
				</div>

				<div className="auth-field">
					<label htmlFor="signup-confirm-password">Confirm password</label>
				<form.Field name="confirmPassword">
					{(field) => (
						<Input
							id="signup-confirm-password"
							type="password"
							autoComplete="new-password"
							placeholder="Confirm Password"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							required
							minLength={6}
							data-test-id="signup-confirm-password-input"
						/>
					)}
				</form.Field>
				</div>

				{error && (
					<div className="signup-error auth-message auth-message-error" role="alert" data-test-id="signup-error">
						{error}
					</div>
				)}

				<Button
					type="submit"
					className="auth-submit"
					disabled={loading}
					data-test-id="signup-submit-button"
				>
					{loading ? <Loader /> : "Create Account"}
				</Button>

				<p className="signup-link auth-switch">
					Already have an account? <Link to="/login">Log in</Link>
				</p>
			</form>
		</div>
	);
}

export default SignUpPage;
