# Allowlisted Signup With Group Provisioning

## Context

The app currently exposes a React `/signup` page, but the Cloudflare Worker blocks all Better Auth signup routes with a hardcoded 404 in `cf-worker/src/index.ts`. Existing users are stored in Better Auth's `user` table from `cf-worker/src/db/schema/auth-schema.ts`, and the app's group-scoped data model depends on:

- `user.groupid`
- `groups.userids`
- `groups.metadata.defaultShare`
- active rows in `group_budgets`

The goal is to make signup work only for invited people. The invitation source is a Worker environment variable allowlist. When an allowlisted person signs up, they should be assigned to the configured group. If that group does not exist yet, signup should create it with sensible defaults.

## Allowlist Format

Use a single Worker environment variable named `SIGNUP_ALLOWLIST_JSON`.

Example:

```json
[
  {
    "email": "friend1@example.com",
    "username": "friend1",
    "groupId": "friend-couple",
    "groupName": "Friend Couple"
  },
  {
    "email": "friend2@example.com",
    "username": "friend2",
    "groupId": "friend-couple",
    "groupName": "Friend Couple"
  }
]
```

Matching rules:

- Trim and lowercase submitted email and username before matching.
- A signup is allowed when either submitted email or submitted username matches one allowlist entry.
- If multiple entries could match, reject the config/request as ambiguous and fail closed.
- A missing or malformed allowlist fails closed.
- A non-allowlisted signup returns 403 and creates no user.

Required allowlist fields:

- `email`
- `username`
- `groupId`
- `groupName`

## Schema Changes

Add a `signup_complete` boolean/integer column to the Better Auth `user` table.

Behavior:

- Existing users are backfilled to `signup_complete = true`.
- New signup-created users start as incomplete.
- The user is marked complete only after group membership, group defaults, and group budgets have been reconciled.
- Better Auth's configured additional user fields include `signupComplete`, mapped to the new `signup_complete` column.

This belongs on the Better Auth `user` table because login must be blocked before incomplete users can enter normal app flows.

## Signup Flow

Keep the public endpoint path as `/auth/sign-up/email` so the current frontend can keep using `authClient.signUp.email`.

Replace the blanket signup 404 with a custom signup handler that wraps Better Auth signup with allowlist and provisioning logic.

Flow:

1. Parse and validate the signup request body.
2. Parse `SIGNUP_ALLOWLIST_JSON`.
3. Match submitted email or username to one allowlist entry.
4. Upsert the configured group if it does not exist.
5. Call Better Auth signup with:
   - submitted name/email/password/username/firstName/lastName
   - `groupid` from the allowlist entry
   - `signupComplete: false`
6. If Better Auth reports a duplicate email or username:
   - look up the existing user
   - continue only when the existing user belongs to the same allowlist entry/group and `signup_complete = false`
   - otherwise return the normal duplicate/account-exists error
7. In one database transaction, reconcile app-side provisioning:
   - ensure default budgets exist for the group
   - ensure the user ID appears exactly once in `groups.userids`
   - recompute equal `metadata.defaultShare` across all current group members
   - preserve existing metadata fields where possible
   - set `user.signup_complete = true`
8. Return a signup success response compatible with the current UI.

The signup success UX remains unchanged: the frontend redirects to `/login` with "Account created successfully! Please log in."

## Group Defaults

When the group is first created:

- `groupid`: allowlist `groupId`
- `groupName`: allowlist `groupName`
- default currency: `GBP`
- budgets: `House`, `Food`
- `userids`: empty initially or containing the signing-up user after reconciliation
- `metadata.defaultShare`: computed during reconciliation

Default shares are recomputed equally whenever a signup adds a member:

- 1 member: `100`
- 2 members: `50 / 50`
- 3 members: `33.33 / 33.33 / 33.34`

Rounding rule:

- Round all but the last user to two decimals.
- Assign the last user the remainder so the total is exactly `100`.
- Use a stable member ordering, such as sorted user IDs, to keep retries deterministic.

Existing transactions and balances are not changed.

## Idempotency

The implementation must be retry-safe.

Idempotent operations:

- Group upsert uses stable `groupId`.
- Default budgets are inserted only if missing.
- Group membership uses set semantics, not append semantics.
- Default shares are recomputed from the current unique member list.
- Marking `signup_complete = true` is repeatable.

Duplicate user behavior:

- Better Auth signup itself is a create operation, not an upsert.
- If a retry finds an existing incomplete user for the same allowlist entry and group, it resumes group reconciliation instead of creating another user.
- If an existing user is already complete, the signup fails as an existing-account duplicate.
- If the retry supplies a different password after the first successful user creation, the existing password is not overwritten.

Partial-failure behavior:

- If group upsert succeeds but user creation fails, the empty or partial group can remain. A retry reuses it.
- If user creation succeeds but provisioning fails before `signup_complete` is set, the user remains incomplete. A retry resumes provisioning.
- Incomplete users cannot sign in.

## Sign-In Guard

Block incomplete users from authenticating.

Required checks:

- `/auth/sign-in/username` rejects users with `signup_complete !== true`.
- `/auth/sign-in/email` also rejects incomplete users.
- Protected API auth helpers reject sessions whose user is incomplete.

The frontend can keep its current generic login error unless we decide later to surface a more specific setup-incomplete message.

## Testing

Backend tests should cover:

- Allowlisted signup succeeds.
- Non-allowlisted signup returns 403 and creates no user.
- Signup creates or reuses a group.
- Signup creates default budgets if missing.
- Signup adds the user to `groups.userids` exactly once.
- Signup recomputes equal `defaultShare`.
- Signup marks the user complete only after provisioning.
- Duplicate complete user returns an account-exists style error.
- Existing incomplete user retry resumes provisioning.
- Incomplete user cannot sign in by username.
- Incomplete user cannot sign in by email.
- Migration backfills existing users to complete.

No automated e2e test is required for this feature.

Manual local verification:

1. Start the local worker and frontend.
2. Configure `SIGNUP_ALLOWLIST_JSON` with two users in one group.
3. Sign up the first user through `/signup`.
4. Confirm the user can log in and sees a one-member group with `100%`.
5. Sign up the second user.
6. Confirm both users can log in and dashboard defaults show `50 / 50`, `GBP`, `House`, and `Food`.
7. Submit a small linked expense/budget entry to confirm the provisioned group is usable.

## Out Of Scope

- Public self-service signup without allowlist.
- Admin UI for managing invites.
- Email invitations.
- Password reset.
- Automated Playwright e2e coverage for this flow.
