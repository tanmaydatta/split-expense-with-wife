import { Env } from '../types';

export async function handleCron(env: Env, cron: string) {
  console.log(`Cron job for ${cron} started`);

  const groupIds = env.GROUP_IDS.split(',').map(id => id.trim());
  console.log('Processing group IDs:', groupIds);

  switch (cron) {
    case '*/2 * * * *':
      // Add your 2-minute interval job logic here
      console.log('Executing 2-minute task for groups:', groupIds);
      break;
    case '*/5 * * * *':
      // Add your 5-minute interval job logic here
      console.log('Executing 5-minute task for groups:', groupIds);
      break;
  }
  
  console.log(`Cron job for ${cron} finished`);
} 