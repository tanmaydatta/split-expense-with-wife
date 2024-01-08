import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import App from "./App";
import "./App.css";
import Balances from "./Balances";
import { Budget } from "./Budget";
import LoginPage from "./Login";
import { Logout } from "./Logout";
import Sidebar from "./Sidebar";
import Transactions from "./Transactions";

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
    <div className="AppWrapper">
      <Sidebar />
      <Routes>
        <Route path="/" element={withAuthCheck(App)({})} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/balances" element={withAuthCheck(Balances)({})} />
        <Route path="/budget" element={withAuthCheck(Budget)({})} />
        <Route path="/expenses" element={withAuthCheck(Transactions)({})} />
        <Route path="/logout" element={<Logout />} />
      </Routes>
    </div>
  );
}

export default AppWrapper;
