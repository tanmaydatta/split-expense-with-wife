// Synthetic-only five-day inbox browser smoke and previews; serve independent build locally.
const { chromium } = require("playwright"); const fs=require("fs"); const path=require("path");
(async()=>{
 const base=process.env.BANK_PREVIEW_URL||"http://127.0.0.1:4322";
 const output=path.resolve("docs/previews/bank-inbox-window");fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:"block"});const page=await context.newPage();
 const users = { owner: { id:"owner",firstName:"Alex",lastName:"Example",email:"alex@example.test",groupid:"home" },partner:{id:"partner",firstName:"Sam",lastName:"Example",email:"sam@example.test",groupid:"home"} };
 const session={user:{...users.owner,name:"Alex Example",emailVerified:true},session:{id:"synthetic",userId:"owner",token:"synthetic",expiresAt:"2099-01-01T00:00:00Z"},extra:{currentUser:users.owner,usersById:users,group:{groupid:"home",groupName:"Home",budgets:[{id:"household",name:"Household",budgetName:"Household"}],metadata:{defaultCurrency:"GBP",defaultShare:{owner:50,partner:50}}}}};

 const today=new Date().toISOString().slice(0,10);let empty=false;const requests=[];
 const row=(id,name,date)=>({id,connectionId:"synthetic",accountId:"account",accountName:"Example current account",date,name,merchantName:name,amountMinor:4200,currency:"GBP",pending:false,reviewStatus:"unreviewed"});
 const recent=[row("recent","Example Market",today),row("pending","Example Energy",today)];recent[1].pending=true;
 const older=row("older","Older Example Rail","2020-01-01");
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname.includes("/auth/get-session"))data=session;
  else if(url.pathname.includes("/.netlify/functions/")){
   if(url.pathname.endsWith("/inbox")){requests.push(url.search);const more=url.searchParams.has("cursor");const status=url.searchParams.get("status");const chosen=recent.filter(r=>status==="all" || (status==="pending"?r.pending:status==="reviewed"?false:!r.pending));data={transactions:more?[older]:empty?[]:chosen,hasMore:!more,nextCursor:more?null:"synthetic-older-cursor"};}
   else if(url.pathname.endsWith("/capabilities"))data={providers:[{id:"lunch_flow"}]};else data={};
  }
  if(data!==undefined)await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});else if(url.origin===base)await route.continue();else await route.abort();
 });
 const capture=async name=>{
  await page.mouse.move(10,10);
  await page.evaluate(()=>document.querySelectorAll("*").forEach(el=>{if(el.scrollTop)el.scrollTop=0;}));
  await page.screenshot({path:path.join(output,name+"-viewport.png")});
  await page.evaluate(()=>{window.__styles=[];for(let el=document.querySelector("main")?.parentElement;el;el=el.parentElement){window.__styles.push([el,el.getAttribute("style")]);el.style.height="auto";el.style.maxHeight="none";el.style.overflow="visible";}});
  await page.screenshot({path:path.join(output,name+"-full.png"),fullPage:true});
  await page.evaluate(()=>{for(const [el,s]of window.__styles){if(s===null)el.removeAttribute("style");else el.setAttribute("style",s);}delete window.__styles;});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error("Horizontal overflow");
 };
 for(const [size,width,height]of [["desktop",1440,1080],["mobile",390,844]]){
  await page.setViewportSize({width,height});const before=requests.length;
  await page.goto(base+"/bank-import");await page.getByText("Example Market",{exact:true}).waitFor();await page.getByRole("button",{name:"All",exact:true}).click();await page.getByText("Example Energy",{exact:true}).waitFor();
  if(requests.slice(before).some(q=>q.includes("cursor=")))throw Error("Older activity fetched eagerly");
  await capture("recent-"+size);await page.getByRole("button",{name:"Load more",exact:true}).click();await page.getByText("Older Example Rail",{exact:true}).waitFor();
  if(!await page.getByText("Example Market",{exact:true}).isVisible())throw Error("Recent rows lost on append");
  await capture("loaded-"+size);
 }
 empty=true;await page.goto(base+"/bank-import");await page.getByRole("heading",{name:"No recent activity",exact:true}).waitFor();await capture("empty-recent-mobile");
 if(!await page.getByRole("button",{name:"Load more",exact:true}).isVisible())throw Error("Empty recent window hides older action");
 console.log(JSON.stringify({syntheticOnly:true,realWrites:0,screenshots:10,initialNoOlderFetch:true,accumulation:true,emptyRecentOlderAction:true}));await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
