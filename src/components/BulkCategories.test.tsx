import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applyCategoryChange, patchCategoryRows, BulkCategoryToolbar, BulkCategoryCheckbox, useBulkCategories } from "./BulkCategories";
import api from "@/utils/api";
jest.mock("@/utils/api",()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
jest.mock("react-redux",()=>({useSelector:(selector:any)=>selector({value:{user:{id:"user"},extra:{group:{groupid:"group"}}}})}));
jest.mock("@/hooks/useCategories",()=>({useCategories:()=>({data:{enabled:true}})}));
function Harness(){const bulk=useBulkCategories("expense",Array.from({length:101},(_,i)=>`e${i}`),"context");return <><BulkCategoryToolbar bulk={bulk}/><BulkCategoryCheckbox bulk={bulk} id="e0" label="Synthetic expense"/></>}
describe("Bulk selection",()=>{
 beforeEach(()=>{Object.defineProperty(global,"crypto",{value:{randomUUID:()=>"synthetic-request"},configurable:true});jest.clearAllMocks();(api.get as jest.Mock).mockResolvedValue({data:{job:null}});});
 it("caps the visible page selection at100 and starts a job with only selected IDs",async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});(api.post as jest.Mock).mockResolvedValue({data:{job:{id:"job",status:"queued",total:100,categorised:0,skipped:0,failed:0}}});
 render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
 fireEvent.click(screen.getByRole("button",{name:"Select this page"}));expect(screen.getByText("100 selected")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Auto-categorise"}));
 await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Queued"));expect((api.post as jest.Mock).mock.calls[0][1].records).toHaveLength(100);
 });
 it("unchecking an entry updates the selected count",()=>{
 const client=new QueryClient();render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
 fireEvent.click(screen.getByRole("button",{name:"Select this page"}));fireEvent.click(screen.getByRole("checkbox",{name:"Select Synthetic expense"}));expect(screen.getByText("99 selected")).toBeInTheDocument();
 });
 it("invalidates insights once after a completed category job",async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const spy=jest.spyOn(client,"invalidateQueries");
 (api.get as jest.Mock).mockResolvedValue({data:{job:{id:"finished",status:"completed",total:1,categorised:1,skipped:0,failed:0,changes:[]}}});
 render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
 await waitFor(()=>expect(spy).toHaveBeenCalledWith({queryKey:["category-insights"]}));
 expect(spy.mock.calls.filter(([options])=>options?.queryKey?.[0]==="category-insights")).toHaveLength(1);
 });
 it("preserves a more recent manual category when replaying an older job",()=>{
 const row={categoryId:"transport",categorySource:"manual",categoryVersion:2};
 expect(applyCategoryChange(row,{kind:"expense",id:"e",categoryId:"groceries",categorySource:"rule",categoryVersion:1})).toBe(row);
 });

 it("removes completed categorisation from an Uncategorised list and keeps unrelated data",()=>{
 const rows=[{id:'chosen',categoryId:null,categoryVersion:0,description:'Groceries',date:'2026-10-12'},{id:'protected',categoryId:null,categoryVersion:2,description:'Manual clear',date:'2026-10-11'}];
 const changes=[{kind:'expense' as const,id:'chosen',categoryId:'groceries',categorySource:'rule' as const,categoryVersion:1}];
 expect(patchCategoryRows(rows,changes,'expense',r=>r.id,'uncategorised')).toEqual([rows[1]]);
 const all=patchCategoryRows(rows,changes,'expense',r=>r.id);expect(all).toHaveLength(2);expect(all[0]).toMatchObject({description:'Groceries',date:'2026-10-12',categoryId:'groceries'});
 });

});
