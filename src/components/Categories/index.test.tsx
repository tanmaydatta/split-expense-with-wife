import { render,screen,fireEvent,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { CategorySelect,CategoryEditor } from "./index";
import api from "@/utils/api";
import { useCategories } from "@/hooks/useCategories";
jest.mock("@/hooks/useCategories",()=>({useCategories:jest.fn()}));
jest.mock("@/utils/api",()=>({__esModule:true,default:{post:jest.fn()}}));
const taxonomy={enabled:true,categories:[{id:"groceries",name:"Groceries"},{id:"archived",name:"Old category",archivedAt:"2020-01-01"}]};
beforeEach(()=>{jest.clearAllMocks();(useCategories as jest.Mock).mockReturnValue({data:taxonomy});});
it("Automatic is undefined, while an explicit clear is manual null",()=>{
 const onChange=jest.fn();render(<CategorySelect value="groceries" onChange={onChange}/>);const select=screen.getByLabelText("Category (optional)");
 fireEvent.change(select,{target:{value:"automatic"}});expect(onChange).toHaveBeenLastCalledWith(undefined);
 fireEvent.change(select,{target:{value:"uncategorised"}});expect(onChange).toHaveBeenLastCalledWith(null);
 expect(screen.queryByRole("option",{name:"Old category (archived)"})).not.toBeInTheDocument();
});
it("an unchanged archived saved choice remains visible and disabled rollout hides controls",()=>{
 const {rerender}=render(<CategorySelect value="archived" onChange={()=>{}} automatic={false}/>);expect(screen.getByRole("option",{name:"Old category (archived)"})).toBeInTheDocument();
 (useCategories as jest.Mock).mockReturnValue({data:{enabled:false,categories:[]}});rerender(<CategorySelect value={undefined} onChange={()=>{}}/>);expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("explicit conflict alignment sends the reviewed version and manual clear without collapsing the card",async()=>{
 (api.post as jest.Mock).mockResolvedValue({data:{saved:true}});const collapse=jest.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 render(<QueryClientProvider client={client}><div onClick={collapse}><CategoryEditor kind="expense" id="expense" record={{categoryId:"groceries",categoryVersion:3}} linked={{categoryId:null,categorySource:"manual"}}/></div></QueryClientProvider>);
 expect(screen.getByRole("status")).toHaveTextContent("Linked categories differ");fireEvent.change(screen.getByLabelText("Category (optional)"),{target:{value:"uncategorised"}});fireEvent.click(screen.getByRole("button",{name:"Save category"}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith("/record-category",{kind:"expense",id:"expense",categoryId:null,version:3}));expect(collapse).not.toHaveBeenCalled();
});
