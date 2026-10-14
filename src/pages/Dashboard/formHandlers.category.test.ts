import { createFormSubmitHandler } from "./formHandlers";
import type { DashboardFormInput } from "split-expense-shared-types";
it("submits an explicit manual clear and resets category through the existing successful-save callback",async()=>{
 const onSaved=jest.fn(),setFieldValue=jest.fn();const mutate=jest.fn((_data,callbacks)=>callbacks.onSuccess());
 const mutation={mutate} as unknown as Parameters<typeof createFormSubmitHandler>[0];const handler=createFormSubmitHandler(mutation,null,{categoryId:null,onSaved});
 await handler({value:{description:"Synthetic",amount:10,currency:"GBP",addExpense:false,updateBudget:false} as DashboardFormInput},{setFieldValue});
 expect(mutate.mock.calls[0][0]).toMatchObject({categoryId:null});expect(onSaved).toHaveBeenCalledTimes(1);expect(setFieldValue).toHaveBeenCalledWith("description","");
});
