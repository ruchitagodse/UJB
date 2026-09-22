# Plan 1 Migration: API-Driven Authenticated Data Access with DB Portability

## Summary
Move all protected user and admin data access out of browser Firestore and behind authenticated Next.js API routes. Keep the current auth UXs intact:
- User: WhatsApp OTP -> `crm_token` + `user_sessions`
- Admin: Firebase login -> admin session cookie

At the same time, introduce a repository/provider layer so route handlers and feature logic no longer depend directly on Firebase. Firebase remains the first provider implementation, but future migration to another NoSQL database only requires replacing provider implementations, not rewriting UI or route logic.

## Implementation Changes

### 1. Establish the target architecture
Adopt one mandatory flow for protected features:
- UI calls `/api/user/*` or `/api/admin/*`
- Route validates session/role through a server auth guard
- Route calls a feature service
- Feature service calls repository interfaces
- Repository implementation talks to the current DB provider

Rules to enforce:
- No protected browser-side `firebase/firestore` reads or writes in user or admin product flows
- No route handler should embed collection-specific Firebase logic directly once migrated
- No UI component should know collection names or Firestore query shapes

### 2. Introduce shared server-side auth guards
Create two stable auth entrypoints:
- `requireUserSession(req)` returning normalized user session context
- `requireAdminSession(req, access?)` returning normalized admin session context

Both should:
- Reuse the existing session mechanisms already in the repo
- Return a common result shape with identity, role, and permission metadata
- Be the only auth gate used by protected routes

Normalize the auth context shape so downstream services do not care whether identity came from WhatsApp OTP or Firebase-backed admin login.

Recommended normalized contexts:
```ts
type UserAuthContext = {
  actorType: "user";
  ujbCode: string;
  phone: string;
  sessionId: string;
};

type AdminAuthContext = {
  actorType: "admin";
  email: string;
  name: string;
  role: string;
  permissions: string[];
};
```

### 3. Add a DB portability layer
Define repository interfaces by business capability, not by collection:
- `UserRepository`
- `ReferralRepository`
- `ProspectRepository`
- `MeetingRepository`
- `ContentRepository`
- `FavoriteRepository`
- `NotificationRepository`

Add a provider resolver:
```ts
type DataProvider = {
  users: UserRepository;
  referrals: ReferralRepository;
  prospects: ProspectRepository;
  meetings: MeetingRepository;
  content: ContentRepository;
  favorites: FavoriteRepository;
  notifications: NotificationRepository;
};
```

Implementation strategy:
- Create Firebase-backed repositories first
- Reuse existing workflow logic where possible by moving Firebase-specific code down into repository implementations
- Route handlers and feature services must depend only on repository interfaces and auth contexts

This is the key portability boundary for future migration to MongoDB, DynamoDB, Couchbase, etc.

### 4. Standardize API route contracts
For all protected routes, adopt a consistent response contract:
```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; message: string; code?: string };
```

Route behavior should be consistent:
- `401` unauthenticated
- `403` authenticated but not authorized
- `404` missing resource
- `422` invalid input
- `500` server/provider failure

This keeps UI stable even if the DB provider changes later.

### 5. Migrate features in execution order
Migrate by risk and dependency order so auth stability improves early.

#### Phase A: Foundation
- Add auth guards
- Add repository interfaces
- Add Firebase repository implementations
- Add provider resolver/factory
- Add shared API response helpers
- Add validation helpers for user/admin routes

Acceptance:
- No behavior change yet
- New routes/services can use the foundation without direct Firebase imports

#### Phase B: Finish high-risk user-facing Firestore removals
Start with the pages most likely to fail under fresh user-only login:
1. `referrals`
2. `prospects`
3. `monthlymeeting`
4. `conclave`
5. `profile`
6. `dewdrop`

For each feature:
- Inventory all direct `firebase/firestore` imports in pages, hooks, and child components
- Create or expand `/api/user/<feature>` routes
- Move collection/query logic into repositories
- Replace client Firestore calls with `fetch(..., { credentials: "include" })`
- Remove feature-specific client Firestore imports after migration

