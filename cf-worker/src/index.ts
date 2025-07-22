import { CFRequest, Env, CFContext } from './types';
import { createErrorResponse, createOptionsResponse, backfillMonthlyBudgets, createJsonResponse } from './utils';
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
    } else if (path === '/migrate/monthly-budgets') {
      // Migration endpoint to backfill monthly budget aggregations
      try {
        await backfillMonthlyBudgets(env);
        return createJsonResponse({ message: 'Monthly budget backfill completed successfully' }, 200, {}, request, env);
      } catch (error) {
        console.error('Migration error:', error);
        return createErrorResponse('Migration failed', 500, request, env);
      }
    } else {
      return createErrorResponse('Not found', 404, request, env);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env, controller.cron));
  }
};
