import { betterAuth } from 'better-auth';
import {customSession, username } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db';
import { enrichSession } from './utils';
import { Session } from './types';
// const env = process.env as unknown as Env;
export const auth = (env: Env): ReturnType<typeof betterAuth> => betterAuth({
// export const auth =  betterAuth({
  database: drizzleAdapter(getDb(env), {
    provider: 'sqlite'
  }),
  plugins: [
    username(),
    customSession(async ({ user, session }) => {
      return {
        user,
        session,
        extra: await enrichSession({user, session} as Session, getDb(env))
      };
    })
  ],
  secret: env.AUTH_PRIVATE_KEY,
  baseURL: env.BASE_URL,
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  user: {
    additionalFields: {
      groupid: {
        type: 'number',
        required: false
      },
      firstName: {
        type: 'string',
        required: true,
        defaultValue: ''
      },
      lastName: {
        type: 'string',
        required: true,
        defaultValue: '',
        input: true
      }
    }
  },
  advanced: {
    useSecureCookies: !env.LOCAL
  }
});
