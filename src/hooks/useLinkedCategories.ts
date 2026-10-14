import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import api from "@/utils/api";
import type { RecordCategory, ReduxState } from "split-expense-shared-types";
/** At most two reads for retained bank associations, never one request per candidate. */
export function useLinkedCategories(transactionId?:string|null,budgetEntryId?:string|null) {
 const groupId=useSelector((state:ReduxState)=>state.value?.extra?.group?.groupid);
 return useQuery({queryKey:["linkedCategories",groupId,transactionId,budgetEntryId],enabled:Boolean(groupId&&(transactionId||budgetEntryId)),retry:false,staleTime:Infinity,
 queryFn:async()=>{const records:Record<string,RecordCategory>={};await Promise.all([
 transactionId?api.post<{transaction:RecordCategory}>("/transaction_get",{id:transactionId}).then(({data})=>{records[`expense:${transactionId}`]=data.transaction}):Promise.resolve(),
 budgetEntryId?api.post<{budgetEntry:RecordCategory}>("/budget_entry_get",{id:budgetEntryId}).then(({data})=>{records[`budget:${budgetEntryId}`]=data.budgetEntry}):Promise.resolve(),
 ]);return records;}});
}
