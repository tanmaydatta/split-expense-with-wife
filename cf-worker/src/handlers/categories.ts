import { z } from "zod";
import { ulid } from "ulid";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";
import { editRecordCategory, listCategories, normalizeCategoryText } from "../utils/categories";
const CategoryWrite = z.discriminatedUnion("action", [
 z.object({action:z.literal("create"),name:z.string().trim().min(1).max(50)}),
 z.object({action:z.literal("archive"),id:z.string().min(1).max(200),archived:z.boolean()}),
 z.object({action:z.literal("rule"),categoryId:z.string().min(1).max(200),pattern:z.string().trim().min(2).max(160),kind:z.enum(["merchant","description"]),sharedGroupConsent:z.literal(true)}),
 z.object({action:z.literal("delete-rule"),id:z.string().min(1).max(200)}),
]);
const RecordEdit = z.object({kind:z.enum(["expense","budget"]),id:z.string().min(1).max(500),categoryId:z.string().min(1).max(200).nullable(),version:z.number().int().min(0)});
async function applyCategoryChange(env:Env,group:string,userId:string,body:z.infer<typeof CategoryWrite>):Promise<D1Result>{
  let result:D1Result;
  if(body.action==="create") {
   result=await env.DB.prepare("INSERT INTO group_categories(id,group_id,name) SELECT ?,?,? WHERE (SELECT count(*) FROM group_categories WHERE group_id=? AND archived_at IS NULL)<32 AND NOT EXISTS(SELECT 1 FROM group_categories WHERE group_id=? AND lower(name)=lower(?) AND archived_at IS NULL)").bind(`gc_${ulid()}`,group,body.name,group,group,body.name).run();
  } else if(body.action==="archive") {
   result=await env.DB.prepare("UPDATE group_categories SET archived_at=? WHERE id=? AND group_id=? AND (?=1 OR (((SELECT count(*) FROM group_categories c WHERE c.group_id=? AND c.archived_at IS NULL)<32 OR archived_at IS NULL) AND NOT EXISTS(SELECT 1 FROM group_categories c WHERE c.group_id=? AND c.id<>? AND c.archived_at IS NULL AND lower(c.name)=lower(group_categories.name))))").bind(body.archived?new Date().toISOString():null,body.id,group,body.archived?1:0,group,group,body.id).run();
  } else if(body.action==="rule") {
   result=await env.DB.prepare("INSERT INTO category_rules(id,group_id,pattern,match_kind,category_id,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM group_categories WHERE id=? AND group_id=? AND archived_at IS NULL) AND ((SELECT count(*) FROM category_rules WHERE group_id=?)<100 OR EXISTS(SELECT 1 FROM category_rules WHERE group_id=? AND match_kind=? AND pattern=?)) ON CONFLICT(group_id,match_kind,pattern) DO UPDATE SET category_id=excluded.category_id,created_by=excluded.created_by").bind(`cr_${ulid()}`,group,normalizeCategoryText(body.pattern),body.kind,body.categoryId,userId,body.categoryId,group,group,group,body.kind,normalizeCategoryText(body.pattern)).run();
  } else {
   result=await env.DB.prepare("DELETE FROM category_rules WHERE id=? AND group_id=?").bind(body.id,group).run();
  }
 return result;
}
export async function handleCategories(request: Request, env: Env): Promise<Response> {
 // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: group auth, rollout and validated management actions use one bounded endpoint.
 return withAuth(request,env,async session=>{
  const group=session.group?.groupid ?? "";if(!group)return createErrorResponse("Join a group first",400,request,env);
  const taxonomy=await listCategories(env,group);
  if(request.method==="GET") {
 const rules=taxonomy.enabled ? (await env.DB.prepare("SELECT id,pattern,match_kind AS kind,category_id AS categoryId FROM category_rules WHERE group_id=? ORDER BY pattern,id LIMIT 100").bind(group).all()).results : [];
 return createJsonResponse({...taxonomy,rules},200,{},request,env);
 }
  if(!taxonomy.enabled)return createErrorResponse("Categories are not enabled",503,request,env);
  const parsed=CategoryWrite.safeParse(await request.json().catch(() => null));if(!parsed.success)return createErrorResponse("Invalid category change",400,request,env);
  const result=await applyCategoryChange(env,group,session.user.id,parsed.data);
  if(!result.meta.changes)return createErrorResponse("Category change unavailable or limit reached",409,request,env);
  return createJsonResponse(await listCategories(env,group),200,{},request,env);
 });
}
export async function handleRecordCategory(request:Request,env:Env):Promise<Response>{
 // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: auth, rollout, schema and optimistic version guard one explicit edit.
 return withAuth(request,env,async session=>{
  const group=session.group?.groupid ?? "";if(!group)return createErrorResponse("Join a group first",400,request,env);const taxonomy=await listCategories(env,group);
  if(!group||!taxonomy.enabled)return createErrorResponse("Categories are not enabled",503,request,env);
  const parsed=RecordEdit.safeParse(await request.json().catch(() => null));if(!parsed.success)return createErrorResponse("Invalid record category",400,request,env);
  try {
   const saved=await editRecordCategory(env,group,parsed.data.kind,parsed.data.id,parsed.data.categoryId,parsed.data.version);
   if(!saved)return createErrorResponse("Record or category changed. Refresh and try again.",409,request,env);
   return createJsonResponse({saved:true,version:parsed.data.version+1},200,{},request,env);
  }catch(error){return createErrorResponse(error instanceof Error?error.message:"Could not update category",400,request,env);}
 });
}
