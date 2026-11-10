# AI Usage Log

1. Lim Shao Qi
   > Logged on 2026-11-08 for work done 2026-09-25 to 2026-11-05; dates and prompts are approximate.

Tool for entries 1–27: **ChatGPT (Astra 6)**. Tool for entry 28: **Claude Code (Claude Opus 5.5)**. Every AI output was reviewed, edited and tested by Lim Shao Qi before it was committed.

2. Amber Tan Junning
   > Logged on 2026-11-08 to 2026-11-10 for work done 2026-09-21 to 2026-11-08; dates and prompts are approximate. 

Tools for all entries: **Claude AI and Claude Code** (as specified in the detailed log). Every AI output was reviewed, edited and tested by Amber Tan Junning before it was committed. 

3. Ng See Pui
   > Logged on 2026-11-10 for work done 2026-10-12 to 2026-11-10; dates and prompts are approximate.

Tools for all entries: **ChatGPT (5.6 Luna)**, **ChatGPT (Astra 6)**, **Claude Code (Claude Sonnet 5.5)**. Every AI output was reviewed, edited and tested by Ng See Pui before it was committed.

4.


# Detailed AI Usage Log for Lim Shao Qi

## 1. Registration UI and client-side validation

- **Timestamp:** approx. 2026-09-25 01:50
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `frontend/src/features/auth/components/RegisterForm.tsx`, `frontend/src/features/auth/components/RegistrationOtpForm.tsx`, `frontend/src/pages/RegisterPage.tsx`, `frontend/src/features/auth/schemas/register.schema.ts`
- **Prompt (approx.):** "Using React Hook Form, Zod and shadcn/ui, write a student registration form with username, email, Singapore phone number, password and confirm password. Username is 3–30 letters/numbers. Password needs 8+ chars, upper, lower, digit and special character. After submit, switch to a 6-digit OTP form on the same page with a resend button."
- **Key response:** Produced a Zod register schema with a confirm-password refine, a `RegisterForm` with field-level errors, and an OTP form that has a 6-digit input and a resend button. Also produced a `RegisterPage` that switches between the two steps.
- **Kept/changed:** Kept the form structure. Aligned the validation messages with the backend. Restricted phone input to Singapore mobile numbers. Changed the OTP step to keep the challenge ID in page state rather than the URL.
- **Verification:** Manual testing in the browser (valid and invalid inputs, step switching). The frontend has no automated tests.

## 2. Backend registration validation and pending-registration storage

- **Timestamp:** approx. 2026-09-25 22:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/schemas/register.schema.ts`, `user-service/src/schemas/auth.schema.ts`, `user-service/prisma/schema.prisma`
- **Prompt (approx.):** "Write Zod 4 schemas for an Express registration endpoint: `usernameSchema`, `emailSchema` (trim and lowercase), `phoneNumberSchema` that normalises Singapore numbers to +65XXXXXXXX, `passwordSchema`, plus `registerSchema`, `resendRegistrationOtpSchema` and `verifyRegistrationSchema` (UUID challenge + 6-digit OTP), using strictObject. Also add Prisma models for a `PendingRegistration` and `RegistrationOtpRequest`, and make email/username/phoneNumber unique on `User`."
- **Key response:** Produced the schemas with normalising transforms and inferred input types. Also produced Prisma models with unique constraints and an expiry/failed-attempts column on pending registrations.
- **Kept/changed:** Changed the phone regex so it accepts numbers with and without the +65 prefix. Switched to `z.strictObject` so unknown fields are rejected. Normalised identities (lower-case email) in a separate migration. Updated `loginSchema` to reuse the same email normalisation.
- **Verification:** `user-service/src/schemas/register.schema.test.ts` (valid payload, +65 normalisation, weak passwords, invalid usernames, non-SG numbers, unknown fields, 6-digit OTP).

## 3. Brevo SMTP email delivery

- **Timestamp:** approx. 2026-09-26 10:55
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/libs/email.ts`
- **Prompt (approx.):** "Using nodemailer, write a lazily created SMTP transporter for Brevo (smtp-relay.brevo.com:587). It should read credentials from env, throw a clear error if a setting is missing, and expose `sendRegistrationOtpEmail(email, otp)`. Wrap send failures in our `AppError`."
- **Key response:** Produced `getEmailSetting`, a cached `getTransporter` and `sendRegistrationOtpEmail` with plain-text and HTML bodies.
- **Kept/changed:** Kept the transporter caching. Added `sendEmailChangeOtpEmail` and `sendAdminInvitationEmail` later myself, following the same pattern. Changed error codes to 503 so a mail outage surfaces as service unavailable.
- **Verification:** Manual testing by sending OTP emails to test inboxes through Brevo.

## 4. Registration OTP issue, verify and resend (backend)

- **Timestamp:** approx. 2026-09-26 12:15
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/services/registration.service.ts`, `user-service/src/routes/auth.route.ts`, `user-service/src/types/auth.types.ts`
- **Prompt (approx.):** "With Prisma, implement `startRegistration`, `resendRegistrationOtp` and `verifyRegistration`. Hash the password and OTP, store a pending registration with a 1-hour expiry, and limit OTP requests per email per hour. Lock the code after N failed attempts. On success, create a STUDENT user in a transaction. Return 409 if the email, username or phone is already taken. Handle serialization conflicts by retrying the transaction once."
- **Key response:** Produced `ensureIdentityIsAvailable`, `saveOtpRequest` with a serializable transaction and retry loop, `issueOtp`, and the three exported functions with typed `AppError` codes (`INVALID_OTP`, OTP expired, too many attempts).
- **Kept/changed:** Moved the limits into `auth.constants.ts`. Made the failed-attempt update conditional (`failedAttempts < max`) so concurrent wrong guesses can't bypass the lockout. Added the `/register`, `/register/resend` and `/register/verify` routes and the `AuthenticatedRequest` type myself.
- **Verification:** `user-service/src/services/registration.service.test.ts` (unknown/consumed challenge, expired code, lockout, wrong-code counting, concurrent consumption). Also manual end-to-end registration.

## 5. Registration OTP wiring (frontend)

- **Timestamp:** approx. 2026-09-26 13:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `frontend/src/features/auth/hooks/useRegister.ts`, `frontend/src/features/auth/hooks/useVerifyRegistration.ts`, `frontend/src/features/auth/hooks/useResendRegistrationOtp.ts`, `frontend/src/features/auth/services/auth.service.ts`
- **Prompt (approx.):** "Write TanStack Query mutation hooks and axios service functions for POST /auth/register, /auth/register/verify and /auth/register/resend. They should show toast errors from the API's error message and navigate to login after successful verification."
- **Key response:** Produced three `useMutation` hooks and matching service functions with typed request/response bodies.
- **Kept/changed:** Mapped API error codes (`USERNAME_TAKEN`, `INVALID_OTP`) to field errors instead of generic toasts. Added a resend cooldown in the UI.
- **Verification:** Manual testing of the full register → OTP → login flow.

## 6. Profile read and update

- **Timestamp:** approx. 2026-09-26 14:55
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - Backend: `user-service/src/services/user.service.ts`, `user-service/src/controllers/user.controller.ts`, `user-service/src/routes/user.route.ts`, `user-service/src/schemas/user.schema.ts`, `user-service/src/middlewares/auth.middleware.ts`, `user-service/src/libs/accessToken.ts`
  - Frontend: `frontend/src/features/user/hooks/useProfile.ts`, `frontend/src/features/user/hooks/useUpdateProfile.ts`, `frontend/src/features/user/schemas/profile.schema.ts`, `frontend/src/features/user/components/ProfileDetailsForm.tsx`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/features/user/services/user.service.ts`, `frontend/src/features/user/types/user.types.ts`
