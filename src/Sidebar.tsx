import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import "./Sidebar.css";

function Sidebar(): JSX.Element {
  const navigate = useNavigate();
  const data = useSelector((state: any) => state.value);
  return (
    <div className="Sidebar">
      <div className="SidebarHeader">
        {data.users && (
          <div>
            Welcome{" "}
            {
              data.users?.find(
                (u: { Id: number; FirstName: string }) => u.Id === data.userId
              )?.FirstName
            }
          </div>
        )}
      </div>
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
      <div className="SidebarItem" onClick={() => navigate("/monthly-budget")}>
        Monthly Budget
      </div>
      <div className="SidebarFooter" onClick={() => navigate("/logout")}>
        <div>Logout</div>
      </div>
    </div>
  );
}

export default Sidebar;
