import Sidebar from "@/components/Sidebar";
import * as Dialog from "@radix-ui/react-dialog";
import { theme } from "@/components/theme";
import { GlobalStyles } from "@/components/theme/GlobalStyles";
import Logout from "@/Logout";
import Balances from "@/pages/Balances";
import BillsPage from "@/pages/Bills";
import { Budget } from "@/pages/Budget";
import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import LoginPage from "@/pages/Login";
import BudgetEntryDetail from "@/pages/BudgetEntryDetail";
import { MonthlyBudgetPage } from "@/pages/MonthlyBudgetPage";
import NotFound from "@/pages/NotFound";
import TransactionDetail from "@/pages/TransactionDetail";
import ScheduledActionsPage from "@/pages/ScheduledActions";
import ActionHistoryPage from "@/pages/ScheduledActions/ActionHistory";
import ScheduledActionEditPage from "@/pages/ScheduledActions/EditAction";
import HistoryRunDetailsPage from "@/pages/ScheduledActions/HistoryRunDetails";
// TODO: add a HistoryRunDetails page when available
import NewActionPage from "@/pages/ScheduledActions/NewAction";
import Settings from "@/pages/Settings";
import SignUpPage from "@/pages/SignUp";
import Transactions from "@/pages/Transactions";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import styled, { ThemeProvider } from "styled-components";
import { setData } from "./redux/data";
import { authClient } from "./utils/authClient";

import { store } from "./redux/store";
// import { Loader } from "./components/Loader";

const AppContainer = styled.div`
  display: flex;
  height: 100dvh;
  overflow: hidden;
  position: relative;
`;

const SidebarWrapper = styled.div`
  width: 260px;
  flex-shrink: 0;
  @media (max-width: 768px) { display: none; }
`;

const MobileOverlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(15, 26, 45, 0.56);
`;

const MobileMenu = styled(Dialog.Content)`
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 1000;
  width: min(280px, 85vw);
  height: 100dvh;
  background: #182338;
  box-shadow: 0 20px 50px rgba(11, 26, 52, 0.3);
  &:focus { outline: none; }
`;

const MobileMenuTitle = styled(Dialog.Title)`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
`;

const MobileHeader = styled.div`
  display: none;
  
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({ theme }) => theme.spacing.medium};
    background: ${({ theme }) => theme.colors.white};
    border-bottom: 1px solid var(--ui-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }
`;

const HamburgerButton = styled.button`
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  padding: 8px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  &:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: 2px; }
  
  span {
    width: 24px;
    height: 3px;
    background: ${({ theme }) => theme.colors.dark};
    border-radius: 2px;
    transition: all 0.3s ease;
  }
  
  &:hover span {
    background: ${({ theme }) => theme.colors.primary};
  }
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.large};
  color: ${({ theme }) => theme.colors.dark};
  font-weight: 600;
`;

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  
  @media (min-width: 769px) {
    padding: ${({ theme }) => theme.spacing.medium};
  }
  
  @media (max-width: 768px) {
    width: 100%;
    padding: 0;
  }
`;

const PageContent = styled.div`
  @media (max-width: 768px) {
    padding: ${({ theme }) => theme.spacing.medium};
  }
`;

