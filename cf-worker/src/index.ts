import { createOptionsResponse, createErrorResponse } from './utils';
import {
  handleBalances,
  handleBudget,
  handleBudgetDelete,
  handleBudgetList,
  handleBudgetMonthly,
  handleBudgetTotal
} from './handlers/budget';
import {
  handleSplitNew,
  handleSplitDelete,
  handleTransactionsList
} from './handlers/split';
import { handleHelloWorld } from './handlers/hello';
import { handleCron } from './handlers/cron';
import { handleUpdateGroupMetadata, handleGroupDetails } from './handlers/group';
import { handleRelinkData } from './handlers/migration';
import { auth } from './auth';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return createOptionsResponse(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Priority 1: Handle all better-auth routes
    if (path.startsWith('/auth/')) {
      const authInstance = auth(env);
      return await authInstance.handler(request);
    }

    // Priority 2: Handle all your existing application API routes
    if (path.startsWith('/.netlify/functions/')) {
      const apiPath = path.replace('/.netlify/functions/', '');

      // Simple router for your API
      switch (apiPath) {
      case 'balances':
        return await handleBalances(request, env);

      case 'budget':
        return await handleBudget(request, env);

      case 'budget_delete':
        return await handleBudgetDelete(request, env);

      case 'budget_list':
        return await handleBudgetList(request, env);

      case 'budget_monthly':
        return await handleBudgetMonthly(request, env);

      case 'budget_total':
        return await handleBudgetTotal(request, env);

      case 'group/details':
        return await handleGroupDetails(request, env);

      case 'group/metadata':
        return await handleUpdateGroupMetadata(request, env);

      case 'split_new':
        return await handleSplitNew(request, env);

      case 'split_delete':
        return await handleSplitDelete(request, env);

      case 'transactions_list':
        return await handleTransactionsList(request, env);

      case 'relink-data':
        return await handleRelinkData(request, env);

      case 'hello':
        return await handleHelloWorld(request, env);

      default:
        return createErrorResponse('Not Found', 404, request, env);
      }
    }

    // Handle /hello endpoint for compatibility
    if (path === '/hello') {
      return await handleHelloWorld(request, env);
    }

    // Priority 3: Fallback to serving static assets (your React app)
    try {
      const assetRequest = new Request(request.url, {
        method: request.method
      });
      return await env.ASSETS.fetch(assetRequest);
    } catch (e) {
      console.error('Asset not found', e);
      return createErrorResponse('Asset not found', 404, request, env);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env, controller.cron));
  }
};