- **Prompt (approx.):** "Add authenticated GET /users/me and PATCH /users/me. The `authenticate` middleware should verify a Bearer access token with `verifyAccessToken` and attach `req.user`. `updateMyProfile` should accept username and/or phoneNumber, require at least one field, and return 409 if the new value belongs to another user. Then write the React profile page with a form that is pre-filled from `useProfile`."
- **Key response:** Produced the middleware, `getMyProfile`/`updateMyProfile` with a `toPublicUser` mapper, the controllers and routes, and the frontend hooks, form and page.
- **Kept/changed:** Added `ensureProfileValuesAreAvailable` and handled Prisma P2002 as a `PROFILE_CONFLICT` race. Rejected tokens with unknown roles in `verifyAccessToken`. Invalidated the profile query on a successful update.
- **Verification:** `user-service/src/middlewares/auth.middleware.test.ts`, `user-service/src/libs/tokens.test.ts`, `user-service/src/schemas/user.schema.test.ts` ("at least one field"). Also manual testing of the profile page.

## 7. Verified email change

- **Timestamp:** approx. 2026-09-26 15:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/services/email-change.service.ts`, `frontend/src/features/user/hooks/useEmailChange.ts`, `frontend/src/features/user/schemas/email-change.schema.ts`
- **Prompt (approx.):** "Following the same pattern as my registration OTP service, implement `startEmailChange`, `resendEmailChangeOtp`, `verifyEmailChange` and `getPendingEmailChange`. The OTP goes to the new email. Reject an email that is already registered or the same as the current one. Rate-limit per user and per email, and lock the code after too many failed attempts."
- **Key response:** Produced the service with a `PendingEmailChange` per user, transactional OTP issuance and verification that swaps the email.
- **Kept/changed:** Reused the registration constants and the `isTransactionConflict` retry. Added a 410 `OTP_EXPIRED` response. Wrote the frontend hook to handle the start/resend/verify mutations in one place.
- **Verification:** Manual testing with two inboxes (expired code, wrong code, email already in use).

## 8. Change password

- **Timestamp:** approx. 2026-09-26 16:05
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `frontend/src/features/user/components/PasswordChangeForm.tsx`, `frontend/src/features/user/hooks/useChangePassword.ts`, `frontend/src/features/user/schemas/password-change.schema.ts`
- **Prompt (approx.):** "Write a change-password form (current, new, confirm) with Zod, reusing the registration password rules. The new password must differ from the current one. It posts to /users/me/password-change and resets the form on success."
- **Key response:** Produced the schema with confirm/difference refines, the mutation hook and the form component.
- **Kept/changed:** Mapped a wrong current password to a field error on `currentPassword`. Added show/hide password toggles.
- **Verification:** `user-service/src/services/user.service.test.ts` (wrong current password, reusing the current password) for the backend. Manual testing for the form.

## 9. Phone prefix bug in profile form

- **Timestamp:** approx. 2026-09-26 16:25
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** debug
- **Files:** `frontend/src/features/user/components/ProfileDetailsForm.tsx`
- **Prompt (approx.):** "My profile form shows +65 in the phone field, and saving it again fails validation because the input expects 8 digits. How do I display the number without the prefix but still send a valid value?"
- **Key response:** Suggested stripping the prefix when setting default values (`phoneNumber.replace(/^\+65/, '')`) and letting the schema normalise it back.
- **Kept/changed:** Applied the strip in the default values only and left the backend normalisation unchanged.
- **Verification:** Manual testing (edit and save a profile with an existing +65 number).

## 10. Manage users (admin list and promotion)

- **Timestamp:** approx. 2026-09-26 17:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/middlewares/authorize.middleware.ts`, `frontend/src/features/user/hooks/useAdminUsers.ts`, `frontend/src/features/user/hooks/usePromoteUser.ts`, `frontend/src/features/user/components/PromoteUserDialog.tsx`, `frontend/src/pages/ManageUsersPage.tsx`, `frontend/src/components/ui/search-bar.tsx`
- **Prompt (approx.):** "Write an Express `authorize(...roles)` middleware that returns 401 without `req.user` and 403 for the wrong role. Add an admin-only GET /users with search, page and pageSize query params (max 100) and PATCH /users/:userId/role that only promotes a STUDENT to ADMIN. On the frontend, build a paginated, searchable users table with a confirmation dialog for promotion and a reusable debounced search bar."
- **Key response:** Produced the middleware, `listUsers`/`promoteUserToAdmin` and the query schema, plus the React table page, dialog, hooks and search bar.
- **Kept/changed:** Made promotion conditional on the current role, so concurrent promotions return a conflict instead of silently succeeding. Extracted the search bar into `components/ui`. Kept the page in sync with the URL search params.
- **Verification:** `user-service/src/middlewares/auth.middleware.test.ts` ("authorize enforces roles"), `user-service/src/services/user.service.test.ts` (promotion cases), `user-service/src/schemas/user.schema.test.ts` (pagination bounds). Manual testing for the UI.

## 11. Admin invitation and activation

- **Timestamp:** approx. 2026-09-26 20:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - Backend: `user-service/src/services/admin-invitation.service.ts`, `user-service/src/services/admin-activation.service.ts`
  - Frontend: `frontend/src/features/user/schemas/admin-invitation.schema.ts`, `frontend/src/features/auth/schemas/admin-activation.schema.ts`, `frontend/src/features/user/hooks/useCreateAdminInvitation.ts`, `frontend/src/features/auth/hooks/useActivateAdmin.ts`, `frontend/src/features/user/components/CreateAdminInvitationDialog.tsx`, `frontend/src/features/auth/components/AdminActivationForm.tsx`, `frontend/src/pages/AdminActivationPage.tsx`
- **Prompt (approx.):** "Implement admin invitations. An admin enters an email, and we create a random 32-byte token, store only its hash, and email an activation link. Add a resend cooldown and reject emails that are already registered. Then add `activateAdmin`, which takes the token plus username, phone and password, checks the token is unused and unexpired, and creates the ADMIN user in a transaction. Also build the invite dialog and the activation page that reads the token from the URL."
- **Key response:** Produced both services with token hashing, `createActivationUrl`, cooldown handling and transactional activation. Also produced the frontend schemas, hooks, dialog, form and page.
- **Kept/changed:** Validated the token format (43-char base64url) in the schema. Used `ensureIdentityIsAvailable` for clear 409s. Made a resend replace the old token with a conditional `updateMany` guarded by the cooldown. The invitation row is deleted if the email fails to send.
- **Verification:** Manual testing of the full invite → email → activation flow, including an expired token and an email that already has an account.

## 12. First-admin bootstrap

- **Timestamp:** approx. 2026-10-11 23:40
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/services/bootstrap-admin.service.ts`, `user-service/src/index.ts`
- **Prompt (approx.):** "On startup, create the first admin from env vars exactly once. Return 'disabled' if not configured, 'already-completed' if a BootstrapState row exists, 'existing-admin' if any admin exists, else 'created'. Fail startup with a clear message on invalid config or an identity conflict, without partially creating anything."
- **Key response:** Produced `bootstrapAdmin` with a `BootstrapResult` type, a transactional create plus a `BootstrapState` marker, and a `BootstrapError` class.
- **Kept/changed:** Listed the invalid config keys in the error message. Called it from `index.ts` before `listen`. Later added graceful SIGINT/SIGTERM shutdown there.
- **Verification:** Manual testing by starting the service with no config, valid config, a second start, and a conflicting email.

## 13. Credit ledger and idempotent initial grant

- **Timestamp:** approx. 2026-10-12 02:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `credit-service/src/services/credit.service.ts`, `credit-service/src/types/credit.types.ts`
- **Prompt (approx.):** "In credit-service with Prisma, write `grantInitialCredits(prisma, userId)`. It should give 50 credits once per user by creating the account and an append-only INITIAL_GRANT transaction in one transaction. Make it idempotent so a redelivered event returns the existing grant instead of failing on the unique constraint (P2002). Reject a userId that isn't a UUID."
- **Key response:** Produced the grant function with a result type that distinguishes created and existing grants, and P2002 handling.
- **Kept/changed:** Added a consistency check that throws if an existing grant has an unexpected amount. Added `getCreditBalance`/`getCreditTransactions` later (entry 16).
- **Verification:** Manual testing by calling the grant twice for the same user and checking the database. There are no automated tests for this function in the repo.

## 14. Registration outbox and RabbitMQ delivery

- **Timestamp:** approx. 2026-10-12 13:50
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/src/libs/rabbitmq.ts`, `user-service/src/services/outbox-publisher.service.ts`, `credit-service/src/services/registration-consumer.service.ts`, `credit-service/src/schemas/registration-event.schema.ts`
- **Prompt (approx.):** "With amqplib, I need durable delivery of USER_REGISTERED events from user-service to credit-service. Write `connectRegistrationMessaging` (validate that RABBITMQ_URL is amqp/amqps), a topology with main, retry (TTL) and dead queues, and `publishConfirmed` with publisher confirms. In user-service, write an outbox publisher loop that polls pending events, publishes them, and retries with exponential backoff capped at 60s. In credit-service, write a consumer that validates the event, grants credits, and sends transient DB errors to the retry queue with an x-retry-count header, or to the dead queue."
- **Key response:** Produced the topology declaration, confirm-based publishing, `startOutboxPublisher` with `retryDelay`/`failureCode`, and `startRegistrationConsumer` with `processMessage`, `isTransient` and forwarding.
- **Kept/changed:** Guarded against concurrent publishes on one channel and publishing on a failed channel. Dead-lettered invalid retry headers instead of trusting them. Changed the consumer to ack only after forwarding succeeds. Added structured logging of outcomes.
- **Verification:** Manual testing with RabbitMQ in Docker (stopped the broker and DB mid-flow, checked the retry/dead queues in the management UI). The outbox write itself is covered by `user-service/src/services/registration.service.test.ts` ("creates a student and a USER_REGISTERED outbox event").

