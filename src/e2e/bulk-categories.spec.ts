import {test,expect} from "@playwright/test";
import path from "node:path";
const owner={id:"owner",firstName:"Alex",lastName:"Example",email:"alex@example.test",groupid:"home"};
const partner={id:"partner",firstName:"Sam",lastName:"Example",email:"sam@example.test",groupid:"home"};
const session={user:{...owner,name:"Alex Example",emailVerified:true},session:{id:"synthetic",userId:"owner",token:"synthetic",expiresAt:"2099-01-01T00:00:00Z"},extra:{currentUser:owner,usersById:{owner,partner},group:{groupid:"home",groupName:"Home",budgets:[{id:"household",name:"Household",budgetName:"Household"}],metadata:{defaultCurrency:"GBP",defaultShare:{owner:50,partner:50}}}}};
for(const kind of ["expense","budget"] as const){
 test(`${kind} selection, async progress, navigation recovery and category refresh`,async({page},testInfo)=>{
 const pagePath=kind==='expense'?'/expenses':'/budget';
 const description=kind==='expense'?'Weekly groceries':'Household groceries debit';
 let job:Record<string,unknown>|null=null,completed=false,currentId=kind==='expense'?'expense':'budget',started=0;let postBody:{records:Array<{kind:string;id:string}>;requestId:string}={records:[],requestId:""};const listRequests:string[]=[];
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url()),p=url.pathname;let data:unknown;
 if(p.includes('/auth/get-session'))data=session;
 else if(p.includes('/.netlify/functions/')){
 if(p.endsWith('/categories'))data={enabled:true,categories:[{id:'groceries',name:'Groceries',slug:'groceries'}],rules:[]};
 else if(p.endsWith('/category-jobs')){
 if(route.request().method()==='POST'){
 postBody=route.request().postDataJSON();job={id:`synthetic-${kind}-${++started}`,status:'queued',total:1,categorised:0,skipped:0,failed:0,changedRecords:0,changes:[]};
 }
 data={job:job&&completed?{...job,status:'completed',categorised:1,changedRecords:2,changes:[{kind,id:currentId,categoryId:'groceries',categoryName:'Groceries',categorySource:'rule',categoryVersion:1}]}:job};
 }
 else if(p.endsWith('/transactions_list')){listRequests.push('expense');data={transactions:[{transaction_id:kind==='expense'?currentId:'expense',description:'Weekly groceries',amount:42,currency:'GBP',created_at:'2026-10-12',group_id:'home',metadata:JSON.stringify({paidByShares:{owner:42},owedAmounts:{partner:21},owedToAmounts:{owner:21}}),categoryId:null,categoryVersion:0}],transactionDetails:{[kind==='expense'?currentId:'expense']:[{transaction_id:'expense',user_id:'partner',owed_to_user_id:'owner',amount:21,currency:'GBP',group_id:'home'}]}};}
 else if(p.endsWith('/budget_list')){listRequests.push('budget');data=[{id:kind==='budget'?currentId:'budget',name:'Household',description:'Household groceries debit',amount:-42,price:'-42.00',currency:'GBP',addedTime:'2026-10-12',groupid:'home',categoryId:null,categoryVersion:0}];}
 else if(p.endsWith('/budget_total'))data=[{currency:'GBP',amount:258}];
 else if(p.endsWith('/linked-ids'))data={transactionIds:[]};
 else if(p.endsWith('/group/details'))data={groupName:'Home',metadata:session.extra.group.metadata,users:[{Id:'owner',firstName:'Alex'},{Id:'partner',firstName:'Sam'}],budgets:[{id:'household',budgetName:'Household'}]};
 else if(p.endsWith('/budget_entry_get'))data={budgetEntry:{id:'budget',description:'Household groceries debit',price:'-42.00',currency:'GBP',addedTime:'2026-10-12'}};
 else data={};
 }
 if(data!==undefined)await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 else if(url.origin===new URL(testInfo.project.use.baseURL as string).origin)await route.continue();else await route.abort();
 });
 await page.goto(pagePath);await expect(page.getByRole('button',{name:'Auto-categorise',exact:true})).toBeDisabled();
 const visibleCheckbox=page.getByRole('checkbox',{name:`Select ${description}`}).filter({visible:true});
 await visibleCheckbox.check();await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
 // A checkbox click selects only; it must not open a detail route or expanded row.
 expect(new URL(page.url()).pathname).toBe(pagePath);
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();
 await page.getByRole('button',{name:'Select this page',exact:true}).click();
 await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
 const initialListRequests=listRequests.filter(x=>x===kind).length;
 const size=testInfo.project.name.toLowerCase().includes('mobile')?'mobile':'desktop';
 const screenshot=async(name:string)=>{
 await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});document.querySelector('.bulk-categories')?.scrollIntoView({block:'start'});});
 const file=path.join('docs/previews/bulk-categories',`${kind}-${size}-${name}.png`);await page.screenshot({path:file});await testInfo.attach(`${kind}-${size}-${name}`,{path:file,contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 };
 await screenshot('selected');
 await page.getByRole('button',{name:'Auto-categorise',exact:true}).click();await expect(page.getByRole('status')).toContainText('Queued');
 expect(postBody.records).toEqual([{kind,id:kind==='expense'?'expense':'budget'}]);
 expect(postBody.requestId).toMatch(/^[a-zA-Z0-9_-]{8,100}$/);
 await page.goto(kind==='expense'?'/budget':'/expenses');await expect(page.getByRole('status')).toContainText('Queued');
 completed=true;await page.goto(pagePath);
 await expect(page.getByRole('status')).toContainText('Completed: 1 categorised, 0 skipped, 0 failed. 2 linked records updated.');
 await screenshot('completed');
 // Both responsive views render from the same locally updated rows. Check the category badge
 // in the mobile card view even when this project captures a desktop table.
 const viewport=page.viewportSize();if(size==='desktop')await page.setViewportSize({width:390,height:844});
 const card=page.locator(kind==='expense'?'.transaction-card':'.budget-entry-card').filter({visible:true});
 await expect(card.getByText('Groceries',{exact:true}).first()).toBeVisible();
 if(viewport)await page.setViewportSize(viewport);
 // Completion updates loaded metadata; it does not refetch every previously loaded list.
 expect(listRequests.filter(x=>x===kind).length).toBeLessThanOrEqual(initialListRequests+1);
 await page.getByRole('button',{name:'Hide result',exact:true}).click();await expect(page.getByRole('status')).toHaveCount(0);
 // A later Uncategorised selection must disappear when categorised; other filters stay set.
 currentId=`filtered-${kind}`;job=null;completed=false;
 await page.goto(`${pagePath}?categoryId=uncategorised&q=groceries&dateFrom=2026-10-01`);
 await page.getByRole('button',{name:'Select this page',exact:true}).click();await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Auto-categorise',exact:true}).click();await expect(page.getByRole('status')).toContainText('Queued');
 completed=true;await expect(page.getByRole('status')).toContainText('Completed: 1 categorised');
 await expect(page.getByTestId(kind==='expense'?'transaction-item':'budget-entry-item')).toHaveCount(0);
 await expect(page.getByText(kind==='expense'?'No expenses match these filters.':'No budget entries match these filters.',{exact:false})).toBeVisible();
 expect(new URL(page.url()).searchParams.get('q')).toBe('groceries');expect(new URL(page.url()).searchParams.get('dateFrom')).toBe('2026-10-01');expect(new URL(page.url()).searchParams.get('categoryId')).toBe('uncategorised');

 });
}
