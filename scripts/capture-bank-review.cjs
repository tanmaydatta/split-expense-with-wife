// Synthetic-only browser smoke and screenshot capture. Run against an independent local UI build.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
(async () => {
 const base = process.env.BANK_PREVIEW_URL || "http://127.0.0.1:4320";
 const output = path.resolve("docs/previews/bank-review-polish"); fs.mkdirSync(output, { recursive: true });
 const browser = await chromium.launch({ headless: true });
 const context = await browser.newContext({ serviceWorkers: "block" }); const page = await context.newPage(); page.on("pageerror",error=>console.log("PAGEERROR",error.message)); page.on("requestfailed",r=>console.log("FAILED",r.url()));
 const users = { owner: { id:"owner",firstName:"Alex",lastName:"Example",email:"alex@example.test",groupid:"home" },partner:{id:"partner",firstName:"Sam",lastName:"Example",email:"sam@example.test",groupid:"home"} };
 const session={user:{...users.owner,name:"Alex Example",emailVerified:true},session:{id:"synthetic",userId:"owner",token:"synthetic",expiresAt:"2099-01-01T00:00:00Z"},extra:{currentUser:users.owner,usersById:users,group:{groupid:"home",groupName:"Home",budgets:[{id:"household",name:"Household",budgetName:"Household"}],metadata:{defaultCurrency:"GBP",defaultShare:{owner:50,partner:50}}}}};
 const source={id:"synthetic-posted",connectionId:"synthetic",accountId:"account",accountName:"Example current account",provider:"lunch_flow",date:"2026-10-12",name:"Weekly groceries",merchantName:"Example Market",amountMinor:4200,currency:"GBP",pending:false,reviewStatus:"unreviewed",rowVersion:0,linkedTransactionId:null,linkedBudgetEntryId:null};
 const pending={...source,id:"synthetic-pending",pending:true,draftVersion:null,name:"Electricity bill",merchantName:"Example Energy"};
 const tx={transaction_id:"expense",description:"Weekly groceries",amount:42,currency:"GBP",created_at:"2026-10-12",group_id:"home",metadata:JSON.stringify({paidByShares:{owner:42},owedAmounts:{partner:21},owedToAmounts:{owner:21}})};
 const txUsers=[{transaction_id:"expense",user_id:"partner",owed_to_user_id:"owner",amount:21,currency:"GBP",group_id:"home"}];
 const budget={id:"budget",name:"Household",description:"Household groceries debit",amount:-42,price:"-42.00",currency:"GBP",addedTime:"2026-10-12",groupid:"home"};
 let provisionalPayload;
 await page.route("**/*", async route => {
  const url=new URL(route.request().url());const p=url.pathname;let data;
  if(p.includes("/auth/get-session"))data=session;
  else if(p.includes("/.netlify/functions/")) {
   if(p.endsWith("/inbox"))data={transactions:[source,pending,{...source,id:"reviewed",name:"Train tickets",merchantName:"Example Rail",amountMinor:1800,reviewStatus:"matched",linkedTransactionId:"expense"}],total:3,hasMore:false};
   else if(p.endsWith("/transaction"))data={transaction:url.searchParams.get("id")==="synthetic-pending"?pending:source,settlementCandidates:[]};
   else if(p.endsWith("/review-candidates"))data={candidates:url.searchParams.get("kind")==="budget"?[{id:"budget",description:budget.description,date:budget.addedTime,amount:-42,currency:"GBP",budgetEntry:budget}]:[{id:"expense",description:tx.description,date:tx.created_at,amount:42,currency:"GBP",transaction:tx,transactionUsers:txUsers}],hasMore:false};
   else if(p.endsWith("/capabilities")||p.endsWith("/connections"))data={providers:[{id:"lunch_flow",label:"Lunch Flow",capabilities:{setup:"api_key",reconnect:"external",revokeRemote:false,upstreamRefresh:false,removals:"window_snapshot"}}],connections:[{id:"synthetic",provider:"lunch_flow",institutionName:"Example Bank",status:"connected",createdAt:"2026-10-01",lastSyncedAt:"2026-10-12T10:00:00Z",capabilities:{setup:"api_key",reconnect:"external",revokeRemote:false,upstreamRefresh:false}}]};
   else if(p.endsWith("/accounts"))data={accounts:[{id:"account",connectionId:"synthetic",name:"Example current account",selected:true,mask:"1234",currency:"GBP",amountMultiplier:1}]};
   else if(p.endsWith("/transaction_get"))data={transaction:tx,transactionUsers:txUsers};
   else if(p.endsWith("/budget_entry_get"))data={budgetEntry:budget};
   else if(p.endsWith("/record-link"))data={links:[{...pending,provisional:true,noLongerPending:false,needsConfirmation:false}]};
   else if(p.endsWith("/provisional")){provisionalPayload=route.request().postDataJSON();data={draftId:"synthetic-draft"};}
   else data={};
  }
  if(data!==undefined)await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  else if(url.origin===base)await route.continue(); else await route.abort();
 });
 const shot=async name=>{
  await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll("*").forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
  await page.screenshot({path:path.join(output,`${name}-viewport.png`)});
  if(name.startsWith("review-") || name.startsWith("form-")){
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
  await page.screenshot({path:path.join(output,`${name}-full.png`),fullPage:true});
  await page.evaluate(()=>{for(const [el,style] of window.__captureStyles){if(style===null)el.removeAttribute("style");else el.setAttribute("style",style);}delete window.__captureStyles;});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error(`Overflow: ${name}`);
 };
 for(const [size,width,height] of [["desktop",1440,1080],["mobile",390,844]]){
  await page.setViewportSize({width,height});
  await page.goto(base+"/bank-import");await page.getByRole("button",{name:"All",exact:true}).click();await page.getByText("Example Market",{exact:true}).waitFor();await shot(`list-${size}`);
  await page.getByRole("button",{name:"Connections & settings",exact:true}).click();await page.getByRole("heading",{name:"Lunch Flow",exact:true}).waitFor();await shot(`settings-${size}`);await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.goto(base+"/bank-import/transactions/synthetic-posted");await page.getByRole("button",{name:"Both",exact:true}).click();await page.getByRole("radio",{name:"Select Weekly groceries"}).check();await page.getByRole("radio",{name:"Select Household groceries debit"}).check();await page.getByText("+£21.00",{exact:true}).waitFor();await shot(`review-${size}`);
  await page.goto(base+"/transaction/expense");await page.getByRole("heading",{name:/Your bank activity/}).waitFor();await shot(`expanded-expense-${size}`);
  await page.goto(base+"/budget-entry/budget");await page.getByRole("heading",{name:/Your bank activity/}).waitFor();await shot(`expanded-budget-${size}`);
  await page.goto(base+"/bank-import/transactions/synthetic-posted/add?mode=both");await page.waitForFunction(()=>document.querySelector('[name="amount"]')?.value==="42");const metrics=await page.evaluate(()=>{
   const form=document.querySelector(".bank-add-form"); const grid=document.querySelector(".bank-add-splits");
   const centers=[...document.querySelectorAll(".bank-add-option input")].map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;});
   const surface=form.parentElement;const cs=getComputedStyle(surface);
   return {formWidth:form.getBoundingClientRect().width,available:surface.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),columns:getComputedStyle(grid).gridTemplateColumns.split(" ").length,centers};
  });
  if(Math.abs(metrics.formWidth-metrics.available)>2 || Math.max(...metrics.centers)-Math.min(...metrics.centers)>1 || (size==="mobile"&&metrics.columns!==2))throw Error(`Bank form layout mismatch: ${JSON.stringify(metrics)}`);
  console.log(size,metrics);await shot(`form-${size}`);
  await page.goto(base+"/");await page.locator('input[name="description"]').waitFor();await shot(`dashboard-${size}`);
 }
 await page.goto(base+"/bank-import/transactions/synthetic-pending");await page.getByRole("radio",{name:"Select Weekly groceries"}).check();await page.getByRole("button",{name:"Save provisional selection",exact:true}).click();await page.getByRole("button",{name:"Save selection",exact:true}).click();await page.getByRole("status").waitFor();
 if(!provisionalPayload||provisionalPayload.transactionId!=="expense"||"draftVersion" in provisionalPayload)throw Error("Pending first-save payload incorrect");
 console.log(JSON.stringify({screenshots:32,syntheticOnly:true,realWrites:0,pendingFirstSave:provisionalPayload}));
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
