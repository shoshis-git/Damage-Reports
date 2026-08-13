# Damage Reports Management System

A full-stack web application for managing building damage reports, coordinating between the Ministry of Housing, local authorities, and property assessors. Built as part of an architecture course.

## Features

- **Reports List** – View all building damage reports with filtering by city and status
- **Settlement Readiness Dashboard** – Aggregated per-city readiness summary
- **Assessor Portal** – Appraisers enter damage assessments per building
- **Local Authority Portal** – Municipalities confirm infrastructure readiness (water, electricity, roads, etc.)
- **Occupancy Package Generation** – Generate and distribute return-home PDF packages per building or in bulk per city
- **Email Notifications** – Notify families when their building is approved, with retry logic and idempotency
- **Budget Requests** – Ministry-only workflow to open budget requests for eligible buildings
- **Activity Log** – Per-building audit trail of all user actions
- **Settlement Processes** – Track bulk occupancy package runs per settlement
- **System Health** – Live metrics: notification counts, retry rates, average process duration
- **Authentication & Role-Based Access** – Session-based login with three distinct roles

## Project Structure

```
damage-reports/
├── server.js                          # App entry point, Express setup, notification infrastructure
├── package.json
├── notifications.csv                  # Persisted notification log
├── logs/
│   └── occupancy-process.log          # Structured log of occupancy process events
├── public/
│   ├── index.html                     # Single-page frontend
│   ├── app.js                         # Frontend JavaScript (Vanilla JS)
│   ├── style.css
│   └── generated/                     # Generated PDF packages
├── domains/
│   ├── buildings/
│   │   ├── buildingService.js         # Core building data, rehabilitation, enrichment
│   │   └── buildingsRouter.js         # Buildings API (Ministry of Housing)
│   ├── assessments/
│   │   ├── assessmentService.js       # Assessor damage evaluations
│   │   └── assessmentsRouter.js       # Assessments API
│   ├── municipal-approvals/
│   │   ├── municipalService.js        # Local authority infrastructure approvals
│   │   └── municipalRouter.js         # Municipal approvals API
│   ├── auth/
│   │   └── authRouter.js              # Login / logout / session
│   └── settlement-processes/
│       └── settlementProcessesRouter.js  # Settlement process tracking API
└── services/
    ├── userService.js                 # User accounts and authentication
    ├── notificationService.js         # Email simulation with configurable failure modes
    ├── activityLogService.js          # Per-entity audit log
    ├── rehabilitationService.js       # Rehabilitation eligibility rules
    ├── occupancyPackageService.js     # PDF generation and package policy
    ├── settlementReadinessService.js  # Per-building readiness flags
    ├── settlementProcessService.js    # Bulk process tracking
    ├── systemHealthService.js         # Metrics aggregation
    ├── authMiddleware.js              # requireRole / requireSettlementAccess middleware
    └── occupancyProcessLogger.js      # Structured process event logging
```

## Architecture

The backend is organized around **domain ownership**:

| Domain | Owner | Responsibility |
|---|---|---|
| Buildings | Ministry of Housing | Core building data, status, budget requests, PDF packages |
| Assessments | Assessors team | Damage level evaluations per building |
| Municipal Approvals | Municipalities team | Infrastructure readiness approvals |
| Auth | Shared infrastructure | Session-based authentication |
| Settlement Processes | Shared infrastructure | Tracking of bulk occupancy runs |

Cross-domain reads are done via **callback injection** — routers receive `findBuilding` / `enrichBuilding` functions from `server.js` rather than importing each other directly. This avoids circular dependencies and keeps domain boundaries explicit.

```
┌──────────────────────────────┐
│        Browser (SPA)         │
│  Vanilla JS / HTML / CSS     │
└──────────────┬───────────────┘
               │ HTTP / REST
               ▼
┌──────────────────────────────┐
│         Express.js           │
│          server.js           │
│  (mounts domain routers)     │
└──┬───────┬──────┬────────────┘
   │       │      │
   ▼       ▼      ▼
Buildings  Assessments  Municipal
  domain     domain      domain
   │
   ├── assessmentService (read-only)
   └── municipalService  (read-only)
```

**Notification flow** uses an internal HTTP call (`POST /notifications/send`) with a retry loop (up to 3 attempts) and idempotency key checking, so duplicate notifications are never sent even on retry.

## User Roles

| Role | Username / Password | Access |
|---|---|---|
| MINISTRY | `israel` / `password1` | Full access to everything |
| MINISTRY | `sarah` / `password2` | Full access to everything |
| MUNICIPALITY | `david` / `password3` | Buildings in Jerusalem only; can approve infrastructure |
| MUNICIPALITY | `miriam` / `password4` | Buildings in Safed only; can approve infrastructure |
| APPRAISER | `yosef` / `password5` | Can enter damage assessments; no budget actions |

