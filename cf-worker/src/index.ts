import { CFRequest, Env, CFContext } from './types';
import { createOptionsResponse } from './utils';
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
import { handleCron } from './handlers/cron';
import { handleUpdateGroupMetadata, handleGroupDetails } from './handlers/group';

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
  async fetch(request: CFRequest, env: Env, _ctx: CFContext): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return createOptionsResponse(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle API routes
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
    } else if (path === '/.netlify/functions/group/details') {
      return await handleGroupDetails(request, env);
    } else if (path === '/.netlify/functions/group/metadata') {
      return await handleUpdateGroupMetadata(request, env);
    } else if (path === '/.netlify/functions/split') {
      return await handleSplit(request, env);
    } else if (path === '/.netlify/functions/split_new') {
      return await handleSplitNew(request, env);
    } else if (path === '/.netlify/functions/split_delete') {
      return await handleSplitDelete(request, env);
    } else if (path === '/.netlify/functions/transactions_list') {
      return await handleTransactionsList(request, env);
    } else if (path === '/hello') {
      return await handleHelloWorld(request, env);
    } else if (path === '/.netlify/functions/hello') {
      return await handleHelloWorld(request, env);
    } else {
      // For all other routes, defer to static assets
      // The [assets] configuration will handle serving the React SPA
      const assetRequest = new Request(request.url, {
        method: request.method
      });
      return await env.ASSETS.fetch(assetRequest);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env, controller.cron));
  }
};
