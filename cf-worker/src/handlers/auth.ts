
// NOTE: This file is no longer needed for authentication since we're using better-auth
// better-auth automatically handles login/logout through its API routes
// This file is kept for potential future auth-related utilities
// Placeholder for future auth utilities
// better-auth handles login/logout automatically via /auth/* routes

export function getAuthInfo() {
  return {
    message: 'Authentication is now handled by better-auth',
    loginUrl: '/auth/signin',
    logoutUrl: '/auth/signout',
    signupUrl: '/auth/signup'
  };
}