Role enforcement is applied on both frontend (tab/button visibility) and backend (middleware).

## Building Entity

```javascript
{
  id: string (UUID),
  reporterName: string,
  address: string,              // e.g. "ירושלים, רחוב 12"
  settlementId: string,         // e.g. "jerusalem"
  damageType: string,           // "Water Damage" | "Structural Damage" | ...
  description: string,
  hasDamageImages: boolean,
  hasEngineerReport: boolean,
  eligibilityCheckDone: boolean,
  apartmentsCount: number,
  familyEmail: string,
  socialApproval: boolean,
  budgetRequestOpened: boolean,
  status: string,               // see statuses below
  generatedPackageUrl: string | null,
  generatedPackageFileName: string | null
}
```

### Building Statuses

`WAITING_FOR_VALIDATION` → `NEW` → `IN_REVIEW` → `IN_REHABILITATION` → `REHABILITATION_COMPLETED`

## API Endpoints

### Auth

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Login with username + password | Public |
| POST | `/api/auth/logout` | Destroy session | Any |
| GET | `/api/auth/me` | Get current session user | Any |

### Buildings (Ministry of Housing domain)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/reports` | List all buildings (enriched). MUNICIPALITY users see their city only. | Any logged-in |
| POST | `/api/reports` | Create a new building report | Any logged-in |
| GET | `/api/reports/:id` | Get a single enriched building | Any logged-in |
| PATCH | `/api/reports/:id/status` | Update building status | Any logged-in |
| POST | `/api/reports/:id/budget-request` | Open a budget request | MINISTRY only |
| GET | `/api/reports/:id/activity-log` | Get audit log for a building | Any logged-in |
| POST | `/buildings/:id/return-home-package` | Generate occupancy PDF + notify family | Any logged-in |
| POST | `/buildings/bulk/return-home-packages` | Bulk generate packages for eligible buildings (optional `city` filter in body) | Any logged-in |

### Assessments

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/reports/:id/assessor-assessment` | Save or update an assessor evaluation | MINISTRY, APPRAISER |

### Municipal Approvals

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/reports/:id/local-authority-approval` | Save local authority infrastructure approval | MINISTRY, MUNICIPALITY (own city only) |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| POST | `/notifications/send` | Internal – send a notification with idempotency check |
| GET | `/notifications/state` | Get current notification server mode |
| POST | `/notifications/state` | Set notification server mode |
| GET | `/api/notifications` | List all sent notifications |

### Settlement Processes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/settlement-processes` | List all bulk occupancy runs |

### System Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/system-health` | Aggregated metrics (processes, notifications, performance) |

## Notification Modes

The notification service simulates different server behaviors for testing resilience patterns:

| Mode | Behavior |
|---|---|
| `Success` | All notifications succeed |
| `Always Fail` | All notifications fail |
| `Fail First Attempt` | First attempt fails, retries succeed |
| `Random Failure` | ~30% chance of failure per attempt |
| `Response Lost (Timeout)` | Notification is recorded as SENT but the API returns `RESPONSE_LOST` |

The retry loop runs up to **3 attempts** with idempotency key checking to prevent duplicate sends.

## Occupancy Package Eligibility

A building is eligible for an occupancy package when:
- `hasDamageImages: true`
- `hasEngineerReport: true`
- `eligibilityCheckDone: true`
- `status: REHABILITATION_COMPLETED`

Buildings with more than 24 apartments additionally require `socialApproval: true` to open a budget request.

## Settlement Readiness

Each building receives a `settlementReadiness` object:

```javascript
{
  isReady: boolean,
  category: "READY" | "WAITING_ASSESSOR" | "WAITING_LOCAL_AUTHORITY" | "OTHER"
}
```

A building is `READY` when it has a completed assessor evaluation **and** a local authority approval.

## Quick Start

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Running

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Sample Data

The system starts with **20 seed buildings** spread across three settlements:
- **ירושלים** (Jerusalem) – buildings 1, 4, 7, 10, 13, 16, 19
- **צפת** (Safed) – buildings 2, 5, 8, 11, 14, 17, 20
- **טבריה** (Tiberias) – buildings 3, 6, 9, 12, 15, 18

Buildings 1–10 are pre-seeded as fully eligible (`REHABILITATION_COMPLETED`, engineer report, eligibility check done).

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP server and routing |
| `express-session` | Cookie-based session management |
| `cors` | Cross-origin request support |
| `uuid` | UUID generation for IDs and idempotency keys |
| `pdfkit` | PDF generation for occupancy packages |
| `winston` | Structured logging for occupancy process events |
