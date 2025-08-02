import { Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import styled from "styled-components";
import { useState, useEffect } from "react";
import Dashboard from "@/pages/Dashboard";
import Balances from "@/pages/Balances";
import { Budget } from "@/pages/Budget";
import { GlobalStyles } from "@/components/theme/GlobalStyles";
import { theme } from "@/components/theme";
import LoginPage from "@/pages/Login";
import SignUpPage from "@/pages/SignUp";
import Logout  from "@/Logout";
import { MonthlyBudgetPage } from "@/pages/MonthlyBudgetPage";
import Sidebar from "@/components/Sidebar";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import { authClient } from "./utils/authClient";
import { setData } from "./redux/data";

import { store } from "./redux/store";
// import { Loader } from "./components/Loader";

const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
`;

const SidebarWrapper = styled.div<{ $isOpen: boolean }>`
  width: 250px;
  flex-shrink: 0;
  transition: transform 0.3s ease;
  
  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 1000;
    transform: translateX(${({ $isOpen }) => $isOpen ? '0' : '-100%'});
    background: ${({ theme }) => theme.colors.dark};
    box-shadow: ${({ theme }) => theme.shadows.large};
  }
`;

const MobileOverlay = styled.div<{ $isOpen: boolean }>`
  display: none;
  
  @media (max-width: 768px) {
    display: ${({ $isOpen }) => $isOpen ? 'block' : 'none'};
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }
`;

const MobileHeader = styled.div`
  display: none;
  
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({ theme }) => theme.spacing.medium};
    background: ${({ theme }) => theme.colors.white};
    border-bottom: 1px solid ${({ theme }) => theme.colors.light};
    position: sticky;
    top: 0;
    z-index: 100;
  }
`;

const HamburgerButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.small};
  display: flex;
  flex-direction: column;
  gap: 3px;
  
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

const MainContent = styled.div<{ $sidebarOpen: boolean }>`
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
  const session =  authClient.useSession();
  const {data, error} = session;
  console.log("session", session);
  const isAuthenticated = data?.user != null && error === null && !session.isPending;
  console.log("isAuthenticated", isAuthenticated, "isrefetching", (session as any).isRefetching);
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
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when clicking outside on mobile
  const handleOverlayClick = () => {
    setSidebarOpen(false);
  };

  // Get current page title based on location
  const getPageTitle = () => {
    const path = window.location.pathname;
    if (path === '/') return 'Add Expense';
    if (path === '/expenses') return 'Expenses';
    if (path === '/balances') return 'Balances';
    if (path === '/budget') return 'Budget';
    if (path.startsWith('/monthly-budget')) return 'Monthly Budget';
    if (path === '/settings') return 'Settings';
    if (path === '/logout') return 'Logout';
    return 'Page Not Found'; // For 404 and unknown routes
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
          <MobileOverlay $isOpen={sidebarOpen} onClick={handleOverlayClick} />
          <SidebarWrapper $isOpen={sidebarOpen}>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </SidebarWrapper>
          <MainContent $sidebarOpen={sidebarOpen}>
            {isMobile && (
              <MobileHeader>
                <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <span />
                  <span />
                  <span />
                </HamburgerButton>
                <PageTitle>{getPageTitle()}</PageTitle>
                <div style={{ width: '40px' }} /> {/* Spacer for centering */}
              </MobileHeader>
            )}
            <PageContent>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/balances" element={<Balances />} />
                <Route path="/budget" element={<Budget />} />
                <Route
                  path="/monthly-budget"
                  element={<MonthlyBudgetPage />}
                />
                <Route
                  path="/monthly-budget/:budgetName"
                  element={<MonthlyBudgetPage />}
                />
                <Route path="/expenses" element={<Transactions />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logout" element={<Logout />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PageContent>
          </MainContent>
        </AppContainer>
      ) : (
        <Routes>
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
