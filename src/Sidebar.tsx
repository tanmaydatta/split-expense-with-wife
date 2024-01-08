import { useNavigate } from "react-router-dom";
import "./Sidebar.css";

function Sidebar(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="Sidebar">
      <div className="SidebarItem" onClick={() => navigate("/")}>
        Add
      </div>
      <div className="SidebarItem" onClick={() => navigate("/expenses")}>
        Expenses
      </div>
      <div className="SidebarItem" onClick={() => navigate("/balances")}>
        Balances
      </div>
      <div className="SidebarItem" onClick={() => navigate("/budget")}>
        Budget
      </div>
      <div className="SidebarItem" onClick={() => navigate("/logout")}>
        Logout
      </div>
    </div>
  );
}

export default Sidebar;