## 15. Dead-letter redrive script

- **Timestamp:** approx. 2026-10-12 15:25
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `credit-service/src/scripts/redrive-registration.ts`
- **Prompt (approx.):** "Write a CLI script that moves up to N messages from the registration dead queue back to the main queue. It should validate each message with `registrationEventSchema`, reset x-retry-count to 0, and only ack after the republish is confirmed."
- **Key response:** Produced `redrive(limit)` using `checkQueue`, `channel.get` with manual ack, and confirmed publishing.
- **Kept/changed:** Added a redrive-count header to stop infinite redrive loops. Left invalid messages in the dead queue. Documented usage in the credit-service README.
- **Verification:** Manual testing by putting a message in the dead queue and redriving it.

## 16. Credit balance and transaction-history endpoints

- **Timestamp:** approx. 2026-10-12 16:10
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `credit-service/src/controllers/credit.controller.ts`, `credit-service/src/schemas/credit.schema.ts`, `credit-service/src/libs/credit-cursor.ts`
- **Prompt (approx.):** "Add GET /credits/me/balance and GET /credits/me/transactions. History is filterable by type, sortable asc/desc (default desc) and cursor-paginated with an opaque base64url cursor that encodes (createdAt, id, type, sort). Reject a cursor that doesn't match the current filter. If the account doesn't exist yet, return a 'provisioning' response instead of a 404."
- **Key response:** Produced the controllers, the query and cursor Zod schemas, and `encodeTransactionCursor`/`decodeTransactionCursor`.
- **Kept/changed:** Added a strict base64url round-trip check in `decodeTransactionCursor` so malformed cursors return 400. Typed the responses as a `BalanceResponse | ProvisioningResponse` union.
- **Verification:** Manual testing with curl and the frontend (filters, both sort orders, tampered cursor). There are no automated tests in the repo for these files.

## 17. Frontend credits (balance and history)

- **Timestamp:** approx. 2026-10-12 19:15
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - API and types: `frontend/src/api/creditApi.ts`, `frontend/src/features/credit/types/credit.types.ts`, `frontend/src/features/credit/services/credit.service.ts`
  - Hooks: `frontend/src/features/credit/hooks/useCreditBalance.ts`, `frontend/src/features/credit/hooks/useCreditTransactions.ts`
  - Components and page: `frontend/src/components/navbar/CreditBalance.tsx`, `frontend/src/features/credit/components/CreditTransactionList.tsx`, `frontend/src/features/credit/components/CreditHistory.tsx`, `frontend/src/pages/CreditsPage.tsx`
- **Prompt (approx.):** "Write the React side for credits. I need an axios client for the credit service, a `useCreditBalance` hook that polls every 2s while the API says 'provisioning' and gives up after 30s, a `useInfiniteQuery` hook for cursor-paginated transactions with type and sort filters, a navbar badge showing available and reserved credits, and a credits page with the history list."
- **Key response:** Produced the service functions, query keys, both hooks, the navbar component, the list and history components, and the page.
- **Kept/changed:** Validated API responses before using them. Showed a clear 'still setting up your account' state after the timeout. Kept a shared balance between the navbar and the page.
- **Verification:** Manual testing (new account during provisioning, filters, load more). Test files written during this session were removed in a73e05d, so there are no automated frontend tests.

## 18. Stale credit data across sessions

- **Timestamp:** approx. 2026-10-12 19:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** debug
- **Files:** `frontend/src/store/authStore.ts`
- **Prompt (approx.):** "After logging out and logging in as another student, the navbar briefly shows the previous user's credits. My Zustand auth store sets and clears the token. How do I make sure TanStack Query credit data doesn't leak between sessions?"
- **Key response:** Suggested calling `queryClient.removeQueries({ queryKey: creditKeys.all })` whenever the session user changes and on `clearAuth`.
- **Kept/changed:** Only clear when the user ID actually changes (not on token refresh), using a `sessionChanged` check.
- **Verification:** Manual testing by switching between two student accounts.

## 19. Credits history UI refactor

- **Timestamp:** approx. 2026-10-13 20:45
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** refactor
- **Files:** `frontend/src/features/credit/credit.presentation.ts`, `frontend/src/features/credit/components/CreditHistory.tsx`, `frontend/src/features/credit/components/CreditTransactionList.tsx`
- **Prompt (approx.):** "Refactor my credit history components. Move labels, descriptions and number/date formatting into one presentation module. Show signed deltas (+50 / −10) highlighted green or red. Make the filter and sort controls compact using our shadcn Select, and merge the pagination into one footer."
- **Key response:** Produced `credit.presentation.ts` (`transactionLabels`, `transactionDescriptions`, `formatCredits`, `formatCreditDelta`, `formatCreditTimestamp`) and simplified versions of both components.
- **Kept/changed:** Simplified timestamps to the local date and time. Kept my existing query wiring unchanged.
- **Verification:** Manual visual testing on desktop and mobile widths.

## 20. Containerising user-service

- **Timestamp:** approx. 2026-10-19 14:00
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `user-service/Dockerfile`, `user-service/compose.yaml`, `user-service/docker-entrypoint.sh`
- **Prompt (approx.):** "Write a multi-stage Dockerfile for a TypeScript Express service using Prisma (node:22-alpine). It should build, then copy only production deps and dist. Add an entrypoint that runs `prisma migrate deploy` before starting, and a compose file with Postgres 17, a healthcheck, and depends_on with service_healthy."
- **Key response:** Produced the Dockerfile, a `set -e` entrypoint and the compose service definitions.
- **Kept/changed:** Added `npm prune --omit=dev` before the runtime stage. Added comments explaining each step. Set the Prisma schema/migrations paths so `prisma migrate deploy` works inside the container.
- **Verification:** `docker compose up` and manual API checks. `docker compose config --quiet`.

## 21. Containerising order-service, credit-service and frontend

- **Timestamp:** approx. 2026-10-21 00:30
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `order-service/Dockerfile`, `order-service/compose.yaml`, `order-service/docker-entrypoint.sh`, `credit-service/Dockerfile`, `credit-service/compose.yaml`, `credit-service/docker-entrypoint.sh`, `frontend/Dockerfile`, `frontend/compose.yaml`, `compose.yaml`
- **Prompt (approx.):** "Apply the same Docker setup as user-service to order-service and credit-service, and prune devDependencies in the runtime image. For the Vite frontend, build with VITE\_\* build args and serve with nginx-unprivileged on 8080. Write a root compose.yaml that includes each service's compose file on one default network."
- **Key response:** Produced the Dockerfiles, entrypoints, per-service compose files and a root compose using `include:`.
- **Kept/changed:** Moved everything to the default network. Added `npm prune --omit=dev`. Fixed TypeScript build errors that only appeared in the container build.
- **Verification:** `docker compose up --build` for all services and manual testing through the frontend.

