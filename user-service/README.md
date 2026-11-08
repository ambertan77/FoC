<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-08
Scope: Audited against the code; rewrote the API reference to match the current routes, request schemas, response shapes and error codes.
Author review: Reviewed and edited by Lim Shao Qi.
-->

# User Service

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Credit provisioning outbox](#credit-provisioning-outbox)
- [Security](#security)
- [Docker (local demo)](#docker-local-demo)
- [Acknowledgements](#acknowledgements)

## About

The User Service is responsible for user account management, authentication, authorization, and JWT token management for **Aaron**.

It manages user accounts and provides authentication services to the other microservices in the system.

## Features

### Authentication & Authorization

- User registration and login
- JWT-based authentication
- RS256 access tokens
- Refresh token rotation
- Refresh token revocation
- HttpOnly refresh token cookies
- Role-based access control
- Protected user and admin endpoints

### User Management

- User account management
- User profile management

### Security & Validation

- Password hashing and verification using Argon2
- Case-sensitive password verification
- Case-insensitive email matching
- Request validation using Zod
- Centralized error handling

## Tech Stack

Technology    | Purpose
------------- | -----------------------------
Node.js       | Runtime environment
TypeScript    | Programming language
Express       | Backend web framework
Prisma        | ORM and database access
PostgreSQL    | Relational database
Zod           | Request validation
JWT           | Authentication tokens
Argon2        | Password hashing
Cookie Parser | Cookie handling
CORS          | Cross-origin resource sharing
Nodemailer    | Email sending
Docker        | Containerization

## Architecture

### Overview Architecture Diagram

The User Service is one of the backend microservices in Aaron.

```text
┌──────────────────────┐
│      Frontend        │
│   React + TypeScript │
└──────────┬───────────┘
           │
           │ REST API
           ▼
┌──────────────────────────────────────────────┐
│           User Service                       │
│                                              │
│  ┌──────────────┐  ┌──────────────┐          │
│  │    Routes    │→ │ Controllers  │          │
│  └──────────────┘  └──────┬───────┘          │
│                           │                  │
│                    ┌──────▼───────┐          │
│                    │   Services   │          │
│                    └──────┬───────┘          │
│                           │                  │
│              ┌────────────┴───────┐          │
│              │                    │          │
│       ┌──────▼─────────┐    ┌─────▼────────┐ │
│       │ Authentication │    │  Auth & User │ │
│       │ & Authorization│    │  Management  │ │
│       └──────┬─────────┘    └─────┬────────┘ │
│              │                    │          │
│       ┌──────▼────────┐           │          │
│       │ JWT / Refresh │           │          │
│       │ Token Logic   │           │          │
│       └───────────────┘           │          │
│                                   │          │
│                         ┌─────────▼────┐     │
│                         │ Prisma ORM   │     │
│                         └───────┬──────┘     │
└─────────────────────────────────┼────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   PostgreSQL    │
                         │   users         │
                         └─────────────────┘
```

### Authentication

The User Service issues access and refresh tokens.

- **Access tokens** use RS256 and are signed using the User Service's private key.
- Other microservices verify access tokens using the corresponding public key.
- **Refresh tokens** are managed only by the User Service.
- Refresh tokens are stored in the database as Argon2 hashes.
- Refresh tokens are rotated after successful use.

### Database

- PostgreSQL database
- Prisma ORM for database management

The User Service has its own PostgreSQL database.

```text
User Service
    │
    ▼
  PostgreSQL
    │
    ├── User
    │
    ├── RefreshToken
    │
    ├── OutboxEvent
    │
    ├── PendingRegistration
    │
    ├── RegistrationOtpRequest
    │
    ├── AdminInvitation
    │
    ├── PendingEmailChange
    │
    └── EmailChangeOtpRequest

```

Alongside these tables, enums `Role` and `BootstrapState` are created.

Other microservices do not directly access the User Service database. Cross-service references use the user's user id.

## Project Structure

```text
user-service/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── errors/
│   ├── libs/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   ├── types/
│   └── index.ts
│
├── keys/
├── .env
├── .env.example
├── .gitignore
|── AGENTS.md
|── Dockerfile
|── package-lock.json
├── package.json
├── prisma.config.ts
|── README.md
└── tsconfig.json
```

## API Reference

All endpoints are served under `/api` through the gateway (see the
[root README](../README.md#services-and-api)). Request bodies are JSON.
Most bodies are validated with strict schemas, so unknown fields are
rejected with `400`. Login is the exception. A validation error returns
`400` with the first issue's message.

Authenticated endpoints need an access token:

```http
Authorization: Bearer <access-token>
```

### Authentication

Method | Endpoint                        | Access         | Description
------ | ------------------------------- | -------------- | -------------------------------------------------
`POST` | `/api/auth/register`            | Public         | Start student registration and email an OTP
`POST` | `/api/auth/register/resend`     | Public         | Resend the registration OTP
`POST` | `/api/auth/register/verify`     | Public         | Verify the OTP and create the student account
`POST` | `/api/auth/admin-activation`    | Public         | Create an admin account from an invitation token
`POST` | `/api/auth/login`               | Public         | Log in and receive tokens
`POST` | `/api/auth/refresh`             | Refresh cookie | Rotate the refresh token and get a new access token
`POST` | `/api/auth/logout`              | Refresh cookie | Revoke the refresh token and clear the cookie

### Users

Method  | Endpoint                               | Access        | Description
------- | -------------------------------------- | ------------- | ------------------------------------------------
`GET`   | `/api/users/me`                        | Authenticated | Get my profile and any pending email change
`PATCH` | `/api/users/me`                        | Authenticated | Update my username and/or phone number
`POST`  | `/api/users/me/email-change`           | Authenticated | Start an email change and send an OTP to the new address
`POST`  | `/api/users/me/email-change/resend`    | Authenticated | Resend the email-change OTP
`POST`  | `/api/users/me/email-change/verify`    | Authenticated | Verify the OTP and apply the new email
`POST`  | `/api/users/me/password-change`        | Authenticated | Change my password
`GET`   | `/api/users`                           | Admin         | List and search users
`POST`  | `/api/users/admin-invitations`         | Admin         | Email an admin invitation link
`PATCH` | `/api/users/:userId/role`              | Admin         | Promote a student to admin
`GET`   | `/api/users/:userId`                   | Authenticated | Get another user's contact details

### Health

Method | Endpoint   | Access | Description
------ | ---------- | ------ | ------------------------------------------------------------
`GET`  | `/healthz` | Public | Liveness check on the service port (not routed by the gateway)

### User object

Endpoints that return a user use this shape:

```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "student@example.com",
    "username": "student123",
    "phoneNumber": "+6591234567",
    "role": "STUDENT"
}
```

Phone numbers are stored and returned as `+65XXXXXXXX`. Requests may send
`91234567` or `+65 9123 4567`. Spaces and dashes are removed, and the
number must be an 8-digit Singapore mobile number starting with 8 or 9.

--------------------------------------------------------------------------------

### `POST /api/auth/register`

Validates the details, stores a pending registration and emails a 6-digit
OTP. **No account is created yet.** Call
[`/register/verify`](#post-apiauthregisterverify) with the OTP to create
it.

#### Request Body

```json
{
    "username": "student123",
    "email": "student@example.com",
    "phoneNumber": "91234567",
    "password": "Password123!"
}
```

- `username`: 3–30 letters and numbers.
- `email` is trimmed and lower-cased.
- `password`: at least 8 characters, with an uppercase letter, a lowercase
  letter, a number and a special character.

#### Successful Response (`202`)

```json
{
    "success": true,
    "data": {
        "challengeId": "7d9f4b1e-2c3a-4f5b-9e8d-1a2b3c4d5e6f",
        "expiresAt": "2026-11-08T10:10:00.000Z"
    }
}
```

#### Possible Responses

Status | Code                         | Description
------ | ---------------------------- | ----------------------------------------------
`202`  |                              | OTP sent
`400`  | `BAD_REQUEST`                | Invalid request data
`409`  | `EMAIL_ALREADY_REGISTERED`   | Email already has an account
`409`  | `USERNAME_TAKEN`             | Username already taken
`409`  | `PHONE_NUMBER_TAKEN`         | Phone number already registered
`429`  | `OTP_REQUEST_LIMIT_EXCEEDED` | Too many OTP requests for this email in the last hour
`502`  | `EMAIL_DELIVERY_FAILED`      | The OTP email could not be sent
`503`  | `EMAIL_NOT_CONFIGURED`       | SMTP settings are missing

--------------------------------------------------------------------------------

### `POST /api/auth/register/resend`

Sends a new OTP for an active registration. Any previous code stops
working.

#### Request Body

```json
{ "challengeId": "7d9f4b1e-2c3a-4f5b-9e8d-1a2b3c4d5e6f" }
```

#### Successful Response (`202`)

Same shape as `/register`: `data: { challengeId, expiresAt }`.

#### Possible Responses

Status | Code                         | Description
------ | ---------------------------- | ---------------------------------------------
`202`  |                              | OTP resent
`400`  | `BAD_REQUEST`                | Invalid challenge ID
`409`  | `REGISTRATION_NOT_ACTIVE`    | No active registration for this challenge
`409`  | `EMAIL_ALREADY_REGISTERED`, `USERNAME_TAKEN`, `PHONE_NUMBER_TAKEN` | Details were taken since registration started
`429`  | `OTP_REQUEST_LIMIT_EXCEEDED` | Too many OTP requests in the last hour
`502`  | `EMAIL_DELIVERY_FAILED`      | The OTP email could not be sent
`503`  | `EMAIL_NOT_CONFIGURED`       | SMTP settings are missing

--------------------------------------------------------------------------------

### `POST /api/auth/register/verify`

Checks the OTP. In one transaction, it creates the `STUDENT` account and
a `USER_REGISTERED` outbox event, which credit-service uses to grant the
initial credits (see [Credit provisioning outbox](#credit-provisioning-outbox)).
The user then logs in normally.

#### Request Body

```json
{
    "challengeId": "7d9f4b1e-2c3a-4f5b-9e8d-1a2b3c4d5e6f",
    "otp": "123456"
}
```

#### Successful Response (`201`)

```json
{
    "success": true,
    "data": {
        "user": { "id": "…", "email": "student@example.com", "username": "student123", "phoneNumber": "+6591234567", "role": "STUDENT" }
    }
}
```

#### Possible Responses

Status | Code                      | Description
------ | ------------------------- | --------------------------------------------------
`201`  |                           | Account created
`400`  | `BAD_REQUEST`             | Invalid challenge ID or OTP format
`400`  | `INVALID_OTP`             | Wrong code (counts towards the attempt limit)
`409`  | `REGISTRATION_NOT_ACTIVE` | No active registration for this challenge
`409`  | `OTP_NO_LONGER_VALID`     | The code was replaced or used by a concurrent request
`409`  | `REGISTRATION_CONFLICT`   | Email, username or phone was taken in the meantime
`410`  | `OTP_EXPIRED`             | The code has expired
`429`  | `OTP_ATTEMPTS_EXCEEDED`   | Too many wrong attempts. Request a new code

--------------------------------------------------------------------------------

### `POST /api/auth/admin-activation`

Creates an `ADMIN` account from an invitation. The invitation email
links to `${FRONTEND_URL}/activate-admin#token=<token>`, and the frontend
sends that token here. The invited email becomes the account email. The
new admin then logs in normally.

#### Request Body

```json
{
    "token": "<43-character base64url token>",
    "username": "admin01",
    "phoneNumber": "91234567",
    "password": "Password123!"
}
```

#### Successful Response (`201`)

```json
{
    "success": true,
    "message": "Administrator account activated successfully.",
    "data": { "user": { "id": "…", "role": "ADMIN", "…": "…" } }
}
```

#### Possible Responses

Status | Code                               | Description
------ | ---------------------------------- | ---------------------------------------------
`201`  |                                    | Admin account created
`400`  | `BAD_REQUEST`                      | Invalid request data
`400`  | `ADMIN_ACTIVATION_INVALID`         | Unknown, already used or replaced invitation link
`409`  | `ADMIN_ACTIVATION_NO_LONGER_VALID` | The link was used by a concurrent request
`409`  | `EMAIL_ALREADY_REGISTERED`, `USERNAME_TAKEN`, `PHONE_NUMBER_TAKEN` | Details already in use
`409`  | `ADMIN_ACTIVATION_CONFLICT`        | Details were taken while activating
`410`  | `ADMIN_ACTIVATION_EXPIRED`         | Invitation has expired

--------------------------------------------------------------------------------

### `POST /api/auth/login`

Authenticates a user. Returns an access token in the body and sets the
refresh token as an HTTP-only cookie.

#### Request Body

```json
{
    "email": "student@example.com",
    "password": "Password123!"
}
```

#### Successful Response (`200`)

```json
{
    "success": true,
    "message": "Login successfully",
    "data": {
        "accessToken": "<access-token>",
        "user": { "id": "…", "email": "student@example.com", "username": "student123", "phoneNumber": "+6591234567", "role": "STUDENT" }
    }
}
```

#### Possible Responses

Status | Code                  | Description
------ | --------------------- | ----------------------------------
`200`  |                       | Logged in
`400`  | `BAD_REQUEST`         | Invalid request data
`401`  | `INVALID_CREDENTIALS` | Invalid email or password provided

--------------------------------------------------------------------------------

### `POST /api/auth/refresh`

Reads the signed `refreshToken` cookie. It rotates the token (revoking
the old one and setting a new cookie) and returns a new access token. No
request body is needed. The browser must send cookies
(`withCredentials`).

#### Successful Response (`200`)

```json
{
    "success": true,
    "message": "Token refreshed successfully",
    "data": {
        "accessToken": "<new-access-token>",
        "user": { "id": "…", "…": "…" }
    }
}
```

#### Possible Responses

Status | Code           | Description
------ | -------------- | ------------------------------------------------------
`200`  |                | Token refreshed
`401`  | `UNAUTHORIZED` | Cookie missing, invalid, expired, revoked or reused. The cookie is cleared

--------------------------------------------------------------------------------

### `POST /api/auth/logout`

Clears the refresh cookie and revokes the refresh token if one was sent.
Always returns `200`, even with no cookie or an invalid one.

#### Successful Response (`200`)

```json
{
    "success": true,
    "message": "Logged out successfully"
}
```

--------------------------------------------------------------------------------

### `GET /api/users/me`

Returns the current user and any email change waiting for OTP
verification.

#### Successful Response (`200`)

```json
{
    "success": true,
    "data": {
        "user": { "id": "…", "email": "student@example.com", "username": "student123", "phoneNumber": "+6591234567", "role": "STUDENT" },
        "pendingEmailChange": {
            "challengeId": "…",
            "newEmail": "new@example.com",
            "expiresAt": "2026-11-08T10:10:00.000Z"
        }
    }
}
```

`pendingEmailChange` is `null` when there is none.

#### Possible Responses

Status | Code                                            | Description
------ | ----------------------------------------------- | -----------------------
`200`  |                                                 | Profile returned
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`404`  | `USER_NOT_FOUND`                                | Account no longer exists

--------------------------------------------------------------------------------

### `PATCH /api/users/me`

Updates the current user's username, phone number or both. At least one
field is required. To change the email or password, use the dedicated
endpoints below.

#### Request Body

```json
{
    "username": "newUsername",
    "phoneNumber": "98765432"
}
```

#### Successful Response (`200`)

```json
{
    "success": true,
    "data": { "user": { "id": "…", "username": "newUsername", "phoneNumber": "+6598765432", "…": "…" } }
}
```

#### Possible Responses

Status | Code                 | Description
------ | -------------------- | --------------------------------------------
`200`  |                      | Profile updated
`400`  | `BAD_REQUEST`        | Invalid data, or no field provided
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`404`  | `USER_NOT_FOUND`     | Account no longer exists
`409`  | `USERNAME_TAKEN`     | Username already taken
`409`  | `PHONE_NUMBER_TAKEN` | Phone number already registered
`409`  | `PROFILE_CONFLICT`   | A value was taken while saving

--------------------------------------------------------------------------------

### `POST /api/users/me/email-change`

Emails a 6-digit OTP to the **new** address. The email isn't changed
until the OTP is verified.

#### Request Body

```json
{ "email": "new@example.com" }
```

#### Successful Response (`202`)

```json
{
    "success": true,
    "data": { "challengeId": "…", "expiresAt": "2026-11-08T10:10:00.000Z" }
}
```

#### Possible Responses

Status | Code                         | Description
------ | ---------------------------- | ---------------------------------------------
`202`  |                              | OTP sent to the new address
`400`  | `BAD_REQUEST`                | Invalid email
`400`  | `EMAIL_UNCHANGED`            | New email is the same as the current one
`404`  | `USER_NOT_FOUND`             | Account no longer exists
`409`  | `EMAIL_ALREADY_REGISTERED`   | Another account uses this email
`429`  | `OTP_REQUEST_LIMIT_EXCEEDED` | Too many OTP requests in the last hour
`502`  | `EMAIL_DELIVERY_FAILED`      | The OTP email could not be sent
`503`  | `EMAIL_NOT_CONFIGURED`       | SMTP settings are missing

--------------------------------------------------------------------------------

### `POST /api/users/me/email-change/resend`

Sends a new OTP for the current user's pending email change.

#### Request Body

```json
{ "challengeId": "…" }
```

#### Successful Response (`202`)

Same shape as `/me/email-change`.

#### Possible Responses

Status | Code                         | Description
------ | ---------------------------- | ---------------------------------------------
`202`  |                              | OTP resent
`400`  | `BAD_REQUEST`                | Invalid challenge ID
`409`  | `EMAIL_CHANGE_NOT_ACTIVE`    | No active email change for this challenge
`409`  | `EMAIL_ALREADY_REGISTERED`   | The new email was taken in the meantime
`429`  | `OTP_REQUEST_LIMIT_EXCEEDED` | Too many OTP requests in the last hour
`502`  | `EMAIL_DELIVERY_FAILED`      | The OTP email could not be sent
`503`  | `EMAIL_NOT_CONFIGURED`       | SMTP settings are missing

--------------------------------------------------------------------------------

### `POST /api/users/me/email-change/verify`

Checks the OTP and switches the account to the new email.

#### Request Body

```json
{
    "challengeId": "…",
    "otp": "123456"
}
```

#### Successful Response (`200`)

```json
{
    "success": true,
    "data": { "user": { "id": "…", "email": "new@example.com", "…": "…" } }
}
```

#### Possible Responses

Status | Code                       | Description
------ | -------------------------- | --------------------------------------------------
`200`  |                            | Email changed
`400`  | `BAD_REQUEST`              | Invalid challenge ID or OTP format
`400`  | `INVALID_OTP`              | Wrong code (counts towards the attempt limit)
`404`  | `USER_NOT_FOUND`           | Account no longer exists
`409`  | `EMAIL_CHANGE_NOT_ACTIVE`  | No active email change for this challenge
`409`  | `OTP_NO_LONGER_VALID`      | The code was replaced or used by a concurrent request
`409`  | `EMAIL_ALREADY_REGISTERED` | The new email was taken in the meantime
`410`  | `OTP_EXPIRED`              | The code has expired
`429`  | `OTP_ATTEMPTS_EXCEEDED`    | Too many wrong attempts. Request a new code

--------------------------------------------------------------------------------

### `POST /api/users/me/password-change`

Changes the password and **revokes every refresh token for the user**, so
all other sessions are signed out. A fresh refresh cookie is set for the
current session.

#### Request Body

```json
{
    "currentPassword": "Password123!",
    "newPassword": "NewPassword456!"
}
```

`newPassword` follows the same rules as registration.

#### Successful Response (`200`)

```json
{
    "success": true,
    "message": "Password changed successfully."
}
```

#### Possible Responses

Status | Code                       | Description
------ | -------------------------- | ------------------------------------
`200`  |                            | Password changed
`400`  | `BAD_REQUEST`              | Invalid request data
`400`  | `PASSWORD_UNCHANGED`       | New password is the same as the current one
`401`  | `INVALID_CURRENT_PASSWORD` | Current password is wrong
`404`  | `USER_NOT_FOUND`           | Account no longer exists

--------------------------------------------------------------------------------

### `GET /api/users`

Lists users for the admin user-management page, oldest first.

#### Query Parameters

```text
?page=1&pageSize=20&search=john&role=STUDENT
```

Parameter  | Type   | Default | Description
---------- | ------ | ------- | ---------------------------------------------------------
`page`     | number | `1`     | Page number, at least 1
`pageSize` | number | `20`    | Users per page, between 1 and 100
`search`   | string |         | Case-insensitive match on username or email (max 100 chars)
`role`     | string |         | `STUDENT` or `ADMIN`

Unknown query parameters are rejected with `400`.

#### Successful Response (`200`)

```json
{
    "success": true,
    "data": {
        "users": [ { "id": "…", "email": "…", "username": "…", "phoneNumber": "+65…", "role": "STUDENT" } ],
        "page": 1,
        "pageSize": 20,
        "total": 25
    }
}
```

#### Possible Responses

Status | Code          | Description
------ | ------------- | --------------------------------------------------
`200`  |               | Users returned
`400`  | `BAD_REQUEST` | Invalid query parameters
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`403`  | `FORBIDDEN`   | Caller is not an admin

--------------------------------------------------------------------------------

### `POST /api/users/admin-invitations`

Emails an invitation link to a new admin. The link expires after **24
hours**, and the same email can be re-invited after **60 seconds**. A new
invitation replaces any earlier one for that email.

#### Request Body

```json
{ "email": "new-admin@example.com" }
```

#### Successful Response (`202`)

```json
{
    "success": true,
    "message": "Administrator invitation sent."
}
```

#### Possible Responses

Status | Code                        | Description
------ | --------------------------- | -------------------------------------
`202`  |                             | Invitation sent
`400`  | `BAD_REQUEST`               | Invalid email
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`403`  | `FORBIDDEN`                 | Caller is not an admin
`409`  | `EMAIL_ALREADY_REGISTERED`  | Email already has an account
`429`  | `ADMIN_INVITATION_COOLDOWN` | Invitation sent less than 60 seconds ago
`502`  | `EMAIL_DELIVERY_FAILED`     | The invitation email could not be sent
`503`  | `EMAIL_NOT_CONFIGURED`      | SMTP settings are missing

--------------------------------------------------------------------------------

### `PATCH /api/users/:userId/role`

Promotes a student to admin. Demotion is not supported. The only
accepted value is `ADMIN`.

#### Path Parameters

Parameter | Type | Description
--------- | ---- | -------------------------
`userId`  | UUID | ID of the user to promote

#### Request Body

```json
{ "role": "ADMIN" }
```

#### Successful Response (`200`)

```json
{
    "success": true,
    "data": { "user": { "id": "…", "role": "ADMIN", "…": "…" } }
}
```

#### Possible Responses

Status | Code                   | Description
------ | ---------------------- | ------------------------------------
`200`  |                        | User promoted
`400`  | `BAD_REQUEST`          | Invalid user ID or role
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`403`  | `FORBIDDEN`            | Caller is not an admin
`404`  | `USER_NOT_FOUND`       | No such user
`409`  | `USER_ALREADY_ADMIN`   | User is already an admin
`409`  | `ROLE_UPDATE_CONFLICT` | The role changed while promoting

--------------------------------------------------------------------------------

### `GET /api/users/:userId`

Returns another user's contact details. The frontend uses it to show the
requester's or courier's details on an order.

> **Note:** any authenticated user can call this for any `userId`.
> Access is not limited to users who share an order with the caller.

#### Successful Response (`200`)

This response uses a different shape from the [user object](#user-object):
`userId` instead of `id`, no `role`, and a `message` field.

```json
{
    "success": true,
    "message": "User fetched successfully",
    "data": {
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "username": "student123",
        "email": "student@example.com",
        "phoneNumber": "+6591234567"
    }
}
```

#### Possible Responses

Status | Code             | Description
------ | ---------------- | ------------------------
`200`  |                  | User returned
`401`  | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN` | Missing or invalid token
`404`  | `USER_NOT_FOUND` | No such user

--------------------------------------------------------------------------------

### Error Response Format

All API errors follow the same response format:

```json
{
    "success": false,
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource"
}
```

Common error codes include:

Code                    | HTTP Status | Description
----------------------- | ----------: | ----------------------------------
`BAD_REQUEST`           |       `400` | Invalid request
`UNAUTHORIZED`          |       `401` | Authentication required or invalid
`FORBIDDEN`             |       `403` | Insufficient permissions
`NOT_FOUND`             |       `404` | Resource not found
`CONFLICT`              |       `409` | Resource already exists
`INTERNAL_SERVER_ERROR` |       `500` | Unexpected server error

## Getting Started

### Prerequisites

Make sure the following are installed:

- Node.js compatible with the project’s installed Prisma version.
- npm.
- PostgreSQL.
- Docker Desktop or another Docker Engine for local RabbitMQ.

### Environment Variables

Create a `.env` file in the root of the User Service and fill in the required environment variables. You can use the provided `.env.example` as a template.

Variable                | Description
----------------------- | ------------------------------------------------------
`PORT`                  | Port used by the User Service
`NODE_ENV`              | Node environment (development, production, etc.)
`FRONTEND_URL`          | Frontend URL allowed by CORS
`DATABASE_URL`          | PostgreSQL connection string
`USER_POSTGRES_DB` | Name of the PostgreSQL database for the User Service
`USER_POSTGRES_USER` | Username for the PostgreSQL database
`USER_POSTGRES_PASSWORD` | Password for the PostgreSQL database
`RABBITMQ_URL`          | Broker connection URL for the background outbox publisher
`JWT_PRIVATE_KEY_PATH`  | Path to the RSA private key used to sign access tokens
`JWT_PUBLIC_KEY_PATH`   | Path to the RSA public key used to verify access tokens
`JWT_REFRESH_TOKEN_KEY` | Secret used to sign refresh tokens
`COOKIE_SECRET`         | Secret used for cookie signing
`BOOTSTRAP_ADMIN_EMAIL` | Email for the first administrator account
`BOOTSTRAP_ADMIN_USERNAME` | Username for the first administrator account
`BOOTSTRAP_ADMIN_PHONE_NUMBER` | Phone number for the first administrator account
`BOOTSTRAP_ADMIN_PASSWORD` | Password for the first administrator account
`BREVO_SMTP_USER` | Brevo SMTP username for sending emails
`BREVO_SMTP_KEY` | Brevo SMTP key for sending emails
`EMAIL_FROM` | Email address used as the sender for outgoing emails

> Do not commit `.env`, private keys, or other secrets to the repository.

### Database Setup

From the repository root:

```sh
cd user-service
npm ci
```

Apply the database migrations and generate the Prisma client:

```sh
npm run db:deploy
npm run db:generate
```

To inspect the database schema, run:

```sh
npm run db:studio
```

Start development with `npm run dev`, or run the compiled application with `npm start`.

The registration consumer starts after the HTTP server begins listening. It reconnects if RabbitMQ becomes unavailable. `GET /healthz` only confirms that the HTTP server is running; it does not check RabbitMQ or whether students have received credits.

## Credit provisioning outbox

Successful student OTP verification consumes the pending challenge, creates the student, and inserts a `USER_REGISTERED` outbox event in one PostgreSQL transaction. Any failure rolls back all three writes. Failed/unverified registration, OTP resends, admin bootstrap, and admin activation emit no registration event. No broker calls run inside this transaction, and no existing users are backfilled.

Configure the existing HTTP/database/auth/email environment plus `RABBITMQ_URL` in `user-service/.env`. The local default is `amqp://foc:foc-local-only@localhost:5672?heartbeat=20`; match the broker credentials and URL-encode special characters. See [RabbitMQ and service startup](../README.md#rabbitmq-and-service-startup) for Docker commands and the full [event contract](../credit-service/README.md#registration-and-initial-credit-grant).

`npm run dev` or `npm start` starts the publisher in the background after HTTP begins listening. Run one active user-service publisher instance for this version; there are no leases or distributed worker coordination. Accidental duplicate publication cannot grant credits twice, but coordinated multi-instance scheduling is not implemented.

The publisher polls every second and processes one due unpublished event at a time. It stores attempt count and retry timing before contacting RabbitMQ, reuses the immutable event body/ID, sets AMQP `messageId` to `eventId`, and marks `publishedAt` only after confirmed routing. Unpublished entries are retained indefinitely and retried with delays of 1, 2, 4, 8, 16, 32, then 60 seconds. Restarting resumes pending rows. There is no automatic outbox deletion.

If confirmation succeeds but saving `publishedAt` fails, the next attempt can republish the same event. Delivery is at least once; credit-service's grant function supplies idempotency. Registration succeeds during broker or credit-service downtime, while provisioning remains pending. `GET /user` is HTTP liveness, not a check that credits were granted. Missing `RABBITMQ_URL` causes background publishing failures without preventing registration; configure it before expecting delivery.

Publisher logs include event ID, user ID, attempt, and outcome. `lastError` stores the failing operation and a bounded driver code, never raw payloads or credentials. Inspect the following SQL in a client connected to the **user-service database**:

```sql
SELECT count(*) AS unpublished_count,
       min("createdAt") AS oldest_unpublished_at,
       now() - min("createdAt") AS oldest_unpublished_age
FROM "OutboxEvent"
WHERE "publishedAt" IS NULL;

-- Five minutes is an example investigation threshold, not a delivery SLA.
SELECT "eventId", "payload"->>'userId' AS "userId", "createdAt",
       "attemptCount", "nextAttemptAt", "lastError"
FROM "OutboxEvent"
WHERE "publishedAt" IS NULL
  AND "createdAt" < now() - interval '5 minutes'
ORDER BY "createdAt", "eventId"
LIMIT 50;
```

Old pending rows warrant checking broker connectivity, credentials, and publisher logs. A published row can still correspond to a queued or dead-lettered credit event: publication is not grant completion. For queue counts and safe replay, use the [dead-letter inspection/redrive instructions](../credit-service/README.md#inspecting-and-redriving-dead-letters). Do not rewrite stored payloads or set `publishedAt` manually to clear a backlog.

No automated tests were added for this workflow. Use `npx prisma validate`, `npm run db:generate`, and `npm run build` for schema and compilation checks; these do not verify runtime recovery guarantees.

## Security

### First Administrator Setup

The user service can create its first administrator before accepting requests.
Apply migrations with `npx prisma migrate deploy` and generate the client with
`npm run db:generate` before starting the updated service.

Set all four variables in `user-service/.env` or the service's deployment
environment:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_USERNAME=FirstAdmin
BOOTSTRAP_ADMIN_PHONE_NUMBER=91234567
BOOTSTRAP_ADMIN_PASSWORD="<provide a unique strong password>"
```

Replace the password placeholder with a password meeting the normal registration
rules: at least eight characters, including uppercase, lowercase, a number, and a
special character. Username and Singapore mobile validation also match registration.
Emails are trimmed and lowercased; mobile numbers are stored in `+65` format.

Start normally with `npm run dev`, or `npm run build` followed by `npm start`.
The account can immediately log in using the existing login endpoint. This is
trusted deployment provisioning and does not send an OTP, invitation email, or
issue login tokens. Use the existing admin invitation or promotion flow for
additional administrators.

All four variables unset or empty disables bootstrap. Otherwise, incomplete or
invalid credentials fail startup. Identity conflicts never overwrite or promote
an existing user. Database failures also stop startup. Logs report the bootstrap
outcome without including credentials or raw database errors.

After success, remove all four credentials from the deployment environment and
local `.env`. Do not commit secrets. A permanent `BootstrapState` row keyed by
`first-admin` prevents repeats even if credentials change, the password changes,
or the administrator is deleted or demoted. Completed bootstrap ignores leftover
invalid credentials. Do not delete this marker to recover an account: bootstrap
is initial setup, not account recovery.

The marker and account commit in one database transaction. Concurrent startups
compete for the same unique marker; only the winner creates the account. Failed
creation rolls back the marker so a corrected deployment can retry. Migrations
mark databases with an existing administrator complete without modifying users;
startup also checks for an existing administrator before creating one. Historical
admin deletion or demotion before this feature was installed cannot be inferred
from the current database; leave bootstrap disabled on those installations.

### Password Security

Passwords are hashed using **Argon2** before being stored in the database.

Plaintext passwords are never stored.

```text
User Password
      │
      ▼
    Argon2
      │
      ▼
Password Hash
      │
      ▼
 PostgreSQL
```

During login, the submitted password is verified against the stored hash.

### Email Matching

Email matching is case-insensitive.

For example:

```text
John@example.com
john@example.com
JOHN@EXAMPLE.COM
```

are treated as the same email address.

Email addresses are normalized before being stored or queried:

```typescript
email.trim().toLowerCase()
```

Passwords are **not** normalized. Password verification remains case-sensitive.

### Access Tokens

Access tokens use the RS256 algorithm.

The User Service signs access tokens using its private key:

```text
User Service
     │
     │ Private Key
     ▼
Access Token
     │
     ▼
Other Microservice
     │
     │ Public Key
     ▼
Token Verification
```

This allows other services to verify authentication locally without making a request to the User Service for every API request.

### Refresh Tokens

Refresh tokens:

- Are stored in an HttpOnly cookie.
- Are stored as Argon2 hashes in the database.
- Have an expiration time.
- Are revoked after successful use.
- Are rotated when a new access token is issued.
- Cannot be reused after being revoked.

## Docker (local demo)

Build from the repository root:

```sh
docker build -t foc-user-service ./user-service
```

The `builder` stage installs locked dependencies with `npm ci`, generates
Prisma Client, and compiles TypeScript. The `production` stage contains the
compiled application and production dependencies. It uses the base image's
default root user for this demo. Prisma remains a production dependency because the entrypoint
runs `prisma migrate deploy` before starting `node dist/index.js`.

Copy `.env.example` to `.env` inside `user-service` and fill in the values.
For the localhost HTTP demo, keep `PORT=3000` and `NODE_ENV=development` as
in the example, and use database/broker URLs reachable from the container.
The image still runs the compiled application. `localhost` inside the container refers
to that container; use Compose service names for containerized dependencies,
or `host.docker.internal` for services running on your Docker Desktop host.
Use `sslmode=disable` for a local PostgreSQL server without TLS.

Supply the environment file at runtime and mount `keys/` read-only at
`/app/keys`. The existing relative JWT paths then work unchanged. Database
credentials, Brevo credentials, and JWT keys are not included in the image.
Brevo remains an external SMTP service; User needs outbound access to it.

`compose.yaml` in this directory defines User Service and its own PostgreSQL
container, database healthcheck, and named storage volume. Fill in
`USER_POSTGRES_DB`, `USER_POSTGRES_USER`, and `USER_POSTGRES_PASSWORD` in `.env`.
Use a URL-safe database username/password (a randomly generated hex password
works). Compose supplies the container database URL and JWT key paths.

The root `compose.yaml` includes this file alongside Supplier's Compose file
and supplies shared RabbitMQ. Set `RABBITMQ_URL` in this service's `.env` to use
the `rabbitmq` hostname and credentials matching the root broker configuration.
From the repository root, start just User and its dependencies with:

```sh
docker compose up -d --build user-service
docker compose logs user-service
```

User waits for healthy PostgreSQL and RabbitMQ when started from the root.
For local browser testing, its API is published at `http://localhost:3000`
(using `PORT` from `.env`). PostgreSQL is published on loopback port 5434
for local Studio access. Remove these development port mappings for the
final isolated deployment. You can also check HTTP
from inside the container:

```sh
docker compose exec user-service node -e "fetch('http://localhost:3000/user').then(r => r.text()).then(console.log)"
```

Running `docker compose up -d --build` inside `user-service` starts only User
and PostgreSQL; RabbitMQ must be reachable separately for event publishing.
Stopping, restarting, or recreating containers preserves database data in
`user_postgres_data`; `docker compose down -v` deletes that volume.
Failed migrations stop startup instead of serving against an incorrect schema.
`GET /user` is a liveness endpoint, not a dependency check.

Refresh cookies retain the original behavior: `secure` is enabled when
`NODE_ENV=production`. They remain HttpOnly and signed.

### Local Prisma Studio

For local development, PostgreSQL is published only on `127.0.0.1:5434`.
Set `DATABASE_URL` in `user-service/.env` to
`postgresql://USER:PASSWORD@localhost:5434/DATABASE?sslmode=disable`, using
the same credentials and database as `USER_POSTGRES_*`. Compose overrides
this URL inside the API container to use `user-postgres:5432`.

With the database container running, open Studio on your laptop:

```sh
cd user-service
npm run db:studio
```

Studio accesses the existing container database and its persisted records.
Remove PostgreSQL's host port mapping for the final isolated deployment.

## Acknowledgements

- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [Zod](https://zod.dev/)
- [Argon2](https://www.npmjs.com/package/argon2)
- [JSON Web Token](https://jwt.io/)
