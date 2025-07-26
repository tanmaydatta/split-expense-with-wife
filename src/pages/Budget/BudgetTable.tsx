import { getCurrencySymbol } from "@/utils/currency";
import { Trash } from "@/components/Icons";
import { Table, TableWrapper } from "@/components/Table";
import { BudgetCard } from "@/components/BudgetCard";
import { dateToFullStr } from "@/utils/date";
import { BudgetEntry } from "@shared-types";

interface Props {
  entries: BudgetEntry[]; // TODO: change to BudgetEntry[]
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
                  <tr key={e.addedTime}>
                    <td>{dateToFullStr(new Date(e.addedTime))}</td>
                    <td className="description-cell">{e.description}</td>
                    <td style={{ color: e.price.startsWith("+") ? "green" : "red" }}>
                      {e.price[0]}
                      {getCurrencySymbol(e.currency)}
                      {e.price.substring(1)}
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
            key={e.addedTime}
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