## 22. Frontend README Docker section

- **Timestamp:** approx. 2026-10-21 01:45
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** docs
- **Files:** `frontend/README.md`
- **Prompt (approx.):** "Write a short README section explaining how to build and run the frontend container, which VITE\_ build args are needed, and how it talks to the backend services."
- **Key response:** Produced a Docker section with build and run commands and an env-variable table.
- **Kept/changed:** Corrected the variable names to match `.env.example`. Trimmed generic Vite boilerplate.
- **Verification:** Followed the README steps on a clean checkout.

## 23. Compose and entrypoint startup fix

- **Timestamp:** approx. 2026-10-22 19:10
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** debug
- **Files:** `compose.yaml`, `user-service/docker-entrypoint.sh`
- **Prompt (approx.):** "When I run `docker compose up` from the root, user-service sometimes starts before Postgres is ready and the migration fails. Here are my compose.yaml and entrypoint. What should I change?"
- **Key response:** Suggested a Postgres healthcheck with `depends_on: condition: service_healthy` and exiting immediately in the entrypoint on failure.
- **Kept/changed:** Applied the healthcheck and depends_on. Added `set -e` and explanatory comments to the entrypoint.
- **Verification:** Repeated `docker compose down && docker compose up`. `docker compose config --quiet`.

## 24. user-service unit tests

- **Timestamp:** approx. 2026-10-25 10:50
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - `user-service/src/libs/tokens.test.ts`
  - `user-service/src/middlewares/auth.middleware.test.ts`
  - `user-service/src/schemas/register.schema.test.ts`
  - `user-service/src/schemas/user.schema.test.ts`
  - `user-service/src/services/auth.service.test.ts`
  - `user-service/src/services/registration.service.test.ts`
  - `user-service/src/services/user.service.test.ts`
  - `user-service/test/setup.ts`
- **Prompt (approx.):** "Write node:test unit tests (run with tsx and --experimental-test-module-mocks) for my user-service. Cover token round-trips and tampered/wrong-key tokens, the authenticate/authorize middleware, the register and user schemas, loginUser/refreshAccessToken (including reuse of a revoked token and rotation), verifyRegistration (expired, lockout, concurrent consumption), and promoteUserToAdmin/changePassword. Mock Prisma with `mock.module`. Also write a setup file that provides deterministic env vars and PEM keys."
- **Key response:** Produced the seven test files and `test/setup.ts`.
- **Kept/changed:** Fixed mocks that didn't match the real Prisma call shapes. Added the concurrent-revocation and concurrent-consumption cases. Removed tests that only re-tested Zod itself.
- **Verification:** `npm test` in `user-service` (all passing); the tests also run in CI.

## 25. CI and AWS deployment pipeline

- **Timestamp:** approx. 2026-10-25 18:10
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `compose.prod.yaml`
- **Prompt (approx.):** "Write GitHub Actions workflows. CI should run backend tests, a credit-service integration job with a Postgres service container, a frontend build, and a Docker build check. Deploy on push to main should call CI first, push service images to ECR, deploy the backend to EC2 over SSH with docker compose (using a compose.prod.yaml override that pulls from ECR), and upload the frontend to S3 and invalidate CloudFront."
- **Key response:** Produced both workflows with the `backend`, `credit-integration`, `frontend`, `docker-build`, `build-push`, `deploy-backend` and `deploy-frontend` jobs, plus the production compose override.
- **Kept/changed:**
  - Used OIDC role credentials instead of long-lived keys.
  - Made the credit integration job non-blocking at first.
  - Bumped checkout and setup-node to v5.
  - Skipped deploy on docs-only changes (`paths-ignore: ["**.md"]`).
- **Verification:** GitHub Actions runs on PRs and on main. Manual check of the deployed site.

## 26. Gateway DNS fix

- **Timestamp:** approx. 2026-10-25 21:35
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** debug
- **Files:** `gateway/nginx.conf`
- **Prompt (approx.):** "After redeploying a backend container on EC2, my nginx gateway returns 502 until I restart nginx. It proxies /api/\* to the service names. Why does that happen and how do I fix it?"
- **Key response:** Explained that nginx resolves upstream hostnames once at startup. Suggested using Docker's resolver (`127.0.0.11`) with a short `valid=` and putting the upstream in a variable so `proxy_pass` resolves it per request.
- **Kept/changed:** Applied `resolver 127.0.0.11 valid=10s ipv6=off` and a `$upstream` variable per location. Added comments explaining why.
- **Verification:** Redeployed a service container without restarting the gateway and confirmed there were no 502s.

## 27. CI runs order-service and credit-service unit tests

- **Timestamp:** approx. 2026-11-05 19:10
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** refactor
- **Files:** `.github/workflows/ci.yml`
- **Prompt (approx.):** "Update my CI backend job so it also runs order-service and credit-service unit tests, and make the credit integration job blocking again. Also, why does `node --test src/**/*.test.ts` miss nested test files?"
- **Key response:** Added the test steps to the matrix. Explained that the unquoted glob is expanded by the shell (without globstar) instead of by node, so it should be quoted.
- **Kept/changed:** Quoted the order-service test glob in its `package.json`. Removed `continue-on-error` from the integration job.
- **Verification:** GitHub Actions run on the PR showing all test jobs passing.

## 28. Documentation audit and refresh

- **Timestamp:** 2026-11-08
- **Tool & model:** Claude Code (Claude Opus 5.5)
- **Mode:** docs
- **Files:** `.env.example`, `ai/usage-log.md`, `README.md`, `frontend/README.md`, `user-service/README.md`, `credit-service/README.md`
- **Prompt:** "can you help me check the repo docs needs any updating, api docs, readmes."
- **Key response:** Audited the root, frontend and service READMEs and the root `.env.example` against the code (routes, schemas, config, Compose files, workflows, gateway). Produced a list of stale and missing items and a commit-by-commit update plan. The order-service and supplier-service findings were handed to their owners instead of being edited.
- **Kept/changed:** _To fill in after review._
- **Verification:** _To fill in after review._

# Detailed AI Usage Log for Amber Tan Junning

## 1. Replicating opening hours for all days of the week in Supplier database

- **Timestamp**: 2026-09-21 21:38
- **Tool & model**: Claude AI (Sonnet 5.5 Medium)
- **Mode:** generate
- **Files:** `supplier-service/prisma/seed.ts`
- **Prompt (approx.):** "I have a CSV file which lists the opening time and closing time for each supplier. When seeding the database using Prisma, the OpeningHours table has to be filled with the supplier's id, opening time and closing time for every day of the week, where each day of the week is a new row in the table. How can this be done?"
- **Key response:** Generated code that created a new row of opening hours for each day of the week, for each supplier present in the CSV file used for seeding. 
- **Kept/changed:** Used Prisma's `upsert` instead of `create` to ensure that no duplicate records are added to the table.
- **Verification:** Prisma database seeding was successful. Data was verified by running `npx prisma studio` to check the rows in the tables.

## 2. Debugging queries not rerunning when state changes

- **Timestamp**: 2026-09-23 16:28
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** `frontend/src/pages/SupplierPage.tsx`
- **Prompt (approx.):** "When I apply a type filter on the frontend, the queries do not rerun and show the updated list of suppliers. Fix this issue."
- **Key response:** Added `searchString` and `typeFilter` to the queryKeys, as the queries rely on these two values.  
- **Kept/changed:** Changes kept as-is.
- **Verification:** Supplier records were updated after search strings and type filters were used.

## 3. Adding filters to session storage in Supplier Page

- **Timestamp**: 2026-09-23 17:35
- **Tool & model**: Claude AI (Opus 5.5 Medium)
- **Mode:** generate
- **Files:** `frontend/src/pages/SupplierPage.tsx`
- **Prompt (approx.):** "How do I add a variable to session storage, so that the page will use existing filters applied upon reload?"
- **Key response:** Generated template code that added variables to sessionStorage. 
- **Kept/changed:** Added `typeFilter` and `searchString` to session storage. 
- **Verification:** Page reloads still apply existing filters when the application was ran on localhost.

