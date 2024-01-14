import getSymbolFromCurrency from "currency-symbol-map";
import { Trash } from "react-bootstrap-icons";
import Table from "react-bootstrap/Table";
import { entry } from "./model";

interface Props {
  entries: entry[];
  onDelete(id: number): void;
}

export default function BudgetTable(props: Props): JSX.Element {
  return (
    <Table striped bordered hover>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Deleted</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((e) => {
          return (
            <tr key={e.date}>
              <td>{dateToStr(new Date(e.date))}</td>
              <td>{e.description}</td>
              <td style={{ color: e.amount.startsWith("+") ? "green" : "red" }}>
                {e.amount[0]}
                {getSymbolFromCurrency(e.currency)}
                {e.amount.substring(1)}
              </td>
              <td
                style={{
                  textAlign: "center",
                }}
              >
                {e.deleted != null ? (
                  dateToStr(new Date(e.deleted))
                ) : (
                  <Trash onClick={() => props.onDelete(e.id)} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function dateToStr(d: Date): string {
  return d.toTimeString().split(" ")[0] + " " + d.toDateString();
}

export function dateToShortStr(date: Date): string {
  const currentYear = new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "2-digit",
  };

  if (date.getFullYear() !== currentYear) {
    options.year = "numeric";
  }

  return date.toLocaleDateString("en-US", options);
}