Acceptance per feature:
- Works in fresh browser with only user OTP login
- Works without any prior admin login in another tab
- No protected Firestore access remains in that feature’s UI path

#### Phase C: Admin hardening
Audit admin UI for any remaining direct Firestore usage and route-level Firebase coupling:
- `orbiters`
- `prospects`
- `referrals`
- templates/settings
- user management

Changes:
- Admin UI must also talk only to `/api/admin/*`
- Admin routes must use `requireAdminSession`
- Role checks stay in access-control services, not in UI code

Acceptance:
- Admin flows continue to work after refactor
- Admin auth remains independent of user session state

#### Phase D: Shared hook and component cleanup
After feature migrations:
- Refactor shared hooks so they fetch through APIs or accept server-loaded data
- Remove generic Firestore helpers from client code where no longer needed
- Isolate any still-public real-time usage behind clearly named public hooks

Acceptance:
- Protected features no longer rely on client Firestore at all
- Remaining client Firebase usage, if any, is intentionally public or non-sensitive

### 6. Preserve current auth UX while decoupling data access
User side:
- Keep OTP send/verify flow unchanged
- Keep `crm_token` and `user_sessions`
- Treat server session as the source of truth for all protected user API access

Admin side:
- Keep current Firebase sign-in UX
- Keep admin session cookie creation after Firebase identity verification
- Treat admin server session as the source of truth for all protected admin API access

Important invariant:
- Firebase client auth state must not be required for protected app behavior on either side

### 7. Create migration-safe service boundaries
Feature services should encapsulate business logic independent of DB provider. Example responsibilities:
- `ReferralService`: create referral, list referrals, update status, fetch discussion
- `ProspectService`: list prospects, create/edit prospect, fetch assessments
- `MeetingService`: list meetings, RSVP/join, fetch event detail

Business rules live here, not in route handlers and not in repository implementations.

Repository implementations should only handle:
- persistence
- query translation
- serialization/deserialization
- provider-specific error mapping

### 8. Add rollout and regression controls
Use an incremental migration strategy:
- Migrate feature by feature, not all at once
- For each migrated feature, remove direct client Firestore use before moving to the next
- Keep temporary compatibility only at route/service level, never by reintroducing browser Firestore access

Add minimal observability:
- structured server logs for auth failures
- structured logs for repository failures
- one stable error code per auth and provider failure class

## Important Public Interfaces / Types
Add or standardize these interfaces:
- `requireUserSession(req): Promise<UserAuthContext | AuthFailure>`
- `requireAdminSession(req, access?): Promise<AdminAuthContext | AuthFailure>`
- `getDataProvider(): DataProvider`
- `ApiSuccess<T>` / `ApiError`
- Feature service interfaces for referrals, prospects, meetings, content, profile, favorites

Do not expose Firebase document snapshots, collection names, or Firestore query shapes outside repository implementations.

## Test Plan
Run the same matrix for each migrated feature.

### Auth/session scenarios
- Fresh browser: user OTP login only
- Fresh browser: admin login only
- Same browser: admin and user logged in in separate tabs
- Expired user session
- Expired admin session
- Logged-out browser with stale UI state

### Authorization scenarios
- User cannot access another user’s protected data
- Admin with insufficient role cannot access restricted admin actions
- User route called with admin-only expectation returns correct failure
- Admin route called without admin session returns `401`

### Feature behavior scenarios
- List pages load correctly through API
- Detail pages load correctly through API
- Create/update flows succeed with valid session
- Save/update failures show stable error messages
- Features work with no Firebase client auth state present

### Portability scenarios
- Feature service tests run against mocked repository interfaces
- Route tests do not depend on Firebase SDK types
- Repository swap should require no UI changes and no route contract changes

## Assumptions and Defaults
- Keep the current user OTP auth model and current admin Firebase login UX
- Use server session cookies as the only protected-access authority
- Firebase remains the first provider implementation
- Real-time browser Firestore listeners are out of scope for protected data; if needed later, they should be reintroduced only through a deliberate public-safe design
- Feature migration order defaults to: `referrals`, `prospects`, `monthlymeeting`, `conclave`, `profile`, `dewdrop`, then remaining admin cleanup