## 4. Prisma query for counting associated suppliers for each type

- **Timestamp**: 2026-09-23 23:51
- **Tool & model**: Claude AI (Opus 5.5 Medium)
- **Mode:** generate
- **Files:** `supplier-service/src/services/supplier.type.service.ts`
- **Prompt (approx.):** "In Prisma and PostgreSQL, I have some foreign key relation for suppliers and the type of suppliers. How can I find the number of suppliers associated with a specific type?"
- **Key response:** Generated template code that got each supplier type together with its count using `_count`.
- **Kept/changed:** Changed the template code to use the column names in the supplier database.
- **Verification:** Function returned the expected values when localhost was running and the associated endpoint was tested on Postman.

## 4. Debugging images not rendering on the frontend

- **Timestamp**: 2026-09-24 01:07
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `data/csv/supplier-seed-data.csv`
- **Prompt (approx.):** "I have a few images which are stored on GitHub and in the database table (which stores the seed data in `data/csv/supplier-seed-data.csv`), it stores the link to images on GitHub. However, when the application is run on localhost, there is an error that occurs and an alternative text is shown instead. Why is this so?"
- **Key response:** Explained that for web frameworks like React, the images need to be stored under the `frontend/public` directory so that they can be accessed directly via <app-domain>/<image_path.ext>.
- **Kept/changed:** Moved all images to `frontend/public` and changed the `imageUrl` in the `supplier-seed-data.csv` to reflect the file path of the images, rather than using the Github links.
- **Verification:** Images are now rendered when the application runs on local host.
- **Note:** AI assitance disclosure header was not added for the supplier seed data file, as comments cannot be added to CSV.

## 5. Generating OR condition for supplier filtering 

- **Timestamp**: 2026-10-14 00:29
- **Tool & model**: Claude AI (Opus 5.5 High)
- **Mode:** generate
- **Files:** `order-service/src/services/order.courier.service.ts`
- **Prompt (approx.):** "How do I write an OR condition (in the where clause) for prisma, if a variable is not undefined?"
- **Key response:** Generated template code using a conditional spread and the correct prisma syntax.
- **Kept/changed:** Added column names `deliverSupplierId` and `pickupSupplierId` corresponding to the names of the column in the supplier database. 
- **Verification:** Function returns the expected values when localhost was running and the associated endpoint was tested using Postman.

## 6. Courier order history pagination fix

- **Timestamp**: 2026-10-14 15:34
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `frontend/src/features/order/services/order.courier.service.ts`
- **Prompt (approx.):** "Why does totalPages return undefined when the backend microservice always returns a number?"
- **Key response:** Explained that the returned value was in `data.data` but the frontend was currently reading `data`. 
- **Kept/changed:** Applied fixes to use `response.data.data` in the frontend, when fetching API responses. 
- **Verification:** All test jobs passed, and user testing on localhost was successful. 

## 7. Ensure vertical alignment of fields on the Home Page

- **Timestamp**: 2026-10-14 21:34
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `frontend/src/pages/HomePage.tsx`
- **Prompt (approx.):** "On the frontend, the filter inputs are not aligned vertically. Fix this issue."
- **Key response:** Replaced `space-y-1` with `flex flex-col gap-1` in the Tailwind CSS classes for SupplierSelect, Sort By Select and Sort Order Select.
- **Kept/changed:** Kept fix.
- **Verification:** Browser displays vertically aligned selectors when running the application on localhost.  

## 8. Debug order acceptance

- **Timestamp**: 2026-10-14 23:51
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `frontend/src/pages/HomePage.tsx`
- **Prompt (approx.):** "I'm getting an error 404 on the browser when I try to accept an order. Fix this issue."
- **Key response:** Fixed the returned mutation as `acceptRequest` and used a PUT endpoint to follow the expected HTTP method by the backend.
- **Kept/changed:** Kept fix.
- **Verification:** Functionality works on browser when running on localhost. 

## 9. Fix UI and cancel button not closing dialog

- **Timestamp**: 2026-10-15 12:35
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `frontend/src/features/order/components/StatusUpdateDialog.tsx`
- **Prompt (approx.):** "The cancel button is not closing the dialog. The field label is also taking up the entire row and pushing the selector to the far end. Fix both issues."
- **Key response:** Use the `closeDialog()` function so that the parent component gets the change in the `open` variable, and add a new class in Tailwind to fix the UI.
- **Kept/changed:** Asked Claude to keep the original classes used and add to it, rather than replacing all the classes with new classes. Kept the second attempt.
- **Verification:** Functionality works on browser and UI was fixed when running on localhost. 

## 10. Add optional pagination for fetchAllSuppliers

- **Timestamp**: 2026-10-17 00:03
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** refactor
- **Files:** `supplier-service/src/services/supplier.service.ts`
- **Prompt (approx.):** "When page is not a null value, use pagination, but if it's null, return null for the `page` and `limit` in the pagination fields."
- **Key response:** Used a conditional spread for `take` and `skip` and implemented the specified return values as above.
- **Kept/changed:** Kept changes. 
- **Verification:** The endpoint returned the expected values when queried via Postman. 

## 11. Supplier service API endpoints refactoring

- **Timestamp**: 2026-10-17 01:24
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** refactor, audit
- **Files:** 
  - `frontend/src/features/order/components/SupplierSelect.tsx`
  - `frontend/src/pages/SupplierPage.tsx`
  - `supplier-service/README.md`
- **Prompt (approx.):** "I refactored the Supplier API endpoints. Give me a list of callers and imports that need to be updated."
- **Follow-up Prompt (approx.):** "Have the SupplierPage track the page number, rather than adding the page number in the URL. Check whether all documentations are up-to-date."
- **Key response:** List of callers that need to be changed on the frontend provided. Corrected a wrong type import in `SupplierSelect.tsx`. Suggested changes to be made to the documentation to keep it updated, including updates to API endpoints methods and routes, and fixing roles for API endpoints.
- **Kept/changed:** Asked Claude to minimise the changes made to the SupplierPage (use old functions in favour of creating new functions) and then kept changes as-is. Personally applied changes that need to be made on the frontend and README documentation.
- **Verification:** All refactored endpoints worked when tested via Postman. All documentation suggestions were checked before adding into README.md

## 12. Supplier service containerization

- **Timestamp**: 2026-10-17 23:04
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** refactor
- **Files:** 
  - `supplier-service/Dockerfile`
  - `supplier-service/compose.yaml`
  - `supplier-service/docker-entrypoint.sh`
- **Prompt (approx.):** "Review the Dockerfile I created and add the automatic seeding of the database on container startup. Write code in the existing compose.yaml and docker-entrypoint.sh files added."
- **Key response:** Generated the relevant files and added the `supplier-service` and `supplier-uploads` volume to the compose.yaml file and corrected errors in the Dockerfile. Generated implementation code for seeding the database in `docker-entrypoint.yaml`. Updated the `DATABASE_URL` and `depends_on` fields to the follow new `supplier-postgres` name in the `compose.yaml` file.
- **Kept/changed:** Removed hard-coded `/app/keys/public.pem` to use `${JWT_PUBLIC_KEY_PATH}`. Removed unnecessary commands to keep the Dockerfile as simple as possible. Renamed the supplier database container to `supplier-postgres`.
- **Verification:** The Docker container starts up and runs locally. 

## 13. Ensure atomicity of order status updates

- **Timestamp**: 2026-10-19 21:11
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** refactor
- **Files:** `order-service/src/services/order.courier.service.ts`
- **Prompt (approx.):** "Check if the current code ensures atomicity of status updates"
- **Key response:** Added `version: order.version` to the `where` clause for each Prisma `update` function, and refactored the version update to `{ increment: 1 }`.
- **Kept/changed:** Kept to using Prisma's `update` instead of `updateMany` that was suggested by Claude.
- **Verification:** User testing on browser was successful.

## 14. Add reverse proxy

