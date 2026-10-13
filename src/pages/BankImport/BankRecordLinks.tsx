import api from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";
import { bankAmount } from "./types";
import "./index.css";

type BankRecordLink = {
 id: string; name: string; merchantName?: string; amountMinor?: number; currency?: string;
 date?: string; accountName?: string; pending: boolean; provisional: boolean;
 noLongerPending: boolean; needsConfirmation: boolean;
};

export function BankRecordLinks({ transactionId, budgetEntryId }: {
 transactionId?: string; budgetEntryId?: string;
}) {
 const userId = useSelector((state: ReduxState) => state.value?.user?.id);
 const groupId = useSelector((state: ReduxState) => state.value?.extra?.group?.groupid);
 const { data } = useQuery({
  queryKey: ["bank", "record-links", userId, groupId, transactionId, budgetEntryId],
  enabled: Boolean(userId && groupId && (transactionId || budgetEntryId)),
  queryFn: async () => {
   const response = await api.get<{ links: BankRecordLink[] }>("/bank-import/record-link", {
    params: transactionId ? { transactionId } : { budgetEntryId },
   });
   return response.data.links;
  }, retry: false,
 });
 if (!data?.length) return null;
 return (
  <section className="bank-record-links" aria-label="Your private bank sources">
   <h4>Your bank activity <span>Only visible to you</span></h4>
   {data.map(link => (
    <Link key={link.id} className="bank-record-source" to={`/bank-import/transactions/${encodeURIComponent(link.id)}`} onClick={event => event.stopPropagation()}>
     <span><strong>{link.merchantName || link.name}</strong><small>{[link.date, link.accountName].filter(Boolean).join(" · ")}</small></span>
     <span className="bank-record-end">{typeof link.amountMinor === "number" && link.currency && <strong>{bankAmount(link.amountMinor, link.currency)}</strong>}<small>{link.noLongerPending || link.needsConfirmation ? "Needs confirmation" : link.pending ? "Pending" : "Posted"}{link.provisional ? " · Provisional" : ""} ↗</small></span>
    </Link>
   ))}
  </section>
 );
}
