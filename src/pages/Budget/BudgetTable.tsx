import getSymbolFromCurrency from "currency-symbol-map";
import { Trash } from "@/components/Icons";
import { Table, TableWrapper } from "@/components/Table";
import { BudgetCard } from "@/components/BudgetCard";
import { entry } from "@/model";
import { dateToFullStr } from "@/utils/date";

interface Props {
  entries: entry[];
  onDelete(id: number): void;
}

export default function BudgetTable(props: Props): JSX.Element {
  return (
    <>
      {/* Desktop Table View */}
      <div className="desktop-table" data-test-id="desktop-table">
        <TableWrapper>
          <Table>
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
                    <td>{dateToFullStr(new Date(e.date))}</td>
                    <td className="description-cell">{e.description}</td>
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
                        dateToFullStr(new Date(e.deleted))
                      ) : (
                        <button
                          className="delete-button"
                          data-test-id="delete-button"
                          onClick={() => props.onDelete(e.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto"
                          }}
                          aria-label="Delete budget entry"
                        >
                          <Trash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrapper>
      </div>

      {/* Mobile Card View */}
      <div className="mobile-cards" data-test-id="mobile-cards">
        {props.entries.map((e) => (
          <BudgetCard
            key={e.date}
            entry={e}
            onDelete={props.onDelete}
          />
        ))}
      </div>
    </>
  );
}

export function dateToStr(d: Date): string {
  return d.toTimeString().split(" ")[0] + " " + d.toDateString();
}


