import "bootstrap/dist/css/bootstrap.min.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import AppWrapper from "./AppWrapper";
import "./index.css";
import { persistor, store } from "./redux/store";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement,
);
root.render(
	<React.StrictMode>
		<BrowserRouter>
			<Provider store={store}>
				<PersistGate loading={null} persistor={persistor}>
					<QueryClientProvider client={queryClient}>
						<AppWrapper />
					</QueryClientProvider>
				</PersistGate>
			</Provider>
		</BrowserRouter>
	</React.StrictMode>,
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();