- **Timestamp**: 2026-10-21 17:41
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** 
  - `frontend/nginx.conf`
  - `frontend/.env.example`
  - `compose.yaml`
  - `credit-service/compose.yaml`
  - `order-service/compose.yaml`
  - `supplier-service/compose.yaml`
  - `user-service/compose.yaml`
- **Prompt (approx.):** "In the existing frontend/nginx.conf file, generate implementation code to setup a reverse proxy, such that all requests and API calls must be made through the proxy. Isolate internal communication for the backend services."
- **Key response:** Generated implementation code for the nginx configuration file and changed the `BASE_URL` variables in `.env.example` to `/api`. Added internal backend Docker networks, one container per database and removed published ports for backend containers.
- **Kept/changed:** Removed unnecessary fields such as `absolute_redirect off` (removed trailing slashes from the location blocks instead). No substantial changes were made, other than the addition of code comments for code readability.
- **Verification:** Tested the application by running Docker locally, and verified that all requests go through the `http://localhost:5173`, rather than the internal backend services' URL.

## 15. Order service documentation

- **Timestamp**: 2026-10-22 21:50
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** audit
- **Files:** `order-service/README.md`
- **Prompt (approx.):** "Check if the paragraph of the `NULL` `publishedAt` meaning an outbox message has yet to be sent to RabbitMQ, as well as the containerization section in the README file are accurate."
- **Key response:** Suggested improvements to the documentation for outbox message,  as well as the addition of specific commands in the containerization section, such as `docker compose up --build order-service`, to start up only the order service, and to add that the Bearer token has to be added to request made to the API endpoints. 
- **Kept/changed:** Personally applied the suggested changes. 
- **Verification:** Checked the accuracy of suggested changes before applying them.

## 16. Unit test cases for supplier service 

- **Timestamp**: 2026-10-28 09:25
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** 
  - `supplier-service/src/services/supplier.service.test.ts`
  - `supplier-service/src/services/supplier.type.service.test.ts`
- **Prompt (approx.):** "Generate boilerplate code for unit test cases for the `fetchActiveSuppliers` and `fetchAllSuppliers` functions, and for functions related to supplier types. Ensure that the mock Prisma object captures the arguments passed into prisma functions and the number of calls made to each function. Also ensure that all possible outputs and errors from each function are covered by a test case."
- **Key response:** `useSharedMockPrisma` was generated based on the existing mock prisma setup and test cases related to the `fetchActiveSuppliers` and `fetchAllSuppliers` functions were generated.
- **Kept/changed:** Reformatted all test cases and added additional assertions to ensure all tests have the same structure: (1) arguments passed into prisma calls, (2) results returned by the function and (3) the number of calls made to each prisma function. Renamed variables for readability. Test cases for `getSuppliersByIdsService` and `getSupplierByIdService` were created based on test cases provided by Claude. 
- **Verification:** `npm run test` shows that all tests in the supplier service were successful.

## 17. Fix supplierTypeSchema accepting invalid strings

- **Timestamp**: 2026-10-28 14:00
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `supplier-service/src/schemas/supplier.type.schema.ts`
- **Prompt (approx.):** "The test case where an empty string is passed into the `supplierTypeSchema` is failing because the schema accepts an empty string. How can I fix this?"
- **Key response:** Explained that the schema did not have a minimum length requirement for the `type` field and that strings with whitespaces only could also be accepted. Suggested to use `z.string().trim().min(1).toUpperCase()`. 
- **Kept/changed:** Applied fixes to use `z.string().trim().min(1).toUpperCase()` instead of `z.string().toUpperCase()`. 
- **Verification:** All test jobs passed.

## 18. Unit test cases for order service 

- **Timestamp**: 2026-10-28 16:12
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** 
  - `order-service/src/services/order.courier.service.test.ts`
  - `order-service/src/schemas/order.courier.schema.test.ts`
- **Prompt (approx.):** "Generate boilerplate code to mock Prisma for the order service and unit test the courier service file. Ensure that the mock Prisma object captures the arguments passed into prisma functions and the number of calls made to each function. Also ensure that all possible outputs and errors from each function are covered by a test case."
- **Key response:** Test cases were generated for the schemas and functions related to courier actions. Functions that were unit-tested include `acceptOpenOrder`, `completePickedUpOrder`, `dropAcceptedOrder`, `getAllOpenOrders`, `getCourierAcceptanceHistory` and `pickUpAcceptedOrder`. 
- **Kept/changed:** Reformatted all test cases and added additional assertions to ensure all tests have the same structure: (1) arguments passed into prisma calls, (2) results returned by the function and (3) the number of calls made to each prisma function. Renamed variables for readability and added reusable constants `VALID_GET_OPEN_ORDERS_INPUT`, `VALID_DEFAULT_COURIER_ACCEPTANCE_INPUT`, `MOCK_ACCEPTED_ORDER`, `MOCK_PICKED_UP_ORDER` and `MOCK_COMPLETED_ORDER`. 
- **Verification:** `npm run test` shows that all tests in the order service were successful.

## 19. Running deployment only on the upstream repository

- **Timestamp**: 2026-10-29 12:17
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `.github/workflows/deploy.yml`
- **Prompt (approx.):** "Why do deployments always fail in the forked repositories, even though they succeed in the upstream repository?"
- **Key response:** Explained that deployments always fail in the forked repositories as they do not have AWS secrets. Suggested creating an if-condition to only run the deployment action when the repository is the upstream repository. I personally added the fix to the `jobs` level, but Claude moved it to the `build-push` level to ensure other jobs still run in the forked repositories. 
- **Kept/changed:** Fixes kept as-is. 
- **Verification:** Github actions for both upstream and forked repositories were successful. 

## 20. Debugging frontend showing stale orders when tabs are switched

- **Timestamp**: 2026-11-03 21:39
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** 
  - `frontend/src/features/order/hooks/useOrderHistory.ts`
  - `frontend/src/features/order/hooks/useAcceptRequest.ts`
  - `frontend/src/features/order/components/RequestActivityDetailsDialog.tsx`
- **Prompt (approx.):** "Fix this bug where status tabs in the order history show the wrong orders. The order status had updated but specific status tabs were still showing the old version of the orders. Both requester and courier details should be shown to admins; add this implementation in the RequestActivityDetailsDialog."
- **Key response:** Added `staleTime: 0` in the `useOrderHistory` hook. Added `invalidateQueries` for `orderQueryKeys.all` to ensure that fresh data is refetched. Controlled the two user-details hooks with `enabled`. Checked for an undefined courier before `isPending` in the dialog.
- **Kept/changed:** Fixes and the minor edits by Claude kept as-is. Applied the changes for invalidating queries to all status hooks.
- **Verification:** Stale orders were no longer shown on the application deployed on localhost, after switching tabs in the order history. Admins can view requester and courier details successfully.

## 21. Fixing optimistic concurrency control for order service

- **Timestamp**: 2026-11-04 14:06
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** 
  - `frontend/src/features/order/hooks/useDropRequest.ts`
  - `order-service/src/services/order.courier.service.test.ts`
- **Prompt (approx.):** "Check the type errors that VSCode is giving in the payload of useDropRequest hook. I'm trying to pass the expected order version from the frontend for optimistic concurrency control."
- **Key response:** Fixed the compilation time errors in the. Also corrected version-mismatch tests in the unit test cases.
- **Kept/changed:** Fixes kept as-is. All hooks related to courier order status updates fixed, with reference to the changes made in useDropRequest.
- **Verification:** Order status updates work as expected when testing the application on localhost.

## 22. Debugging auto-receipt for orders

- **Timestamp**: 2026-11-05 21:16
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** `order-service/src/services/order-receipt.service.ts`
- **Prompt (approx.):** "Why are credits not transferred when the order has already been reflected as AUTO_RECEIVED?"
- **Key response:** Explained that event payload was missing a `courierId` and suggested this one-line fix. 
- **Kept/changed:** Personally added the missing `courierId` field. 
- **Verification:** User testing on localhost and cloud is successful.

## 23. Unit tests for automated order receipt

