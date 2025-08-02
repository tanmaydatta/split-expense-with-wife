import { betterAuth } from 'better-auth';
import { customSession, username } from 'better-auth/plugins';
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
  rateLimit: {
    enabled: false
  },
  plugins: [
    username(),
    customSession(async ({ user, session }) => {
      return {
        user,
        session,
        extra: await enrichSession({ user, session } as Session, getDb(env))
      };
    })
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 // Cache duration in seconds
    }
  },
  secret: env.AUTH_PRIVATE_KEY,
  baseURL: env.BASE_URL,
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      /** Hash new passwords using Web Crypto API (works in Cloudflare Workers) */
      hash: async (password: string) => {
        console.log('🔒 Custom password hashing called for password length:', password?.length);
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const salt = crypto.getRandomValues(new Uint8Array(16));

        // Use PBKDF2 with 10,000 iterations (much faster than bcrypt/Argon2)
        const key = await crypto.subtle.importKey(
          'raw',
          data,
          { name: 'PBKDF2' },
          false,
          ['deriveBits']
        );

        const hashBuffer = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: salt,
            iterations: 10000,
            hash: 'SHA-256'
          },
          key,
          256
        );

        // Combine salt + hash for storage
        const combined = new Uint8Array(salt.length + hashBuffer.byteLength);
        combined.set(salt);
        combined.set(new Uint8Array(hashBuffer), salt.length);

        // Return as base64
        return btoa(String.fromCharCode.apply(null, Array.from(combined)));
      },

      /** Compare a candidate password with the stored hash */
      verify: async ({ hash, password }: { hash: string, password: string }) => {
        console.log('🔐 Custom password verification called');
        console.log('📝 Hash received:', hash ? `${hash.substring(0, 20)}...` : 'null/undefined');
        console.log('📝 Password length:', password?.length || 'undefined');

        try {
          if (!hash) {
            console.log('❌ No hash provided');
            return false;
          }

          const encoder = new TextEncoder();
          const data = encoder.encode(password);

          // Decode the stored hash
          const combined = new Uint8Array(
            atob(hash).split('').map(char => char.charCodeAt(0))
          );

          // Extract salt (first 16 bytes) and stored hash (remaining bytes)
          const salt = combined.slice(0, 16);
          const storedHash = combined.slice(16);

          // Hash the candidate password with the same salt
          const key = await crypto.subtle.importKey(
            'raw',
            data,
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
          );

          const candidateHashBuffer = await crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: salt,
              iterations: 10000,
              hash: 'SHA-256'
            },
            key,
            256
          );

          const candidateHash = new Uint8Array(candidateHashBuffer);

          // Compare hashes
          if (candidateHash.length !== storedHash.length) {
            return false;
          }

          for (let i = 0; i < candidateHash.length; i++) {
            if (candidateHash[i] !== storedHash[i]) {
              return false;
            }
          }

          console.log('✅ Password verification successful');
          return true;
        } catch (error) {
          console.error('❌ Password verification error:', error);
          return false;
        }
      }
    }
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
