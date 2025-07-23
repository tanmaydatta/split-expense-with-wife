import { useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";

const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.medium};
  padding: ${({ theme }) => theme.spacing.medium};
  background: ${({ theme }) => theme.colors.dark};
  color: ${({ theme }) => theme.colors.white};
  height: 100%;
`;

const SidebarHeader = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.large};
  padding-bottom: ${({ theme }) => theme.spacing.medium};
  border-bottom: 1px solid ${({ theme }) => theme.colors.light};
`;

const SidebarItem = styled.div<{ $active?: boolean }>`
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.small};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : 'transparent'};
  &:hover {
    background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.secondary};
  }
`;

const LogoutButton = styled(SidebarItem)`
  margin-top: auto;
`;

interface SidebarProps {
  onNavigate?: () => void;
}

function Sidebar({ onNavigate }: SidebarProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const data = useSelector((state: any) => state.value);
  
  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  
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
      <SidebarItem 
        $active={isActive("/")} 
        onClick={() => handleNavigate("/")}
      >
        Add
      </SidebarItem>
      <SidebarItem 
        $active={isActive("/expenses")} 
        onClick={() => handleNavigate("/expenses")}
      >
        Expenses
      </SidebarItem>
      <SidebarItem 
        $active={isActive("/balances")} 
        onClick={() => handleNavigate("/balances")}
      >
        Balances
      </SidebarItem>
      <SidebarItem 
        $active={isActive("/budget")} 
        onClick={() => handleNavigate("/budget")}
      >
        Budget
      </SidebarItem>
      <SidebarItem 
        $active={isActive("/monthly-budget")} 
        onClick={() => handleNavigate("/monthly-budget")}
      >
        Monthly Budget
      </SidebarItem>
      <SidebarItem 
        $active={isActive("/camera")} 
        onClick={() => handleNavigate("/camera")}
        data-test-id="camera-nav-item"
      >
        Camera Test
      </SidebarItem>
      <LogoutButton onClick={() => handleNavigate("/logout")}>
        <div>Logout</div>
      </LogoutButton>
    </SidebarContainer>
  );
}

export default Sidebar;
