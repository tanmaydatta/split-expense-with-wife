import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import "./index.css";

const Landing: React.FC = () => {
	const features = [
		{
			icon: "💰",
			title: "Smart Expense Splitting",
			description:
				"Automatically split expenses between partners with flexible percentage allocation and multi-currency support.",
		},
		{
			icon: "📊",
			title: "Budget Management",
			description:
				"Set monthly budgets for different categories and track your spending with visual analytics and insights.",
		},
		{
			icon: "⚖️",
			title: "Balance Tracking",
			description:
				"Keep track of who owes whom with real-time balance calculations across multiple currencies.",
		},
		{
			icon: "📱",
			title: "Mobile Friendly",
			description:
				"Access your finances anywhere with a responsive design that works perfectly on all devices.",
		},
		{
			icon: "🔒",
			title: "Secure & Private",
			description:
				"Your financial data is protected with secure authentication and privacy-focused design.",
		},
		{
			icon: "📈",
			title: "Detailed Analytics",
			description:
				"View spending trends, monthly reports, and detailed transaction history to understand your finances better.",
		},
	];

	return (
		<div className="landing-container">
			<header className="landing-header">
				<h1 className="landing-logo">Split Expense</h1>
				<div className="header-actions">
					<Link to="/login">
						<Button as="div" className="header-button login-button">
							Login
						</Button>
					</Link>
					<Link to="/signup">
						<Button as="div" className="header-button signup-button">
							Sign Up
						</Button>
					</Link>
				</div>
			</header>

			<main className="landing-main">
				<section className="hero-section">
					<h1 className="hero-title">
						Manage Shared Expenses
						<br />
						<span className="hero-title-highlight">Effortlessly</span>
					</h1>
					<p className="hero-subtitle">
						The simple way for couples to track, split, and manage shared
						expenses. Set budgets, monitor balances, and keep your finances
						organized together.
					</p>
					<div className="hero-cta">
						<Link to="/signup">
							<Button as="div" className="hero-button hero-button-primary">
								Get Started Free
							</Button>
						</Link>
						<Link to="/login">
							<Button
								as="div"
								className="hero-button hero-button-secondary login-style"
							>
								I Have an Account
							</Button>
						</Link>
					</div>
				</section>

				<section className="features-section">
					<h2 className="section-title">
						Everything You Need to Manage Shared Finances
					</h2>
					<div className="features-grid">
						{features.map((feature, index) => (
							<Card key={index} className="feature-card">
								<div className="feature-icon">{feature.icon}</div>
								<h3 className="feature-title">{feature.title}</h3>
								<p className="feature-description">{feature.description}</p>
							</Card>
						))}
					</div>
				</section>

				<section className="cta-section">
					<h2 className="cta-title">Ready to Simplify Your Shared Finances?</h2>
					<p className="cta-description">
						Join couples who have already simplified their expense management.
						Start tracking, splitting, and budgeting together today.
					</p>
					<Link to="/signup">
						<Button as="div" className="cta-button">
							Start Your Journey
						</Button>
					</Link>
				</section>
			</main>

			<footer className="landing-footer">
				<p>
					&copy; 2025 Split Expense. Built with ❤️ for managing shared expenses
					efficiently.
				</p>
			</footer>
		</div>
	);
};

export default Landing;
