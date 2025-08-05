import { FullAuthSession } from "@shared-types";
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
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : "transparent")};
  &:hover {
    background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.secondary)};
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
	const data: FullAuthSession = useSelector((state: any) => state.value);

	const isActive = (path: string) => {
		if (path === "/" && location.pathname === "/") return true;
		if (path !== "/" && location.pathname.startsWith(path)) return true;
		return false;
	};

	const handleNavigate = (path: string) => {
		navigate(path);
		onNavigate?.();
	};
	console.log("sidebar data", data);
	return (
		<SidebarContainer>
			<SidebarHeader>
				{data?.extra?.currentUser && (
					<div data-test-id={`sidebar-welcome-${data.extra?.currentUser?.id}`}>
						Welcome {data.extra?.currentUser?.firstName}
					</div>
				)}
			</SidebarHeader>
			<SidebarItem
				$active={isActive("/")}
				onClick={() => handleNavigate("/")}
				data-test-id="sidebar-dashboard"
			>
				Add
			</SidebarItem>
			<SidebarItem
				$active={isActive("/expenses")}
				onClick={() => handleNavigate("/expenses")}
				data-test-id="sidebar-expenses"
			>
				Expenses
			</SidebarItem>
			<SidebarItem
				$active={isActive("/balances")}
				onClick={() => handleNavigate("/balances")}
				data-test-id="sidebar-balances"
			>
				Balances
			</SidebarItem>
			<SidebarItem
				$active={isActive("/budget")}
				onClick={() => handleNavigate("/budget")}
				data-test-id="sidebar-budget"
			>
				Budget
			</SidebarItem>
			<SidebarItem
				$active={isActive("/monthly-budget")}
				onClick={() => handleNavigate("/monthly-budget")}
				data-test-id="sidebar-monthly-budget"
			>
				Monthly Budget
			</SidebarItem>
			<SidebarItem
				$active={isActive("/settings")}
				onClick={() => handleNavigate("/settings")}
				data-test-id="sidebar-settings"
			>
				Settings
			</SidebarItem>
			<LogoutButton onClick={() => handleNavigate("/logout")}>
				<div>Logout</div>
			</LogoutButton>
		</SidebarContainer>
	);
}

export default Sidebar;
