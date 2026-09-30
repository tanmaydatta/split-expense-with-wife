import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import type { FullAuthSession } from "split-expense-shared-types";
import styled from "styled-components";

const SidebarContainer = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 12px;
  background: #182338;
  color: ${({ theme }) => theme.colors.white};
  height: 100%;
`;

const SidebarHeader = styled.div`
  font-size: 15px;
  font-weight: 700;
  padding: 4px 12px 16px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.18);
`;

const SidebarItem = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 42px;
  cursor: pointer;
  padding: 9px 12px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: ${({ $active }) => ($active ? "#2459c5" : "transparent")};
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  &:hover { background: ${({ $active }) => ($active ? "#2459c5" : "rgba(255,255,255,0.11)")}; }
  &:focus-visible { outline: 3px solid #8db8ff; outline-offset: 2px; }
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
	return (
		<SidebarContainer aria-label="Main navigation">
			<SidebarHeader>
				{data?.extra?.currentUser && (
					<div data-test-id={`sidebar-welcome-${data.extra?.currentUser?.id}`}>
						Welcome {data.extra?.currentUser?.firstName}
					</div>
				)}
			</SidebarHeader>
			<SidebarItem
				type="button"
				$active={isActive("/")}
				aria-current={isActive("/") ? "page" : undefined}
				onClick={() => handleNavigate("/")}
				data-test-id="sidebar-dashboard"
			>
				Add
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/expenses")}
				aria-current={isActive("/expenses") ? "page" : undefined}
				onClick={() => handleNavigate("/expenses")}
				data-test-id="sidebar-expenses"
			>
				Expenses
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/bills")}
				aria-current={isActive("/bills") ? "page" : undefined}
				onClick={() => handleNavigate("/bills")}
				data-test-id="sidebar-bills"
			>
				Shared Bills
			</SidebarItem>
			{["localhost", "budget-dev.wastd.dev", "splitexpense-dev.tanmaydatta.workers.dev"].includes(window.location.hostname) && (
				<SidebarItem type="button" $active={isActive("/bank-import")}
					aria-current={isActive("/bank-import") ? "page" : undefined}
					onClick={() => handleNavigate("/bank-import")} data-test-id="sidebar-bank-import">
					Bank imports
				</SidebarItem>
			)}
			<SidebarItem
				type="button"
				$active={isActive("/balances")}
				aria-current={isActive("/balances") ? "page" : undefined}
				onClick={() => handleNavigate("/balances")}
				data-test-id="sidebar-balances"
			>
				Balances
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/budget")}
				aria-current={isActive("/budget") ? "page" : undefined}
				onClick={() => handleNavigate("/budget")}
				data-test-id="sidebar-budget"
			>
				Budget
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/monthly-budget")}
				aria-current={isActive("/monthly-budget") ? "page" : undefined}
				onClick={() => handleNavigate("/monthly-budget")}
				data-test-id="sidebar-monthly-budget"
			>
				Monthly Budget
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/scheduled-actions")}
				aria-current={isActive("/scheduled-actions") ? "page" : undefined}
				onClick={() => handleNavigate("/scheduled-actions")}
				data-test-id="sidebar-scheduled-actions"
			>
				Scheduled Actions
			</SidebarItem>
			<SidebarItem
				type="button"
				$active={isActive("/settings")}
				aria-current={isActive("/settings") ? "page" : undefined}
				onClick={() => handleNavigate("/settings")}
				data-test-id="sidebar-settings"
			>
				Settings
			</SidebarItem>
			<LogoutButton type="button" onClick={() => handleNavigate("/logout")}>
				Logout
			</LogoutButton>
		</SidebarContainer>
	);
}

export default Sidebar;
