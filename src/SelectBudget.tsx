import { ToggleButton, ToggleButtonGroup } from "react-bootstrap";
import { useSelector } from "react-redux";

interface SelectBudgetProps {
  budget: string;
  handleChangeBudget: (val: string) => void;
}

export const SelectBudget: React.FC<SelectBudgetProps> = ({
  budget,
  handleChangeBudget,
}) => {
  const data = useSelector((state: any) => state.value);
  console.log(data, "hehkbjhbjg");
  return (
    <ToggleButtonGroup
      style={{ width: "100%" }}
      className="mb-2"
      name="budget"
      value={budget}
      onChange={handleChangeBudget}
    >
      {data.budgets.map((b: string) => (
        <ToggleButton
          key={b}
          id={`radio-${b}`}
          type="radio"
          variant="outline-primary"
          name="radio"
          value={b}
          checked={budget === b}
        >
          {b}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
