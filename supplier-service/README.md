<!-- AI Assistance Disclosure:
Tool: Claude Code (Opus 5.5)
Date: 2026-11-06
Scope: Audited README and suggested changes to keep documentation up-to-date. 
Author review: Reviewed and edited by Amber Tan Junning. -->

<!-- AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5)
Date: 2026-11-11
Scope: Audited against the code; fixed the setup commands, key mount, internal endpoint response, environment variables, response examples, test list, project structure and typos.
Author review: Reviewed and edited by Lim Shao Qi. -->

<!--
AI Assistance Disclosure:
Tool & model: GPT-6.1-Sol (high)
Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
Contributor: Duong Ngoc Mai
Scope: Added the retrospective feature AI usage summary for Duong Ngoc Mai.
Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.
-->

# Supplier Service

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [AI Use Summary](#ai-use-summary)
- [Acknowledgements](#acknowledgements)

## About

The Supplier Service is responsible for managing suppliers and supplier types for **Aaron**. It provides RESTful API endpoints for creating, updating, deactivating, and querying suppliers and supplier types.

## Features

### Supplier Management

- View suppliers (active and all) with pagination, search, and type filtering.
- Create, update, activate and deactivate suppliers.
- Upload supplier images.
- Seed initial supplier data.

### Supplier Type Management

- View all supplier types.
- Count the number of suppliers associated with each type.
- Create and delete supplier types (with constraints).

### Supplier Assets
- Get images associated to supplier records.
- Upload images for supplier records.

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
CORS          | Cross-origin resource sharing
Docker        | Containerization

## Architecture

### Overview Architecture Diagram

The Supplier Service is one of the backend microservices in Aaron.

```text
┌──────────────────────┐
│      Frontend        │
│   React + TypeScript │
└──────────┬───────────┘
           │
           │ REST API
           ▼
┌──────────────────────────────────────────────┐
│           Supplier Service                   │
│                                              │
│  ┌──────────────┐  ┌──────────────┐          │
│  │    Routes    │→ │ Controllers  │          │
│  └──────────────┘  └──────┬───────┘          │
│                           │                  │
│                    ┌──────▼───────┐          │
│                    │   Services   │          │
│                    └──────┬───────┘          │
│                           │                  │
│                    ┌──────▼───────┐          │
│                    │  Supplier &  |          │     
│                    │ SupplierType |          │
│                    │  Management  │          │
│                    └──────┬───────┘          │
│                           │                  │     
│                    ┌──────▼───────┐          │
│                    │  Prisma ORM  │          │
│                    └───────┬──────┘          │
└────────────────────────────┼─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   suppliers     │
                    └─────────────────┘
```

### Database

- PostgreSQL database
- Prisma ORM for database management

The Supplier Service has its own PostgreSQL database.

```text
Supplier Service
     │
     ▼
  PostgreSQL
     │
     ├── Supplier
     │
     ├── SupplierType
     │
     └── OpeningHours
```

Alongside these tables, enums `SupplierStatus` and `Day` are created.

Other microservices do not directly access the Supplier Service's database. All modifications of the data in the database must be done via the Supplier Service's exposed API endpoints.

## Project Structure

```text
supplier-service/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── errors/
│   ├── generated/      # Prisma client (generated, git-ignored)
│   ├── libs/
│   ├── middleware/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   ├── types/
│   └── index.ts
│
├── keys/               # public.pem (git-ignored)
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
├── AGENTS.md
├── compose.yaml
├── docker-entrypoint.sh
├── Dockerfile
├── package-lock.json
├── package.json
├── prisma.config.ts
├── README.md
└── tsconfig.json
```

## API Reference

### Supplier Service API Endpoints

All routes, with the exception of getting supplier images, are protected by JWT authentication (`authenticate`). The `authorize` function in the middleware ensures that the caller has the required permissions to access the endpoint. All endpoints use HTTP and are called synchronously.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| `GET` | `/api/suppliers/` | admin | View the suppliers (ALL suppliers regardless of status) based on the current page, search key (case-insensitive) and type filter |
| `GET` | `/api/suppliers/active` | all | View the ACTIVE suppliers based on the current page, search key (case-insensitive) and type filter |
| `GET` | `/api/suppliers/by-ids` | all | Get relevant suppliers (id, name, type) information by supplying a list of supplier IDs |
| `POST` | `/api/suppliers` | admin | Create a supplier (active by default) |
| `PATCH` | `/api/suppliers/:supplierId` | admin | Update a supplier |
| `PATCH` | `/api/suppliers/:supplierId/activation` | admin | Activate a supplier |
| `PATCH` | `/api/suppliers/:supplierId/deactivation` | admin | Deactivate a supplier |
| `GET` | `/api/suppliers/types` | all | Get all existing supplier types |
| `GET` | `/api/suppliers/types/count` | admin | For each supplier type, count the number of supplier records associated to it |
| `POST` | `/api/suppliers/types` | admin | Create a new supplier type |
| `DELETE` | `/api/suppliers/types/:typeId` | admin | Delete an existing supplier type with no supplier records associated to it |
| `POST` | `/api/suppliers/assets/images` | admin | Upload image of a supplier |
| `GET` | `/api/suppliers/assets/images/:filename` | all, no authentication required | Get a supplier image with the specified filename |

### Query suppliers (`GET /api/suppliers/`)

Pagination is an option for querying suppliers. If the entire list of suppliers is to be queried, the `page` parameter should be left undefined. Otherwise, pass a positive integer to the `page` query parameter. Each page displays a maximum of 15 records. The `typeFilter` and `searchString` are also optional fields in the request parameters that can be passed by the caller. The supplier records returned will:

1. have a name that contains the searchString (case-insensitive)
2. have a supplier type that is equal to `typeFilter`
3. after filtering for supplier records that fulfil conditions (1) and (2) and sorting these records in alphabetical (case-sensitive) order, supplier records returned are the first `{1+15*<page_number-1>}`th to `{15*<page_number>}`th records if pagination is required, or a list of all the records if pagination is not required.

Example request URL:
```{base_url}/api/suppliers/?page=2&typeFilter=FOOD```

Example response for data:

```json
{
    "data": {
        "suppliers": [ <supplier data> ],
        "pagination": {
            "paginated": true,
            "limit": 15,
            "page": 2,
            "totalCount": 40,
            "totalPages": 3
        }
    }
}
```

#### Possible Responses

Status | Description
------ | --------------------------------------------------------------
`200`  | Suppliers successfully queried
`400`  | Invalid request data or no records found for the given page

### Query active suppliers (`GET /api/suppliers/active`)

From the outside world, the way this endpoint is called and its response is exactly the same as the above (query all suppliers) endpoint, but within the `supplier-service`, only `ACTIVE` suppliers are filtered out and returned.

### Query suppliers by IDs (`GET /api/suppliers/by-ids`)

Query suppliers by their IDs. The request should include a query parameter `ids` with a list of supplier IDs.

Example request URL:
```{base_url}/api/suppliers/by-ids?ids=1,2,3```

Example response for data:

```json
{
    "data": {
        "suppliers": [ <supplier data> ]
    }
}
```

#### Possible Responses

Status | Description
------ | --------------------------------
`200`  | Suppliers successfully queried
`400`  | Invalid request data

### Create supplier (`POST /api/suppliers/`)

Request body:

```json
{
  "name": "Starbucks",
  "type": "FOOD",
  "building": "Engineering Building",
  "floor": "1",
  "description": "Coffee and pastries",
  "address": "4 Engineering Road",
  "latitude": 1.30,
  "longitude": 103.77,
  "imageUrl": "https://example.com/starbucks.jpg",
  "openingHours": [
    { "day": "MONDAY", "openingTime": "08:00", "closingTime": "18:00" }
  ]
}
```

- `name`, `type`, `building`, `floor`, `description`, `address` are required.
- `type` must reference an existing supplier type.
- `name` matching is case-insensitive — duplicates are rejected (`409`).
- `latitude`, `longitude`, `imageUrl`, and `openingHours` are optional.
- New suppliers are stored with `status = ACTIVATED` (F2.1.5).

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------
`201`  | Supplier successfully created
`422`  | Invalid request body (`UNPROCESSABLE_ENTITY`)
`409`  | Supplier with the same (case-insensitive) name already exists

### Update supplier (`PATCH /api/suppliers/:supplierId`)

Partial body using the same fields as create. Only provided fields are
changed. If `openingHours` is provided, the supplier's existing hours are
replaced. An empty body is rejected (`422`).

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------------
`200`  | Supplier successfully updated
`422`  | Invalid request body (`UNPROCESSABLE_ENTITY`)
`404`  | Supplier with the specified supplierId not found
`409`  | New supplier name given conflicts with an existing supplier's name 

### Deactivate supplier (`PATCH /api/suppliers/:supplierId/deactivation`)

Sets `status = DEACTIVATED`. The record is kept so historical orders remain
viewable. Rejects unknown suppliers (`404`) and already-deactivated suppliers
(`409`). Deactivated suppliers no longer appear as available for new errands.

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------------
`200`  | Supplier successfully deactivated
`400`  | Invalid request data 
`404`  | Supplier with the specified supplierId not found
`409`  | Supplier is already deactivated

### Activate supplier (`PATCH /api/suppliers/:supplierId/activation`)

Admin-only; no request body is required. Sets `status = ACTIVATED` so the supplier
is available for new errands again, preserving its details and historical orders.
Returns `200` with the supplier, including opening hours. An already-active supplier
returns `200` without a database update. Unknown suppliers return `404`.

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------------
`200`  | Supplier successfully activated
`400`  | Invalid request data 
`404`  | Supplier with the specified supplierId not found

### Fetch all the current supplier types (`GET /api/suppliers/types`)

A simple function that returns all the supplier types in ascending alphabetical order. No query parameters are required for this endpoint.
HTTP status code `200` will be returned for successful queries.

Example response:
```json
{
    "success": true,
    "message": "All supplier types queried successfully",
    "data": <types returned by prisma>,
}
```

### Count the number of associated suppliers for each supplier type (`GET /api/suppliers/types/count`)

For each supplier type in the SupplierType table, count the number of supplier records that is associated to this type. The structure and types of data that is returned for a successful query is as follows:

```json
{ 
    "success": true,
    "message": "Data fetched successfully",
    "data": [
        {
            "id": uuid, 
            "type": string, 
            "count": int
        }, ...
    ]
}
```

HTTP status code `200` will be returned for successful queries. 

### Create a new supplier type (`POST /api/suppliers/types`)

The supplier type to be created must not have the same (case-insensitive) name as any of the current records, else, the app will throw an error code 400.

Request body:

```json
{
  "type": <type to be created>,
}
```

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------------
`200`  | New supplier type successfully created
`400`  | Invalid request data, or if the type to be created already exists

### Delete an existing supplier type (`DELETE /api/suppliers/types/:typeId`)

The supplier type to be deleted must be an existing supplier type, if not, the app will return an error code 404. The existing supplier type must also have no associated supplier records, if not, the app will return an error code 403.

#### Possible Responses

Status | Description
------ | ----------------------------------------------------------------------
`200`  | Supplier type successfully deleted
`403`  | Supplier type to be deleted has associated supplier records
`404`  | No supplier type with the given typeId exists

### Internal Supplier Service API Endpoints

All routes are protected by a shared secret (`ORDER_SUPPLIER_SERVICE_TOKEN`) for internal communication between the Order Service and Supplier Service.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| `GET` | `/api/internal/suppliers/:supplierId` | any | Get full supplier information by supplying its supplier IDs |

### Query suppliers by ID (`GET /api/internal/suppliers/:supplierId`)

Query a single supplier by its ID.

Example request URL:
```{base_url}/api/internal/suppliers/1```

Example response:

```json
{
    "success": true,
    "message": "Supplier fetched successfully",
    "data": { <supplier data> }
}
```

#### Possible Responses

Status | Description
------ | -----------------------------------------------
`200`  | Supplier information successfully queried
`400`  | Invalid request data
`404`  | Supplier with specified ID not found

### Response Shape

#### Success

```json
{ "success": true, "message": { /* message to be returned */ }, "data": { /* data to be returned */ } }
```

#### Errors

```json
{ "success": false, "code": "CONFLICT", "message": "..." }
```

## Supplier Assets

Under `storage.ts`, a storage interface is implemented by two classes, `S3Storage` and `LocalStorage`. 

`S3Storage` is the storage class that will be used when the application is deployed on cloud. All seeded images and image uploads have a dedicated image bucket on AWS S3. 

When this application is run on localhost, `LocalStorage` is the storage class used. When an uploaded supplier image is requested, the request is passed from nginx to supplier service, before being served. 

### Uploading Images

When the route for uploading images is used, the following steps occur:

1. The authenticate middleware checks the JWT token and authenticates the caller. 
2. The authorize middleware checks that the caller has the `admin` role. 
3. The multer in the upload middleware checks that the uploaded image does not exceed the maximum allowed image size, and is of the allowed file types. The image is then placed into `req.file` before control is passed to the controller. 
4. The controller checks that the image exists in `req.file`.
5. The `uploadImage` function in `supplier.asset.service.ts` creates a unique file name for the image and calls the storage class implemented to save the file. 

## Containerization

Supplier service makes use of Docker for containerization. A multi-stage build is used. 

When the container starts up, the database seeding script (`prisma/seed.ts`) always runs. The script checks whether the `supplier` table is empty; if it is empty (i.e. no rows in the table exist), then the script will seed the `supplier` table with data from `foc/data/csv/supplier-seed-data.csv`. Effectively, the database seeding will only occur once, unless the database is reset.

The `supplierType` and `openingHours` table will also be populated based on the data provided in the CSV file. On initial startup, the `supplierType` table will be populated with 3 types: `RETAIL`, `FOOD` and `FACILITIES`. 

## Getting Started

### Prerequisites

Make sure the following are installed:

- Node.js compatible with the project’s installed Prisma version.
- npm.
- PostgreSQL.

### Environment Variables

Create a `.env` file in the root of the Supplier Service and fill in the required environment variables. You can use the provided `.env.example` as a template.

| Variable | Purpose |
| --- | --- |
`PORT` | Port used by the Supplier Service
`NODE_ENV` | Node environment (development, production, etc.)
`FRONTEND_URL` | Frontend URL allowed by CORS
`POSTGRES_USER` | Username for the PostgreSQL database
`POSTGRES_PASSWORD` | Password for the PostgreSQL database
`DATABASE_URL` | PostgreSQL connection string
`JWT_PUBLIC_KEY_PATH` | Path to the RSA public key used to verify access tokens
`STORAGE` | Required, `local` or `s3`. Where uploaded images are stored: `local` saves them to disk (`supplier-service/uploads/`), `s3` uses foc's AWS S3 image bucket
`ASSETS_PUBLIC_URL` | Base URL of all returned image URLs
`S3_BUCKET` | Required variable when `STORAGE=s3`. Name of the images bucket in AWS S3. Not in `.env.example`; add it when using S3.
`AWS_REGION` | Required variable when `STORAGE=s3`. Region of the images bucket in AWS S3.
`ORDER_SUPPLIER_SERVICE_TOKEN` | Shared secret for internal communication between the Order Service and Supplier Service

> Do not commit `.env`, private keys, or other secrets to the repository.

### Testing

Tests use Node's built-in test runner (`node:test`) executed through `tsx`, so
no extra test dependencies are required.

```bash
npm test
```

- `src/schemas/supplier.schema.test.ts` — Zod schema validation + `parseInput` error mapping.
- `src/schemas/supplier.type.schema.test.ts` — supplier type schema validation.
- `src/services/supplier.service.test.ts` — create/update/deactivate logic driven by an in-memory fake Prisma client (no database needed).
- `src/services/supplier.type.service.test.ts` — supplier type create/delete/count logic.
- `src/services/supplier.asset.service.test.ts` — image upload logic.
- `src/routes/supplier.route.test.ts` — route wiring, authentication and authorization.

### Docker

The root `compose.yaml` includes this folder's `compose.yaml`, which defines two containers:

- **`supplier-service`:** built from the `Dockerfile` (Node.js 22 Alpine). It mounts its own `./keys/public.pem` read-only at `/app/keys/public.pem`, so copy `user-service/keys/public.pem` into `supplier-service/keys/` first. It also mounts `../data/csv` read-only for the seed data. `docker-entrypoint.sh` runs `prisma migrate deploy`, then `prisma db seed`, and then starts `dist/index.js`. The API port isn't published to the host. In the root stack, reach it through the frontend at `http://localhost:5173/api/suppliers/...`.
- **`supplier-postgres`:** PostgreSQL 17 with a health check. The service waits until it is healthy.

The `127.0.0.1:5433` Postgres port mapping only works when you run this folder's compose on its own, for example `docker compose up -d supplier-postgres` to use with `npm run dev`. In the root stack, the database is on an internal network and isn't reachable from the host. Use `docker compose exec supplier-postgres psql -U <POSTGRES_USER> suppliers` instead.

## AI Use Summary

- **Contributor:** Duong Ngoc Mai.
- **Tool & model:** GPT-6.1-Sol (high).
- **Scope:** AI assisted Duong Ngoc Mai with creating, updating, deactivating and activating suppliers, including the admin UI, validation, persistence and related tests.
- **Disclosure:** recorded retrospectively on 2026-11-11 because Duong Ngoc Mai periodically deletes historical Codex data to save storage space on her device. Original development dates and exact prompts are no longer available; Kept/changed entries summarize the current files. Historical review/test results were not supplied. Existing contributor disclosures remain in place.
- **Full log:** [Detailed AI Usage Log for Duong Ngoc Mai](../ai/usage-log.md#detailed-ai-usage-log-for-duong-ngoc-mai).

## Acknowledgements

- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [Zod](https://zod.dev/)
- [JSON Web Token](https://jwt.io/)
- [Docker](https://www.docker.com/)
