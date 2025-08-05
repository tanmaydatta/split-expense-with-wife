import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Loader } from "@/components/Loader";
import { authClient } from "@/utils/authClient";
import "./index.css";

function SignUpPage() {
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const navigate = useNavigate();
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");

	const handleSignUp = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		// Basic validation
		if (!username || !email || !password || !firstName || !lastName) {
			setError("All fields are required");
			setLoading(false);
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			setLoading(false);
			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters long");
			setLoading(false);
			return;
		}

		try {
			// Use the better-auth client to make the API call
			const result = await authClient.signUp.email({
				email,
				password,
				username,
				name: `${firstName} ${lastName}`,
				firstName,
				lastName,
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
		}
		setLoading(false);
	};

	return (
		<div className="signup-container">
			<form className="signup-form" onSubmit={handleSignUp}>
				<h1 className="signup-title">Create Account</h1>

				<Input
					type="text"
					placeholder="First Name"
					value={firstName}
					onChange={(e) => setFirstName(e.target.value)}
					required
					data-test-id="signup-firstname-input"
				/>

				<Input
					type="text"
					placeholder="Last Name"
					value={lastName}
					onChange={(e) => setLastName(e.target.value)}
					required
					data-test-id="signup-lastname-input"
				/>

				<Input
					type="text"
					placeholder="Username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
					data-test-id="signup-username-input"
				/>

				<Input
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					data-test-id="signup-email-input"
				/>

				<Input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					minLength={6}
					data-test-id="signup-password-input"
				/>

				<Input
					type="password"
					placeholder="Confirm Password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					required
					minLength={6}
					data-test-id="signup-confirm-password-input"
				/>

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
