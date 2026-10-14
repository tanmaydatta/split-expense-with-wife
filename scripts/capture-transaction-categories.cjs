// Synthetic-only browser smoke and screenshot capture. Run against an independent local UI build.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
(async () => {
 const base = process.env.BANK_PREVIEW_URL || "http://127.0.0.1:4322";
 const output = path.resolve("docs/previews/transaction-categories"); fs.mkdirSync(output, { recursive: true });
 const browser = await chromium.launch({ headless: true });
 const context = await browser.newContext({ serviceWorkers: "block" }); const page = await context.newPage(); page.on("pageerror",error=>console.log("PAGEERROR",error.message)); page.on("requestfailed",r=>console.log("FAILED",r.url()));
 const users = { owner: { id:"owner",firstName:"Alex",lastName:"Example",email:"alex@example.test",groupid:"home" },partner:{id:"partner",firstName:"Sam",lastName:"Example",email:"sam@example.test",groupid:"home"} };
 const session={user:{...users.owner,name:"Alex Example",emailVerified:true},session:{id:"synthetic",userId:"owner",token:"synthetic",expiresAt:"2099-01-01T00:00:00Z"},extra:{currentUser:users.owner,usersById:users,group:{groupid:"home",groupName:"Home",budgets:[{id:"household",name:"Household",budgetName:"Household"}],metadata:{defaultCurrency:"GBP",defaultShare:{owner:50,partner:50}}}}};
 const source={id:"synthetic-posted",connectionId:"synthetic",accountId:"account",accountName:"Example current account",provider:"lunch_flow",date:"2026-10-12",name:"Weekly groceries",merchantName:"Example Market",amountMinor:4200,currency:"GBP",pending:false,reviewStatus:"unreviewed",rowVersion:0,linkedTransactionId:null,linkedBudgetEntryId:null};
 const pending={...source,id:"synthetic-pending",pending:true,draftVersion:null,name:"Electricity bill",merchantName:"Example Energy"};
 const tx={transaction_id:"expense",description:"Weekly groceries",amount:42,currency:"GBP",created_at:"2026-10-12",group_id:"home",metadata:JSON.stringify({paidByShares:{owner:42},owedAmounts:{partner:21},owedToAmounts:{owner:21}})};
 const txUsers=[{transaction_id:"expense",user_id:"partner",owed_to_user_id:"owner",amount:21,currency:"GBP",group_id:"home"}];
 const budget={id:"budget",name:"Household",description:"Household groceries debit",amount:-42,price:"-42.00",currency:"GBP",addedTime:"2026-10-12",groupid:"home"};
 const taxonomy={enabled:true,categories:[...[["groceries","Groceries"],["eating_out","Eating out"],["transport","Transport"],["housing","Housing"],["utilities","Utilities"],["shopping","Shopping"],["health","Health"],["entertainment","Entertainment"],["income","Income"],["other","Other"],["pets","Pets"]].map(([id,name])=>({id,name})),{id:"legacy",name:"Legacy category",archivedAt:"2025-01-01"}],rules:[{id:"rule",pattern:"example market",kind:"merchant",categoryId:"groceries"}]};
 Object.assign(tx,{categoryId:"groceries",categoryName:"Groceries",categorySource:"manual",categoryVersion:2});Object.assign(budget,{categoryId:null,categorySource:"manual",categoryVersion:1});
 let provisionalPayload,matchPayload,recordPayload,rulePayload;const filterPayloads=[];
 await page.route("**/*", async route => {
  const url=new URL(route.request().url());const p=url.pathname;let data;let status=200;
  if(p.includes("/auth/get-session"))data=session;
  else if(p.includes("/.netlify/functions/")) {
   if(p.endsWith("/categories")){if(route.request().method()==="POST")rulePayload=route.request().postDataJSON();data=taxonomy;}
   else if(p.endsWith("/group/details"))data={groupName:"Home",metadata:session.extra.group.metadata,users:[{Id:"owner",firstName:"Alex"},{Id:"partner",firstName:"Sam"}],budgets:[{id:"household",budgetName:"Household",budgetDescription:"Groceries and home"}]};
   else if(p.endsWith("/transactions_list")){const payload=route.request().postDataJSON();filterPayloads.push(payload);data={transactions:[payload.categoryId==="legacy"?{...tx,categoryId:"legacy",categoryName:"Legacy category"}:tx],transactionDetails:{expense:txUsers}};}
   else if(p.endsWith("/budget_list")){filterPayloads.push(route.request().postDataJSON());data=[budget];}
   else if(p.endsWith("/budget_total"))data=[{currency:"GBP",amount:258}];
   else if(p.endsWith("/record-category")){recordPayload=route.request().postDataJSON();data={saved:true};}
   else if(p.endsWith("/match")){matchPayload=route.request().postDataJSON();if(matchPayload.categoryId===undefined){status=409;data={error:"Linked records have different categories. Choose a shared category before confirming.",categoryConflict:[{categoryId:"groceries",name:"Groceries"},{categoryId:null,name:"Uncategorised"}]};}else data={saved:true};}
   else if(p.endsWith("/scheduled-actions/list"))data=[];
   else if(p.endsWith("/inbox"))data={transactions:[source,pending,{...source,id:"reviewed",name:"Train tickets",merchantName:"Example Rail",amountMinor:1800,reviewStatus:"matched",linkedTransactionId:"expense"}],total:3,hasMore:false};
   else if(p.endsWith("/transaction"))data={transaction:url.searchParams.get("id")==="synthetic-pending"?pending:source,settlementCandidates:[]};
   else if(p.endsWith("/review-candidates"))data={candidates:url.searchParams.get("kind")==="budget"?[{id:"budget",description:budget.description,date:budget.addedTime,amount:-42,currency:"GBP",budgetEntry:budget}]:[{id:"expense",description:tx.description,date:tx.created_at,amount:42,currency:"GBP",transaction:tx,transactionUsers:txUsers}],hasMore:false};
   else if(p.endsWith("/capabilities")||p.endsWith("/connections"))data={providers:[{id:"lunch_flow",label:"Lunch Flow",capabilities:{setup:"api_key",reconnect:"external",revokeRemote:false,upstreamRefresh:false,removals:"window_snapshot"}}],connections:[{id:"synthetic",provider:"lunch_flow",institutionName:"Example Bank",status:"connected",createdAt:"2026-10-01",lastSyncedAt:"2026-10-12T10:00:00Z",capabilities:{setup:"api_key",reconnect:"external",revokeRemote:false,upstreamRefresh:false}}]};
   else if(p.endsWith("/accounts"))data={accounts:[{id:"account",connectionId:"synthetic",name:"Example current account",selected:true,mask:"1234",currency:"GBP",amountMultiplier:1}]};
   else if(p.endsWith("/transaction_get"))data={transaction:tx,transactionUsers:txUsers,linkedBudgetEntry:budget};
   else if(p.endsWith("/budget_entry_get"))data={budgetEntry:budget,linkedTransaction:tx,linkedTransactionUsers:txUsers};
   else if(p.endsWith("/record-link"))data={links:[{...pending,provisional:true,noLongerPending:false,needsConfirmation:false}]};
   else if(p.endsWith("/provisional")){provisionalPayload=route.request().postDataJSON();data={draftId:"synthetic-draft"};}
   else data={};
  }
  if(data!==undefined)await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
  else if(url.origin===base)await route.continue(); else await route.abort();
 });
 const shot=async name=>{
  await page.mouse.move(8,8);
  await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll("*").forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
  await page.screenshot({path:path.join(output,`${name}-viewport.png`)});
  if(!name.startsWith("expanded-")){
   await page.evaluate(()=>{let node=document.querySelector("main, .dashboard-container");for(;node;node=node.parentElement){if(node.scrollHeight>node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)){node.scrollTop=node.scrollHeight;break;}}});
   await page.screenshot({path:path.join(output,`${name}-lower-viewport.png`)});
   await page.evaluate(()=>document.querySelectorAll("*").forEach(el=>{if(el.scrollTop)el.scrollTop=0;}));
  }
  // The app scrolls an internal shell. Expose only its ancestors for a complete
  // capture, retaining content widths and restoring every inline style afterward.
  await page.evaluate(()=>{
   const main=document.querySelector("main, .dashboard-container");window.__captureStyles=[];
   for(let el=main?.parentElement;el;el=el.parentElement){
    window.__captureStyles.push([el,el.getAttribute("style")]);
    el.style.height="auto";el.style.maxHeight="none";el.style.overflow="visible";
   }
  });
  await page.screenshot({path:path.join(output,`${name}-${name.startsWith("settings-")?"top-supplement":"full"}.png`),fullPage:true});
  await page.evaluate(()=>{for(const [el,style] of window.__captureStyles){if(style===null)el.removeAttribute("style");else el.setAttribute("style",style);}delete window.__captureStyles;});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error(`Overflow: ${name}`);
 };
 for(const [size,width,height] of [["desktop",1440,1080],["mobile",390,844]]){
  await page.setViewportSize({width,height});
  await page.goto(base+"/bank-import/transactions/synthetic-posted");await page.getByRole("button",{name:"Both",exact:true}).click();await page.getByRole("radio",{name:"Select Weekly groceries"}).check();await page.getByRole("radio",{name:"Select Household groceries debit"}).check();await page.getByText("+£21.00",{exact:true}).waitFor();await shot(`review-${size}`);
  await page.getByRole("button",{name:"Confirm association",exact:true}).click();await page.getByRole("alertdialog").getByRole("button",{name:"Confirm association",exact:true}).click();await page.getByText("Choose a category or Uncategorised, then confirm again. This aligns the linked records.").waitFor();await page.getByLabel("Choose a shared category to confirm").selectOption("groceries");await shot(`review-conflict-${size}`);
  await page.getByRole("button",{name:"Confirm association",exact:true}).click();await page.getByRole("alertdialog").getByRole("button",{name:"Confirm association",exact:true}).click();await page.getByRole("status").waitFor();if(matchPayload.categoryId!=="groceries"||matchPayload.categoryVersions["expense:expense"]!==2||matchPayload.categoryVersions["budget:budget"]!==1)throw Error("Category conflict confirmation payload incorrect");
  await page.goto(base+"/transaction/expense");await page.getByText("Linked categories differ. Choose one to align them.").waitFor();await shot(`expanded-expense-${size}`);
  await page.getByLabel("Category (optional)").selectOption("uncategorised");await page.getByRole("button",{name:"Save category",exact:true}).click();await page.waitForTimeout(100);if(recordPayload.categoryId!==null||recordPayload.version!==2)throw Error("Manual clear/version incorrect");
  await page.goto(base+"/budget-entry/budget");await page.getByText("Linked categories differ. Choose one to align them.").waitFor();await shot(`expanded-budget-${size}`);
  await page.goto(base+"/bank-import/transactions/synthetic-posted/add?mode=both");await page.waitForFunction(()=>document.querySelector('[name="amount"]')?.value==="42");await page.getByLabel("Category (optional)").selectOption("groceries");await shot(`form-${size}`);
  await page.goto(base+"/");await page.locator('input[name="description"]').waitFor();await shot(`dashboard-${size}`);if(await page.getByLabel("Category (optional)").inputValue()!=="automatic")throw Error("Category leaked across source routes");
  await page.goto(base+"/expenses");if(size==="mobile")await page.locator(".finance-filter-details summary").click();await page.getByLabel("Category",{exact:true}).waitFor();await page.getByLabel("Category",{exact:true}).selectOption("legacy");await page.waitForTimeout(250);await shot(`expenses-filter-${size}`);
  await page.goto(base+"/budget");if(size==="mobile")await page.locator(".finance-filter-details summary").click();await page.getByLabel("Category",{exact:true}).waitFor();await page.getByLabel("Category",{exact:true}).selectOption("uncategorised");if(await page.getByText(/NaN/).count())throw Error("Invalid budget total fixture/render");await shot(`budget-filter-${size}`);
  await page.goto(base+"/scheduled-actions/new");await page.getByLabel("Default category (optional)").waitFor();await page.getByLabel("Default category (optional)").selectOption("groceries");if(await page.getByText("Page Not Found",{exact:true}).count())throw Error("Incorrect scheduled route header");await shot(`recurring-${size}`);
  await page.goto(base+"/settings");await page.getByRole("heading",{name:"Transaction categories",exact:true}).waitFor();await page.getByText("Automatic category rules",{exact:true}).click();await page.getByLabel("Text to match").fill("Example Market");await page.getByLabel("Category",{exact:true}).selectOption("groceries");await page.getByRole("checkbox",{name:/Share this text/}).check();await shot(`settings-${size}`);await page.locator(".category-settings").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`settings-category-${size}-viewport.png`)});await page.locator(".category-settings details").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`settings-rules-${size}-viewport.png`)});
 }
 await page.goto(base+"/bank-import/transactions/synthetic-pending");await page.getByRole("radio",{name:"Select Weekly groceries"}).check();await page.getByRole("button",{name:"Save provisional selection",exact:true}).click();await page.getByRole("button",{name:"Save selection",exact:true}).click();await page.getByRole("status").waitFor();
 if(!provisionalPayload||provisionalPayload.transactionId!=="expense"||"draftVersion" in provisionalPayload||"categoryId" in provisionalPayload)throw Error("Pending first-save payload incorrect");
 if(filterPayloads.every(p=>p.categoryId!=="legacy")||filterPayloads.every(p=>p.categoryId!=="uncategorised"))throw Error("Category filters not sent");
 console.log(JSON.stringify({screenshots:60,syntheticOnly:true,realWrites:0,pendingFirstSave:provisionalPayload}));
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
