import { ToggleButton, ToggleButtonGroup } from "@/components/ToggleButtonGroup";
import { useSelector } from "react-redux";

interface SelectBudgetProps {
  budget: string;
  handleChangeBudget: (val: string) => void;
  disabled?: boolean;
}

export const CreditDebit: React.FC<SelectBudgetProps> = ({
  budget,
  handleChangeBudget,
  disabled = false,
}) => {
  const data = useSelector((state: any) => state.value);
  console.log(data, "hehkbjhbjg");
  return (
    <ToggleButtonGroup
      style={{ width: "100%" }}
      className="mb-2"
      name="credit-debit"
      value={budget}
      onChange={handleChangeBudget}
      disabled={disabled}
    >
      {["Credit", "Debit"].map((b: string) => (
        <ToggleButton
          key={b}
          id={`radio-${b}`}
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
