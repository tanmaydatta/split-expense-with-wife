import React from "react";
import { Link } from "react-router-dom";
import "./index.css";

const features = [
	{
		number: "01",
		title: "Split shared expenses",
		description: "Record who paid and choose how each person shares the cost.",
	},
	{
		number: "02",
		title: "Know where you stand",
		description: "See balances by person and currency in one place.",
	},
	{
		number: "03",
		title: "Keep budgets in view",
		description: "Group entries by category and follow spending over time.",
	},
	{
		number: "04",
		title: "Plan repeat actions",
		description: "Schedule recurring expenses and budget updates.",
	},
];

const Landing: React.FC = () => (
	<div className="landing-container">
		<header className="landing-header">
			<Link className="landing-logo" to="/" aria-label="Split Expense home">Split Expense</Link>
			<nav className="landing-nav" aria-label="Account">
				<Link className="landing-link" to="/login">Log in</Link>
				<Link className="landing-button landing-button-primary" to="/signup">Create account</Link>
			</nav>
		</header>

		<main className="landing-main">
			<section className="hero-section" aria-labelledby="landing-title">
				<div className="hero-copy">
					<p className="hero-eyebrow">Shared money, made clearer</p>
					<h1 id="landing-title">Keep shared expenses in one place.</h1>
					<p className="hero-subtitle">
						Track what you spend together, see what each person owes, and stay on top of your budgets.
					</p>
					<div className="hero-cta">
						<Link className="landing-button landing-button-primary" to="/signup">Create account</Link>
						<Link className="landing-button landing-button-secondary" to="/login">Log in</Link>
					</div>
					<p className="hero-note">Account creation is currently available to approved users.</p>
				</div>
				<aside className="landing-example" aria-label="Example expense split">
					<p className="example-caption">An example split</p>
					<div className="example-heading"><span>Groceries</span><strong>£64.00</strong></div>
					<p className="example-detail">Paid by Alex · split equally</p>
					<div className="example-divider" />
					<div className="example-share"><span>Alex's share</span><strong>£32.00</strong></div>
					<div className="example-share"><span>Sam's share</span><strong>£32.00</strong></div>
				</aside>
			</section>

			<section className="features-section" aria-labelledby="features-title">
				<div className="features-heading">
					<p className="section-eyebrow">The essentials</p>
					<h2 id="features-title">A clearer view of your shared finances</h2>
				</div>
				<div className="features-grid">
					{features.map((feature) => (
						<article className="feature-card" key={feature.number}>
							<span className="feature-number" aria-hidden="true">{feature.number}</span>
							<h3>{feature.title}</h3>
							<p>{feature.description}</p>
						</article>
					))}
				</div>
			</section>
		</main>

		<footer className="landing-footer">© {new Date().getFullYear()} Split Expense</footer>
	</div>
);

export default Landing;
