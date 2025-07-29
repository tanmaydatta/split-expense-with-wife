import { Route, Routes } from "react-router-dom";
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
import { useDispatch } from "react-redux";

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

function withAuthCheck(Component: React.ComponentType) {
  return function AuthenticatedComponent(props: any): JSX.Element {
    // Use centralized authentication check
  const {data, error} =  authClient.useSession();
  const isAuthenticated = data?.user !== null && error === null;
    if (!isAuthenticated) {
      return <LoginPage />;
    }
    
    return <Component {...props} />;
  };
}

// Create wrapped components outside of render to prevent recreation
const AuthenticatedDashboard = withAuthCheck(Dashboard);
const AuthenticatedBalances = withAuthCheck(Balances);
const AuthenticatedBudget = withAuthCheck(Budget);
const AuthenticatedMonthlyBudgetPage = withAuthCheck(MonthlyBudgetPage);
const AuthenticatedTransactions = withAuthCheck(Transactions);
const AuthenticatedSettings = withAuthCheck(Settings);

function AppWrapper() {
  const {data, error} =  authClient.useSession();
  const isAuthenticated = data?.user != null && error === null;
  console.log("isAuthenticated", isAuthenticated);
  console.log("data", data);
  console.log("data?.user", data?.user);
  console.log("error", error);
  const dispatch = useDispatch();
  dispatch(setData(data));

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
                <Route path="/" element={<AuthenticatedDashboard />} />
                <Route path="/balances" element={<AuthenticatedBalances />} />
                <Route path="/budget" element={<AuthenticatedBudget />} />
                <Route
                  path="/monthly-budget"
                  element={<AuthenticatedMonthlyBudgetPage />}
                />
                <Route
                  path="/monthly-budget/:budgetName"
                  element={<AuthenticatedMonthlyBudgetPage />}
                />
                <Route path="/expenses" element={<AuthenticatedTransactions />} />
                <Route path="/settings" element={<AuthenticatedSettings />} />
                <Route path="/logout" element={<Logout />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PageContent>
          </MainContent>
        </AppContainer>
      ) : (
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/balances" element={<LoginPage />} />
          <Route path="/budget" element={<LoginPage />} />
          <Route path="/monthly-budget" element={<LoginPage />} />
          <Route path="/monthly-budget/:budgetName" element={<LoginPage />} />
          <Route path="/expenses" element={<LoginPage />} />
          <Route path="/settings" element={<LoginPage />} />
          <Route path="/logout" element={<LoginPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </ThemeProvider>
  );
}

export default AppWrapper;
