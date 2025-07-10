import { CFRequest, Env, CFContext } from './types';
import { createErrorResponse, createOptionsResponse } from './utils';
import { handleLogin, handleLogout } from './handlers/auth';
import { 
  handleBalances, 
  handleBudget, 
  handleBudgetDelete, 
  handleBudgetList, 
  handleBudgetMonthly, 
  handleBudgetTotal 
} from './handlers/budget';
import { 
  handleSplit, 
  handleSplitNew, 
  handleSplitDelete, 
  handleTransactionsList 
} from './handlers/split';
import { handleHelloWorld } from './handlers/hello';

// Global types for Cloudflare Workers
declare global {
  function fetch(input: string, init?: { 
    method?: string; 
    headers?: Record<string, string>; 
    body?: string 
  }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

export default {
  async fetch(request: CFRequest, env: Env, ctx: CFContext): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return createOptionsResponse();
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Route to the appropriate handler
    if (path === '/.netlify/functions/login') {
      return await handleLogin(request, env);
    } else if (path === '/.netlify/functions/logout') {
      return await handleLogout(request, env);
    } else if (path === '/.netlify/functions/balances') {
      return await handleBalances(request, env);
    } else if (path === '/.netlify/functions/budget') {
      return await handleBudget(request, env);
    } else if (path === '/.netlify/functions/budget_delete') {
      return await handleBudgetDelete(request, env);
    } else if (path === '/.netlify/functions/budget_list') {
      return await handleBudgetList(request, env);
    } else if (path === '/.netlify/functions/budget_monthly') {
      return await handleBudgetMonthly(request, env);
    } else if (path === '/.netlify/functions/budget_total') {
      return await handleBudgetTotal(request, env);
    } else if (path === '/.netlify/functions/split') {
      return await handleSplit(request, env);
    } else if (path === '/.netlify/functions/split_new') {
      return await handleSplitNew(request, env);
    } else if (path === '/.netlify/functions/split_delete') {
      return await handleSplitDelete(request, env);
    } else if (path === '/.netlify/functions/transactions_list') {
      return await handleTransactionsList(request, env);
    } else if (path === '/hello' || path === '/') {
      return await handleHelloWorld(request, env);
    } else {
      return createErrorResponse('Not found', 404);
    }
  },
}; 