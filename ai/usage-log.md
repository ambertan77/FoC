# AI Usage Log

1. Lim Shao Qi
   > Logged on 2026-11-08 for work done 2026-09-25 to 2026-11-05; dates and prompts are approximate.

Tool for entries 1–27: **ChatGPT (Astra 6)**. Tool for entry 28: **Claude Code (Claude Opus 5.5)**. Every AI output was reviewed, edited and tested by Lim Shao Qi before it was committed.

2.

3.

4.

---

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
- **Files:** `.env.example`, `ai/usage-log.md`, `README.md`, `frontend/README.md`, `user-service/README.md`
- **Prompt:** "can you help me check the repo docs needs any updating, api docs, readmes."
- **Key response:** Audited the root, frontend and service READMEs and the root `.env.example` against the code (routes, schemas, config, Compose files, workflows, gateway). Produced a list of stale and missing items and a commit-by-commit update plan. The order-service and supplier-service findings were handed to their owners instead of being edited.
- **Kept/changed:** _To fill in after review._
- **Verification:** _To fill in after review._
