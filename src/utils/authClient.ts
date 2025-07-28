import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
    // The base URL for our auth routes on the server
    baseURL: `http://localhost:8787/auth`, 
    plugins: [
        // This enables client-side functions like signIn.username()
        usernameClient()
    ]
}); 