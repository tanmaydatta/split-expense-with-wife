import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import Dashboard from "./pages/Dashboard";
import Balances from "./Balances";
import { Budget } from "./pages/Budget";
import { GlobalStyles } from "./components/theme/GlobalStyles";
import { theme } from "./components/theme";
import LoginPage from "./pages/Login";
import Logout  from "./Logout";
import { MonthlyBudgetPage } from "./pages/MonthlyBudgetPage";
import Sidebar from "./components/Sidebar";
import Transactions from "./pages/Transactions";

function withAuthCheck(Component: React.ComponentType) {
  return function AuthenticatedComponent(props: any): React.ReactNode {
    const data = useSelector((state: any) => state.value);
    console.log("data withauthcheck", data.groupId);

    // useEffect(() => {
    if (Object.keys(data).length === 0) return <LoginPage />;
    // }, [data, navigate]);

    return <Component {...props} />;
  };
}

function AppWrapper() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <div className="AppWrapper">
        <Sidebar />
        <Routes>
          <Route path="/" element={withAuthCheck(Dashboard)({})} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/balances" element={withAuthCheck(Balances)({})} />
          <Route path="/budget" element={withAuthCheck(Budget)({})} />
          <Route
            path="/monthly-budget"
            element={withAuthCheck(MonthlyBudgetPage)({})}
          />
          <Route
            path="/monthly-budget/:budgetName"
            element={withAuthCheck(MonthlyBudgetPage)({})}
          />
          <Route path="/expenses" element={withAuthCheck(Transactions)({})} />
          <Route path="/logout" element={<Logout />} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default AppWrapper;
