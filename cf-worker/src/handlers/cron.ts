import { Env, Group } from '../types';
import {
  formatSQLiteTime,
  generateBudgetTotalUpdateStatements,
  generateMonthlyBudgetUpdateStatements,
  executeBatch
} from '../utils';

const MONTHLY_CREDITS: { [key: string]: number } = {
  'house': 800,
  'aayushi': 133,
  'tanmay': 150,
  'puma': 100,
  'default': -1
};

export async function handleCron(env: Env, cron: string) {
  console.log(`Cron job for ${cron} started`);
  const groupIds = env.GROUP_IDS.split(',').map(id => id.trim());

  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const description = `${month} ${year}`;

  for (const groupId of groupIds) {
    try {
      const groupStmt = env.DB.prepare('SELECT * FROM groups WHERE groupid = ?');
      const groupResult = await groupStmt.bind(groupId).first() as Group;

      if (!groupResult) {
        console.error(`Group with id ${groupId} not found`);
        continue;
      }

      const budgets: string[] = JSON.parse(groupResult.budgets || '[]');
      if (!Array.isArray(budgets)) {
        console.error(`Budgets for group ${groupId} is not an array`);
        continue;
      }

      const statements = [];

      for (const budget of budgets) {
        const amount = MONTHLY_CREDITS[budget] || MONTHLY_CREDITS['default'];
        if (amount <= 0) {
          continue;
        }

        const addedTime = formatSQLiteTime();

        // Create budget entry statement
        const budgetStatement = {
          sql: `INSERT INTO budget (description, price, added_time, amount, name, groupid, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            description,
            `+${amount.toFixed(2)}`,
            addedTime,
            amount,
            budget,
            groupId,
            'GBP'
          ]
        };

        // Generate budget total update statements
        const budgetTotalStatements = generateBudgetTotalUpdateStatements(
          parseInt(groupId),
          budget,
          'GBP',
          amount,
          'add'
        );

        // Generate monthly budget update statements
        const monthlyBudgetStatements = generateMonthlyBudgetUpdateStatements(
          parseInt(groupId),
          budget,
          'GBP',
          amount,
          addedTime,
          'add'
        );

        statements.push(budgetStatement, ...budgetTotalStatements, ...monthlyBudgetStatements);
      }

      // Execute all budget operations for this group in a single batch
      if (statements.length > 0) {
        await executeBatch(env, statements);
      }
    } catch (error) {
      console.error(`Error processing group ${groupId}:`, error);
    }
  }

  console.log(`Cron job for ${cron} finished`);
}
