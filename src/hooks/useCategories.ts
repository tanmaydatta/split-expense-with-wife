import api from "@/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { GroupCategory, ReduxState } from "split-expense-shared-types";
export function useCategories() {
 const groupId=useSelector((state:ReduxState)=>state.value?.extra?.group?.groupid);
 return useQuery({queryKey:["categories",groupId],enabled:Boolean(groupId),staleTime:60000,retry:false,
  queryFn:async()=> (await api.get<{enabled:boolean;categories:GroupCategory[];rules?:{id:string;pattern:string;kind:string;categoryId:string}[]}>("/categories")).data});
}
