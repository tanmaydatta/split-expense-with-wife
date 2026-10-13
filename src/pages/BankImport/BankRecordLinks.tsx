import api from "@/utils/api";
import { Surface } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";

type BankRecordLink = {
 id: string;
 name: string;
 pending: boolean;
 provisional: boolean;
 noLongerPending: boolean;
};

export function BankRecordLinks({ transactionId, budgetEntryId }: {
 transactionId?: string;
 budgetEntryId?: string;
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
  },
  retry: false,
 });
 if (!data?.length) return null;
 return (
  <Surface>
   <h2>Your bank activity</h2>
   <ul>
    {data.map(link => (
     <li key={link.id}>
      <Link to={`/bank-import/transactions/${encodeURIComponent(link.id)}`}>
       {link.name}{link.noLongerPending ? " · No longer pending" : link.pending ? " · Pending" : ""}{link.provisional ? " · Provisional choice" : ""}
      </Link>
     </li>
    ))}
   </ul>
  </Surface>
 );
}
