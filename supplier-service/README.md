# Supplier Service

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Acknowledgements](#acknowledgements)

## About

The Supplier Service is responsible for managing suppliers and supplier types for **Aaron**. It provides RESTful API endpoints for creating, updating, deactivating, and querying suppliers and supplier types.

## Features

### Supplier Management

- View suppliers (active and all) with pagination, search, and type filtering.
- Create, update, active and deactivate suppliers.
- Upload supplier images.
- Seed initial supplier data.

### Supplier Type Management

- View all supplier types.
- Count the number of suppliers associated with each type.
- Create and delete supplier types (with constraints).

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

```test
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
│   └── schema.prisma
│
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── errors/
│   ├── integrations/
│   ├── libs/
│   ├── middlewares/
│   ├── routes/
│   ├── schemas/
│   ├── services/
│   ├── types/
│   └── index.ts
│
├── keys/
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
|── AGENTS.md
|── compose.yaml
|── docker-entrypoint.sh
|── Dockerfile
|── package-lock.json
├── package.json
├── prisma.config.ts
|── README.md
└── tsconfig.json
```

## API Reference

### Supplier Service API Endpoints

All routes are protected by JWT authentication (`authenticate`). The `authorize` function in the middleware ensures that the caller has the required permissions to access the endpoint. All endpoints use HTTP and are called synchronously.

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
| `POST` | `/api/suppliers/assets/images/` | admin | Upload image of a supplier |

### Query suppliers (`GET /api/suppliers/`)

Pagination is an option for querying suppliers. If the entire list of suppliers is to be queried, the `page` parameter should be left undefined. Otherwise, pass a positive integer to the `page` query parameter. Each page displays a maximum of 15 records. The `typeFilter` and `searchString` are also optional fields in the request parameters that can be passed by the caller. The supplier records returned will:

1. have a name that contains the searchString (case-insensitive)
2. have a supplier type that is equal to `typeFilter`
3. after filtering for supplier records that fulfil conditions (1) and (2) and sorting these records in alphabetical (case-sensitive) order, supplier records returned are the first `{1+15*<page_number-1>}`th to `{15*<page_number>}`th records if pagination is required, or a list of al the records if pagination is not required.

Example request URL:
```{base_url}/api/suppliers/?page=2&typeFilter=FOOD```

Example response for data:

```json
{
    "data": {
        "suppliers": [ <supplier data> ],
        "pagination": {
            "limit": 15,
            "page": 2,
            "totalCount": 40,
            "totalPages": 3
        }
    }
}
```

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

### Update supplier (`PATCH /api/suppliers/:supplierId`)

Partial body using the same fields as create. Only provided fields are
changed. If `openingHours` is provided, the supplier's existing hours are
replaced. An empty body is rejected (`400`).

### Deactivate supplier (`PATCH /api/suppliers/:supplierId/deactivation`)

Sets `status = DEACTIVATED`. The record is kept so historical orders remain
viewable. Rejects unknown suppliers (`404`) and already-deactivated suppliers
(`409`). Deactivated suppliers no longer appear as available for new errands.

### Activate supplier (`PATCH /api/suppliers/:supplierId/activation`)

Admin-only; no request body is required. Sets `status = ACTIVATED` so the supplier
is available for new errands again, preserving its details and historical orders.
Returns `200` with the supplier, including opening hours. An already-active supplier
returns `200` without a database update. Unknown suppliers return `404`.

### Fetch all the current supplier types (`GET /api/suppliers/types`)

A simple function that returns all the supplier types in ascending alphabetical order. No query parameters are required for this endpoint.

### Count the number of associated suppliers for each supplier type (`GET /api/suppliers/types/count`)

For each supplier type in the SupplierType table, count the number of supplier records that is associated to this type. The structure of data that is returned for a successful query is as follows:

```json
{ 
  id: uuid, 
  type: string, 
  count: int 
}
```

### Create a new supplier type (`POST /api/suppliers/types`)

The supplier type to be created must not have the same (case-insensitive) name as any of the current records, else, the app will throw an error code 400.

Request body:

```json
{
  "type": <type to be created>,
}
```

### Delete an existing supplier type (`DELETE /api/suppliers/types/:typeId`)

The supplier type to be deleted must be an existing supplier type, if not, the app will return an error code 400. The existing supplier type must also have no associated supplier records, if not, the app will return an error code 403.

### Internal Supplier Service API Endpoints

All routes are protected by a shared secret (`ORDER_SUPPLIER_SERVICE_TOKEN`) for internal communication between the Order Service and Supplier Service.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| `GET` | `/api/internal/suppliers/:supplierId` | any | Get full supplier information by supplying its supplier IDs |

### Query suppliers by ID (`GET /api/internal/suppliers/:supplierId`)

Query a single supplier by its ID.

Example request URL:
```{base_url}/api/internal/suppliers/1```

Example response for data:

```json
{
    "data": {
        "suppliers": [ <supplier data> ]
    }
}
```

### Response Shape

#### Success

```json
{ "success": true, "message": { /* message to be returned */ }, "data": { /* data to be returned */ } }
```

#### Errors

```json
{ "success": false, "code": "CONFLICT", "message": "..." }
```

## Containerization

Supplier service makes use of Docker for containerization. A multi-stage build is used. 

During the build stage, the database seeding script (`prisma/seed.ts`) always runs. The script checks whether the `supplier` table is empty; if it is empty (i.e. no rows in the table exist), then the script will seed the `supplier` table with data from `foc/data/csv/supplier-seed-data.csv`. The `supplierType` and `openingHours` table will also be populated based on the data provided in the CSV file. Effectively, the database seeding will only occur once, unless the database is reset.

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
`ASSETS_PUBLIC_URL` | Public URL for supplier assets (images)
`ORDER_SUPPLIER_SERVICE_TOKEN` | Shared secret for internal communication between the Order Service and Supplier Service

> Do not commit `.env`, private keys, or other secrets to the repository.

### Database Setup

From the repository root:

```sh
cd supplier-service
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

### Testing

Tests use Node's built-in test runner (`node:test`) executed through `tsx`, so
no extra test dependencies are required.

```bash
npm test
```

- `src/schemas/supplier.schema.test.ts` — Zod schema validation + `parseInput` error mapping.
- `src/services/supplier.service.test.ts` — create/update/deactivate logic driven by an in-memory fake Prisma client (no database needed).

## Acknowledgements

- [Express](https://expressjs.com/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [Zod](https://zod.dev/)
- [JSON Web Token](https://jwt.io/)
- [Docker](https://www.docker.com/)
