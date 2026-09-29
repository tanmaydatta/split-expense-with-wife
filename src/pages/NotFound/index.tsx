import { useNavigate } from "react-router-dom";
import { Surface, UiButton, UiPage } from "@/components/ui";
import "./index.css";

function NotFound(): JSX.Element {
	const navigate = useNavigate();

	return (
		<UiPage data-test-id="not-found-container">
			<Surface className="not-found-card">
				<p className="not-found-code">404</p>
				<h1>Page not found</h1>
				<p>The page may have moved. Go back or return to the home page.</p>
				<div className="not-found-actions">
					<UiButton type="button" onClick={() => navigate(-1)} data-test-id="go-back-button">Go back</UiButton>
					<UiButton type="button" $tone="primary" onClick={() => navigate("/")} data-test-id="go-home-button">Go home</UiButton>
				</div>
			</Surface>
		</UiPage>
	);
}

export default NotFound;
