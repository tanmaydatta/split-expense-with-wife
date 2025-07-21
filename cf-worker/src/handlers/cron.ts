import { Env, Group } from '../types';
import { formatSQLiteTime } from '../utils';

const MONTHLY_CREDITS: { [key: string]: number } = {
  'house': 800,
  'aayushi': 133,
  'tanmay': 150,
  'puma': 100,
  'default': -1
};

export async function handleCron(env: Env, cron: string) {
  console.log(`Cron job for ${cron} started`);
  console.log(env.GROUP_IDS);
  const groupIds = env.GROUP_IDS.split(',').map(id => id.trim());
  console.log('Processing group IDs:', groupIds);

  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const description = `${month} ${year}`;

  for (const groupId of groupIds) {
    console.log(`Processing group ${groupId}`);

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

      for (const budget of budgets) {
        const amount = MONTHLY_CREDITS[budget] || MONTHLY_CREDITS['default'];
        if (amount <= 0) {
          console.log(`Budget '${budget}' not in MONTHLY_CREDITS, ignoring.`);
          continue;
        }
        console.log(`Adding ${amount} to ${budget} budget for group ${groupId}`);

        const budgetStmt = env.DB.prepare(`
          INSERT INTO budget (description, price, added_time, amount, name, groupid, currency)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        await budgetStmt.bind(
          description,
          `+${amount.toFixed(2)}`,
          formatSQLiteTime(),
          amount,
          budget,
          groupId,
          'GBP'
        ).run();
      }
    } catch (error) {
      console.error(`Error processing group ${groupId}:`, error);
    }
  }

  console.log(`Cron job for ${cron} finished`);
}
