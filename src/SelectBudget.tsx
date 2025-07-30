import { ReduxState } from "@shared-types";
import { ToggleButton, ToggleButtonGroup } from "./components/ToggleButtonGroup";
import { useSelector } from "react-redux";

interface SelectBudgetProps {
  budget: string;
  handleChangeBudget: (val: string) => void;
  disabled?: boolean;
}

export const SelectBudget: React.FC<SelectBudgetProps> = ({
  budget,
  handleChangeBudget,
  disabled = false,
}) => {
  const data = useSelector((state: ReduxState) => state.value);
  console.log(data, "hehkbjhbjg");
  
  // Handle case where data or metadata might not be loaded yet
  const budgets = data?.extra?.group?.budgets || [];
  
  return (
    <ToggleButtonGroup
      style={{ width: "100%" }}
      className="mb-2 BudgetSelectionGroup"
      data-test-id="budget-selection-group"
      name="budget"
      value={budget}
      onChange={handleChangeBudget}
      disabled={disabled}
    >
      {budgets.map((b: string) => (
        <ToggleButton
          key={b}
          id={`radio-${b}`}
          data-test-id={`budget-radio-${b}`}
          type="radio"
          variant="outline-primary"
          value={b}
          checked={budget === b}
        >
          {b}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