- **Timestamp**: 2026-11-05 21:41
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** `order-service/src/services/order-receipt.service.test.ts`
- **Prompt (approx.):** "Generate boilerplate code for `order-receipt.service.ts`, while keeping to the convention and structure outlined in `order.courier.service.test.ts`."
- **Key response:** Explained that the returned value was in `data.data` but the frontend was currently reading `data`. 
- **Kept/changed:** Merged two test cases which tested receiving one order and receiving multiple orders separately. Renamed constants for ease of reading. 
- **Verification:** `npm run test` shows all test cases ran successfully.

## 24. Order dashboard date range filter

- **Timestamp**: 2026-11-06 09:51
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** refactor
- **Files:** 
  - `frontend/src/components/ui/date-range.tsx`
  - `frontend/src/features/order/components/AdminOrderDashboardCard.tsx`
  - `order-service/src/schemas/order.schema.ts`
  - `order-service/src/schemas/order.schema.test.ts`
  - `order-service/src/services/order.service.ts`
- **Prompt (approx.):** "The current code has a date-range UI component. Refactor the components such that props can be passed from the parent component. For the related backend function, allow filtering by date range of the `createdAt` column. I also want to be able to filter by an array of statuses. The filters and selectors on the UI are also not aligned vertically, fix this."
- **Key response:** Refactored shadcn's date-range component in `frontend/src/components/ui/date-range.tsx` to allow props to be passed in. Values were added as props and passed in from `AdminOrderDashboardCard.tsx`. In the `WHERE` clause of the Prisma query in `order-service/src/services/order.service.ts`, new lines of code was added to allow orders to be filtered by their date range, as well as by a set of statuses. Schema test cases modified to test the dates and statuses fields. Filters and selectors vertically aligned with the addition of `flex flex-col gap-1` tailwind classes. 
- **Kept/changed:** Rewrote the picker to use `startDate` and `endDate` instead of `DateRange`. 
- **Verification:** All test jobs passed, and user testing on localhost was successful. Functionalities also work on the cloud-deployed application.

## 25. Migration of supplier images from AWS EC2 to S3, while using local storage when running the app locally

- **Timestamp**: 2026-11-08 18:50
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:**
  - `supplier-service/src/controllers/supplier.asset.controller.ts`
  - `supplier-service/src/services/supplier.asset.service.test.ts`
  - `supplier-service/src/services/supplier.asset.service.ts`
  - `supplier-service/src/libs/storage.ts`
  - `supplier-service/src/middleware/upload.middleware.ts`
  - `supplier-service/src/config/config.ts`
  - `supplier-service/README.md`
  - `supplier-service/.env.example`
  - `.github/workflows/ci.yml`
- **Prompt (approx.):** "Create a storage.ts file under libs where there's an interface implemented. If running localhost, there's an attribute in the .env file that will say "local" and the image get and post will just be on some local storage, but if the attribute is "s3" then it will pull and post to AWS S3. The service functions (e.g. uploadImage) will still work the same way since the storage is hidden behind some interace. Place the upload functions into `supplier.asset.service.ts` and remove the `upload.ts` file in the `libs` directory."
- **Follow-up Prompt (approx.):** "Move the multer checking of file size and file extensions into `upload.middleware.ts`. Check if the documentation in README.md is up to date and accurate."
- **Key response:** Generated the code based that fulfilled the above description. A test file `supplier.asset.service.test.ts` was also generated. 
- **Kept/changed:** `requestOrigin` was originally kept, but I removed it as all .env files will have the `ASSETS_PUBLIC_URL` variable set, which would already contain the base URL for image fetching. I also removed `ASSETS_DIR` and `defaultAssetsDir`, which were generated by Claude, as we can directly resolve the file path for local image storage. 
- **Verification:** All test jobs passed, and user testing on localhost was successful. 

## 26. Fix unselected default supplier tab

- **Timestamp**: 2026-11-07 14:54
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** debug
- **Files:** 
  - `frontend/src/pages/SupplierPage.tsx`
  - `frontend/src/pages/ManageSuppliersPage.tsx`
- **Prompt (approx.):** "When the user reloads the SupplierPage and ManageSuppliersPage, the "All" tab should be selected but there is no indication of it being selected on the UI. The data displayed is correct though. Fix this error."
- **Key response:** Changed the default `typeFilter` from `"all"` to `"ALL"`.
- **Kept/changed:** Fix as-is.
- **Verification:** Tab selected on browser on page reload.

## 27. Debugging image upload errors on cloud

- **Timestamp**: 2026-11-08 21:36
- **Tool & model**: Claude Code (Opus 5.5)
- **Mode:** generate
- **Files:** `compose.yaml`
- **Prompt (approx.):** "The logs on AWS show that credentials cannot be loaded from the provider, hence image upload is failing on the cloud-deployed application. The functionality works on localhost. What is causing this error?"
- **Key response:** Suggested to add the supplier-service container to the default network, so that supplier-service has network access to load the AWS credentials and S3.
- **Kept/changed:** Personally applied the one-line fix. Rebuilt the `supplier-service` container to ensure that changes in `.env` has been applied. 
- **Verification:** AUser testing on the cloud-deployed application was successful. 
- **Verification:** All test jobs passed, and user testing on localhost was successful. User testing on cloud was also successful once a small fix (placing `supplier-service` on the default Docker network to allow S3 credentials to be reached) was applied. 


# Detailed AI Usage Log for Ng See Pui

## 1. Date-time picker popover width

- **Timestamp:** approx. 2026-10-12 10:20
- **Tool & model:** ChatGPT (5.6 Luna)
- **Mode:** edit
- **Files:**
  - `frontend/src/features/order/components/DateTimePicker.tsx`
- **Prompt (approx.):** "How do I make the date-time picker popover content width relative to the trigger?"
- **Key response:** Adjusted the popover content width to match or scale relative to the trigger element.
- **Verification:** Reviewed the component styling and tested the date-time picker layout.

## 2. Responsive supplier selector height

- **Timestamp:** approx. 2026-10-12 21:40
- **Tool & model:** ChatGPT (5.6 Luna)
- **Mode:** edit
- **Files:**
  - `frontend/src/features/order/components/SupplierSelect.tsx`
- **Prompt (approx.):** "How do I make the height responsive?"
- **Key response:** Adjusted the supplier selector height to respond appropriately across different screen sizes.
- **Verification:** Reviewed the responsive styling and tested the component layout.

## 3. Redrive scirpts for failing RabbitMQ messages

- **Timestamp:** 2026-10-30 15:47
- **Tool & model:** ChatGPT (5.6 Luna)
- **Mode:** generate
- **Files:**
  - `order-service/src/scripts/redrive-credit-reservation-results.ts`
  - `order-service/src/scripts/redrive-order-outbox.ts`
  - `credit-service/src/scripts/redrive-credit-outbox.ts`
  - `credit-service/src/scripts/redrive-reservation-request.ts`
- **Prompt (approx.):** "Generate the redrive scripts for credit reservation results, credit outbox, order outbox, and reservation request."
- **Key response:** Generated scripts to redrive failed credit reservation results, credit outbox, order outbox, and reservation request events, including validation, retry handling, message republishing, and status updates.
- **Kept/changed:** Reviewed and edited event validation, republishing, retry handling, and status updates.
- **Verification:** Reviewed the scripts and tested the affected redrive workflows.

## 4. Unit tests for order service and credit service

- **Timestamp:** 2026-11-04 09:00
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - `order-service/src/schemas/credit-reservation-result.schema.test.ts`
  - `order-service/src/schemas/order.requester.schema.test.ts`
  - `order-service/src/services/credit-reservation.service.test.ts`
  - `order-service/src/services/order-expiry.service.test.ts`
  - `order-service/src/services/order.requester.service.test.ts`
  - `credit-service/src/schemas/reservation-request-event.schema.test.ts`
  - `credit-service/src/services/reservation-request.service.test.ts`
- **Prompt (approx.):** "Write node:test unit tests (run with tsx and --experimental-test-module-mocks) for my order-service and credit-service. Cover the schemas and services, including the credit reservation flow, order expiry, and order requester. Mock Prisma with `mock.module`."
- **Key response:** Produced the seven test files with boilerplate and specific test cases for the schemas and services, including credit reservation, order expiry, and order requester.
- **Kept/changed:** Fixed mocks that didn't match the real Prisma call shapes. Added additional test cases for edge cases and error handling.
- **Verification:** `npm test` in `order-service` and `credit-service` (all passing); the tests also run in CI.

