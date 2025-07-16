import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";

const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.medium};
  padding: ${({ theme }) => theme.spacing.medium};
  background: ${({ theme }) => theme.colors.dark};
  color: ${({ theme }) => theme.colors.white};
  height: 100vh;
`;

const SidebarHeader = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.large};
  padding-bottom: ${({ theme }) => theme.spacing.medium};
  border-bottom: 1px solid ${({ theme }) => theme.colors.light};
`;

const SidebarItem = styled.div`
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.small};
  border-radius: ${({ theme }) => theme.borderRadius};
  &:hover {
    background: ${({ theme }) => theme.colors.secondary};
  }
`;

const LogoutButton = styled(SidebarItem)`
  margin-top: auto;
`;

function Sidebar(): JSX.Element {
  const navigate = useNavigate();
  const data = useSelector((state: any) => state.value);
  return (
    <SidebarContainer>
      <SidebarHeader>
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
      </SidebarHeader>
      <SidebarItem onClick={() => navigate("/")}>
        Add
      </SidebarItem>
      <SidebarItem onClick={() => navigate("/expenses")}>
        Expenses
      </SidebarItem>
      <SidebarItem onClick={() => navigate("/balances")}>
        Balances
      </SidebarItem>
      <SidebarItem onClick={() => navigate("/budget")}>
        Budget
      </SidebarItem>
      <SidebarItem onClick={() => navigate("/monthly-budget")}>
        Monthly Budget
      </SidebarItem>
      <LogoutButton onClick={() => navigate("/logout")}>
        <div>Logout</div>
      </LogoutButton>
    </SidebarContainer>
  );
}

export default Sidebar;