// Create wrapped components outside of render to prevent recreation
function AppWrapper() {
	const location = useLocation();
	const session = authClient.useSession();
	const { data, error } = session;
	console.log("session", session);
	const isAuthenticated =
		data?.user != null && error === null && !session.isPending;
	console.log(
		"isAuthenticated",
		isAuthenticated,
		"isrefetching",
		(session as any).isRefetching,
	);
	console.log("data", data);
	console.log("data?.user", data?.user);
	console.log("error", error);
	console.log("window.location.pathname", window.location.pathname);

	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		if (data) {
			console.log("dispatching data", data);
			store.dispatch(setData(data));
		}
	}, [data]);

	// Check if we're on mobile
	useEffect(() => {
		const checkMobile = () => {
			const mobile = window.innerWidth <= 768;
			setIsMobile(mobile);
			if (!mobile) setSidebarOpen(false);
		};

		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// Get current page title based on location
	const getPageTitle = () => {
		const path = location.pathname;
		if (path === "/") return "Add Expense";
		if (path === "/expenses") return "Expenses";
		if (path === "/balances") return "Balances";
		if (path === "/bills") return "Shared Bills";
		if (path === "/budget") return "Budget";
		if (path.startsWith("/monthly-budget")) return "Monthly Budget";
		if (path === "/settings") return "Settings";
		if (path === "/scheduled-actions") return "Scheduled Actions";
		if (path === "/logout") return "Logout";
		if (path.startsWith("/transaction/")) return "Transaction";
		if (path.startsWith("/budget-entry/")) return "Budget Entry";
		return "Page Not Found"; // For 404 and unknown routes
	};
	// Show loading while session data is being fetched
	if (session.isPending) {
		console.log("loading");
		return <div>Loading...</div>;
	}

	return (
		<ThemeProvider theme={theme}>
			<GlobalStyles />
			{isAuthenticated ? (
				<AppContainer>
					<SidebarWrapper>
						<Sidebar onNavigate={() => setSidebarOpen(false)} />
					</SidebarWrapper>
					<MainContent>
						{isMobile && (
							<MobileHeader>
								<Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
									<Dialog.Trigger asChild>
										<HamburgerButton type="button" aria-label="Open navigation">
											<span />
											<span />
											<span />
										</HamburgerButton>
									</Dialog.Trigger>
									<Dialog.Portal>
										<MobileOverlay />
										<MobileMenu id="main-navigation" aria-describedby={undefined}>
											<MobileMenuTitle>Navigation</MobileMenuTitle>
											<Sidebar onNavigate={() => setSidebarOpen(false)} />
										</MobileMenu>
									</Dialog.Portal>
								</Dialog.Root>
								<PageTitle>{getPageTitle()}</PageTitle>
								<div style={{ width: "40px" }} /> {/* Spacer for centering */}
							</MobileHeader>
						)}
						<PageContent>
							<Routes>
								<Route path="/" element={<Dashboard />} />
								<Route path="/balances" element={<Balances />} />
								<Route path="/bills" element={<BillsPage />} />
								<Route path="/budget" element={<Budget />} />
								<Route path="/monthly-budget" element={<MonthlyBudgetPage />} />
								<Route
									path="/monthly-budget/:budgetName"
									element={<MonthlyBudgetPage />}
								/>
								<Route path="/expenses" element={<Transactions />} />
								<Route path="/settings" element={<Settings />} />
								<Route
									path="/scheduled-actions"
									element={<ScheduledActionsPage />}
								/>
								<Route
									path="/scheduled-actions/new"
									element={<NewActionPage />}
								/>
								<Route
									path="/scheduled-actions/:id"
									element={<ActionHistoryPage />}
								/>
								<Route
									path="/scheduled-actions/history/run/:historyId"
									element={<HistoryRunDetailsPage />}
								/>
								<Route
									path="/scheduled-actions/:id/edit"
									element={<ScheduledActionEditPage />}
								/>
								<Route
									path="/transaction/:id"
									element={<TransactionDetail />}
								/>
								<Route
									path="/budget-entry/:id"
									element={<BudgetEntryDetail />}
								/>
								<Route path="/logout" element={<Logout />} />
								<Route path="*" element={<NotFound />} />
							</Routes>
						</PageContent>
					</MainContent>
				</AppContainer>
			) : (
				<Routes>
					<Route path="/" element={<Landing />} />
					<Route path="/login" element={<LoginPage />} />
					<Route path="/signup" element={<SignUpPage />} />
					{/* Redirect all other routes to login when unauthenticated */}
					<Route path="*" element={<Navigate to="/login" replace />} />
				</Routes>
			)}
		</ThemeProvider>
	);
}

export default AppWrapper;