## 5. Refactor RabbitMQ functionality

- **Timestamp:** 2026-11-05 13:00
- **Tool & model:** ChatGPT (5.6 Luna)
- **Mode:** refactor
- **Files:**
  - `user-service/src/libs/rabbitmq.ts`
  - `order-service/src/libs/rabbitmq.ts`
  - `credit-service/src/libs/rabbitmq.ts`
- **Prompt (approx.):** "Refactor RabbitMQ such that the functions are reusable."
- **Key response:** Refactored RabbitMQ connection, channel, publishing, consuming, and retry-related functions into reusable utilities.
- **Kept/changed:** Preserved existing messaging behavior while reducing duplication and improving reuse across credit-service workflows.
- **Verification:** Reviewed the refactored implementation and tested the affected RabbitMQ workflows.

## 6. Backend notification service

- **Timestamp:** 2026-11-09 01:00
- **Tool & model:** ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
- **Mode:** generate
- **Files:**
  - `notification-service/src/controllers/notification.controller.ts`
  - `notification-service/src/schemas/notification.schema.ts`
  - `notification-service/src/schemas/order-status-event.schema.ts`
  - `notification-service/src/services/notification.service.ts`
  - `notification-service/src/services/notification-rules.ts`
  - `notification-service/sse/hub.ts`
- **Prompt (approx.):** "Generate a notification service that listens to order status events and sends notifications to users based on their preferences. Include SSE support for real-time updates."
- **Key response:** Generated the notification service with controllers, schemas, services, and SSE hub for real-time notifications. Implemented order status event handling and user preference-based notification rules.
- **Kept/changed:** Preserved the existing order status event flow while adding notification logic and SSE support. Added comments for clarity.
- **Verification:** Reviewed the implementation and tested the notification service with simulated order status events and user preferences using a local frontend client.

## 7. Frontend SSE integration for notification service

- **Timestamp:** 2026-11-09 03:00
- **Tool & model:** ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
- **Mode:** generate
- **Files:**
  - `frontend/src/contexts/NotificationProvider.tsx`
  - `frontend/src/features/notification/services/sse.ts`
- **Prompt (approx.):** "Generate the frontend notification service, including notification state management using react provider and Server-Sent Events handling."
- **Key response:** Produced the notification provider and SSE client for real-time notification delivery.
- **Kept/changed:**  Reviewed and edited connection handling, reconnection behavior, unread state updates, read-state synchronization, and notification state management.
- **Verification:**  Tested the frontend notification service with the backend notification service and verified real-time updates, state management, and SSE reconnection behavior.

## 8. Unit tests for notification service

- **Timestamp:** 2026-11-09 15:00
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - `notification-service/src/schemas/notification.schema.test.ts`
  - `notification-service/src/schemas/order-status-event.schema.test.ts`
  - `notification-service/src/services/notification.service.test.ts`
  - `notification-service/src/services/notification-rules.test.ts`
- **Prompt (approx.):** "Write node:test unit tests (run with tsx and --experimental-test-module-mocks) for my notification-service. Cover the schemas and services, including order status event handling and notification rules. Mock Prisma with `mock.module`."
- **Key response:** Produced the four test files with boilerplate and specific test cases for the schemas and services, including order status event handling and notification rules.
- **Kept/changed:**  Reviewed and edited test cases to match the service logic and expected notification outcomes.
- **Verification:** `npm test` in `notification-service` (all passing); the tests also run in CI.

## 9. Redrive order status events script

- **Timestamp:** 2026-11-10 10:30 
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** generate
- **Files:**
  - `notification-service/src/scripts/redrive-order-status-events.ts`
- **Prompt (approx.):** "Generate the redrive scripts for order status events."
- **Key response:** Generated scripts to redrive failed order status events, including validation, retry handling, message republishing, and status updates.
- **Kept/changed:** Reviewed and edited event validation, republishing, retry handling, and status updates.
- **Verification:** Reviewed the scripts and tested the affected redrive workflows.

## 10. Verify and edit errors for notification service README

- **Timestamp:** 2026-11-10 12:00
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** audit
- **Files:**
  - `notification-service/README.md`
- **Prompt (approx.):** "Verify and edit errors for notification service README."
- **Key response:** Reviewed the README for accuracy, clarity, and completeness. Suggested edits for grammar, formatting, and technical details.
- **Kept/changed:** Applied suggested edits to improve readability and accuracy of the README.
- **Verification:** Reviewed the updated README for clarity and correctness.

## 11. Check and verify all notification service Dockerfiles and compose files

- **Timestamp:** 2026-11-10 14:00
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** audit
- **Files:**
  - `notification-service/Dockerfile`
  - `notification-service/compose.yaml`
  - `notification-service/docker-entrypoint.sh`
  - `compose.yaml`
  - `compose.prod.yaml`
  - `gateway/nginx.conf`
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`
- **Prompt (approx.):** "Check and verify all notification service Dockerfiles and compose files.
- **Key response:** Reviewed the Docker configuration for correctness and consistency with the notification service.
- **Kept/changed:** Nothing changed; verified that the Dockerfiles and compose files are correct and consistent.
- **Verification:** Compared the Docker files against the notification service setup and runtime requirements.

## 12. README documentation verification

- **Timestamp:** 2026-11-10 18:41
- **Tool & model:** ChatGPT (Astra 6)
- **Mode:** review/edit
- **Files:**
  - `README.md`
  - `supplier-service/README.md`
  - `notification-service/README.md`
  - `order-service/README.md`
  - `credit-service/README.md`
  - `user-service/README.md`
- **Prompt (approx.):** "Review all README files and ensure their content matches the implementation."
- **Key response:** Compared the README documentation against service source code, routes, package scripts, Docker Compose files, gateway configuration, and deployment workflows.
- **Kept/changed:** Identified documentation inconsistencies involving service counts, ports, RabbitMQ consumers, environment setup, ECR repositories, and incorrect worker descriptions.
- **Verification:** Cross-checked documented behavior against the implemented services and configuration files.


# Detailed AI Usage Log for Duong Ngoc Mai

## 1. Centralized logging (pino, Loki, Alloy, Grafana)

- **Timestamp:** 2026-11-10
- **Tool & model:** Claude Code (Claude Sonnet 5.5)
- **Mode:** generate, refactor
- **Files:**
  - `*/src/libs/logger.ts`, `*/src/middleware(s)/request-logger.middleware.ts` (all five services)
  - `*/src/index.ts`, `*/src/middleware(s)/error.middleware.ts`, `*/src/middleware/*auth.middleware.ts`, and the ~145 `console.*` calls replaced across the services
  - `order-service/src/integrations/supplier/supplier.client.ts`, `gateway/nginx.conf`, `frontend/nginx.conf`
  - `observability/` (Loki, Alloy, Grafana provisioning and dashboard), `compose.yaml`, `compose.prod.yaml`, `.github/workflows/deploy.yml`, `.env.example`, `README.md`
  - `docs/centralized-logging.png`, `package.json` files (pino dependencies)
- **Prompt (approx.):** "i want to implement centralized logging, basically a prettier, comprehensive logging system that i can also see in Docker. TA recommends Grafana or use some services on AWS. what do you think i should take as the direction?" then "plan out how you going to implement while keeping the codebase modular, clean, correct first."
- **Key response:** Recommended pino JSON logs to Loki and Grafana over CloudWatch, then implemented it in phases: logger and request middleware, request IDs from nginx, the observability stack, and the deploy changes. Also removed logging of tokens and user emails, drafted the PR description, and wrote the Grafana access steps.
- **Kept/changed:** RabbitMQ event tracing was left out by decision. Work was paused after phase 1 for review. _Author to add any later edits._
- **Verification:** `tsc` and unit tests pass in all five services; the stack was run locally with Docker; `nginx -t` and `docker compose config` were checked; the deploy workflow succeeded on `main`. _Author review pending._