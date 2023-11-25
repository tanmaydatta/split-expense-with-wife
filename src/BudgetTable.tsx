import Table from "react-bootstrap/Table";

interface Props {
  entries: entry[];
}

export interface entry {
  date: string;
  description: string;
  amount: string;
}

export default function BudgetTable(props: Props): JSX.Element {
  return (
    <Table striped bordered hover>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((e) => {
          return (
            <tr>
              <td>{e.date}</td>
              <td>{e.description}</td>
              <td style={{ color: e.amount.startsWith("+") ? "green" : "red" }}>
                {e.amount}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
