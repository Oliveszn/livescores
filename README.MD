# Sports Live Data System

A real-time sports data API built with Node.js, Express, and WebSockets. The system provides live match tracking with a publish/subscribe architecture — clients connect over WebSocket and receive pushed updates the moment a match is created or commentary is added, with no polling required.

---

## What We're Building

This is a backend service for tracking live sporting events. It exposes a REST API for managing matches and per-match commentary, and a WebSocket server that broadcasts those changes to any connected clients in real time.

The core idea is a **pub/sub model**: when a match is created or a commentary event is posted, the server immediately pushes that update to every client subscribed to that match. A client watching a football game receives goal notifications, substitutions, and match status changes the instant they happen — without refreshing.

---

## Architecture

```
HTTP Client                WebSocket Client
     │                           │
     ▼                           ▼
 REST API                   WS Server (/ws)
  (Express)                  (ws library)
     │                           │
     ▼                           ▼
 Controllers              Pub/Sub Manager
  matches                  matchSubscribers
  commentary               (Map<matchId, Set<socket>>)
     │                           ▲
     ▼                           │
  Drizzle ORM            broadcast functions
     │                   broadcastMatchCreated
     ▼                   broadcastCommentary
  PostgreSQL
```

The REST API and WebSocket server share a single HTTP server instance. When a controller handles a POST request and successfully writes to the database, it calls a broadcast function via `app.locals` — which pushes the new data to all relevant WebSocket subscribers.

---

## Stack

| Layer      | Technology           | Why                                     |
| ---------- | -------------------- | --------------------------------------- |
| Runtime    | Node.js + TypeScript | Type safety across the full backend     |
| Framework  | Express 5            | Routing and middleware                  |
| WebSocket  | `ws` library         | Lightweight, low-level WS control       |
| Database   | PostgreSQL via Neon  | Serverless-compatible Postgres          |
| ORM        | Drizzle ORM          | Type-safe queries, schema-as-code       |
| Validation | Zod                  | Runtime schema validation on all inputs |
| Security   | Arcjet               | Rate limiting and bot protection        |
| Testing    | Vitest               | TypeScript-native, fast, zero config    |

---

## Project Structure

```
src/
  controllers/
    matchController.ts        # Business logic for match routes
    commentaryController.ts   # Business logic for commentary routes
  routes/
    matches.ts                # Thin router — wires HTTP verbs to controllers
    commentary.ts
  db/
    db.ts                     # Drizzle + pg pool setup
    schema.ts                 # Table definitions and TypeScript types
  validation/
    matches.ts                # Zod schemas for match inputs
    commentary.ts             # Zod schemas for commentary inputs
  utils/
    matchStatus.ts            # Pure function: derives match status from times
  ws.ts                       # WebSocket server and pub/sub logic
  arcjet.ts                   # Security middleware setup
  server.ts                   # Entry point — wires everything together
  __tests__/
    utils/
      matchStatus.test.ts
      syncMatchStatus.test.ts
    controllers/
      matchController.test.ts
      commentaryController.test.ts
```

---

## REST API

### Matches

#### `GET /matches`

Returns a paginated list of matches ordered by creation time.

**Query params:**

| Param   | Type    | Default | Max |
| ------- | ------- | ------- | --- |
| `limit` | integer | 50      | 60  |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "sport": "football",
      "homeTeam": "Arsenal",
      "awayTeam": "Chelsea",
      "status": "live",
      "startTime": "2025-01-01T15:00:00Z",
      "endTime": "2025-01-01T17:00:00Z",
      "homeScore": 1,
      "awayScore": 0,
      "createdAt": "2025-01-01T14:50:00Z"
    }
  ]
}
```

#### `POST /matches`

Creates a new match. Also broadcasts a `match_created` event to all connected WebSocket clients.

**Body:**

```json
{
  "sport": "football",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "startTime": "2025-06-01T15:00:00Z",
  "endTime": "2025-06-01T17:00:00Z",
  "homeScore": 0,
  "awayScore": 0
}
```

**Validation rules:**

- `sport`, `homeTeam`, `awayTeam` — required, non-empty strings
- `startTime`, `endTime` — required ISO 8601 datetime strings
- `endTime` must be after `startTime`
- `homeScore`, `awayScore` — optional, non-negative integers, default to `0`

**Response `201`:**

```json
{ "data": { ...match } }
```

---

### Commentary

#### `GET /matches/:id/commentary`

Returns recent commentary for a match, ordered newest first.

**Query params:**

| Param   | Type    | Default | Max |
| ------- | ------- | ------- | --- |
| `limit` | integer | 10      | 60  |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 1,
      "matchId": 1,
      "minute": 34,
      "message": "Goal! Arsenal take the lead.",
      "eventType": "goal",
      "actor": "Saka",
      "createdAt": "2025-06-01T15:34:00Z"
    }
  ]
}
```

#### `POST /matches/:id/commentary`

Adds a commentary entry to a match. Also broadcasts a `commentary` event to all WebSocket clients subscribed to that match.

**Body:**

```json
{
  "message": "Goal! Arsenal take the lead.",
  "minute": 34,
  "eventType": "goal",
  "actor": "Saka",
  "team": "home",
  "period": "first_half"
}
```

**Validation rules:**

- `message` — required, non-empty string
- All other fields are optional

**Response `201`:**

```json
{ "data": { ...commentaryEntry } }
```

---

## WebSocket API

Connect to `ws://localhost:{PORT}/ws`.

### Sending messages

#### Subscribe to a match

```json
{ "type": "subscribe", "matchId": 1 }
```

#### Unsubscribe from a match

```json
{ "type": "unsubscribe", "matchId": 1 }
```

### Receiving messages

#### On connection

```json
{ "type": "welcome" }
```

#### When a match is created (broadcast to all clients)

```json
{
  "type": "match_created",
  "data": { ...match }
}
```

#### When commentary is posted (broadcast to subscribers of that match only)

```json
{
  "type": "commentary",
  "data": { ...commentaryEntry }
}
```

### Pub/Sub internals

The WebSocket server maintains a `Map<matchId, Set<socket>>` called `matchSubscribers`. When a client sends `subscribe`, their socket is added to the set for that match ID. When commentary is broadcast, only sockets in that match's set receive the message.

A heartbeat runs every 30 seconds — any client that fails to respond with a `pong` is terminated and cleaned up from all subscriptions.

---

## Security — Arcjet

All HTTP routes and WebSocket connections are protected by [Arcjet](https://arcjet.com).

**What it does:**

- **Rate limiting** — prevents a single client from flooding the API with requests
- **Bot detection** — blocks automated scraping and abuse
- **WebSocket protection** — applied at connection time; rate-limited connections are closed with code `1013`, other denied connections with `1008`

The security middleware is applied in `server.ts` before any route handlers:

```ts
app.use(securityMiddleware());
```

WebSocket connections are checked inside `attachWebSocketServer` before the socket is allowed to proceed:

```ts
const decision = await wsArcjet.protect(req);
if (decision.isDenied()) {
  socket.close(code, reason);
  return;
}
```

---

## Match Status

Match status is derived automatically from `startTime` and `endTime` — it is never stored as a static value.

| Condition                    | Status      |
| ---------------------------- | ----------- |
| `now < startTime`            | `scheduled` |
| `startTime <= now < endTime` | `live`      |
| `now >= endTime`             | `finished`  |

The `getMatchStatus(startTime, endTime, now?)` utility accepts an optional `now` parameter. This is intentional — it makes the function fully deterministic in tests without needing to mock `Date`.

---

## Testing

Tests are written with [Vitest](https://vitest.dev). The test suite is split into two layers:

### Unit tests — `src/__tests__/`

Each file tests one module in isolation. Dependencies are replaced with mocks so tests are fast, deterministic, and don't require a database or network.

```bash
npm test          # run all tests once
npm run test:watch     # watch mode — re-runs on file save
npm run test:coverage  # generate coverage report
```

**Test files:**

| File                                       | What it tests                        | Key technique                                     |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------- |
| `utils/matchStatus.test.ts`                | `getMatchStatus` pure function       | Fixed date strings, `.toThrow()`                  |
| `utils/syncMatchStatus.test.ts`            | `syncMatchStatus` async function     | `vi.fn()` for `updateStatus`, `rejects.toThrow()` |
| `controllers/matchController.test.ts`      | `listMatches`, `createMatch`         | `vi.mock()` for db, chained mock setup            |
| `controllers/commentaryController.test.ts` | `listCommentary`, `createCommentary` | Same + `req.params` validation cases              |

**Key testing patterns used:**

`vi.mock("../db/db")` — intercepts the database module entirely before it executes. This prevents the `DATABASE_URL` environment variable check from throwing during tests and ensures no real database connections are made.

```ts
vi.mock("../../db/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));
```

Chained mock setup — Drizzle's query builder chains methods. Each step in the chain returns the next mock:

```ts
const limitMock = vi.fn().mockResolvedValue(fakeData);
const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);
```

`buildReq` / `buildRes` helpers — reusable factory functions that create minimal fake Express objects, keeping individual tests concise.

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or a [Neon](https://neon.tech) connection string)

### Install

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@host/dbname
PORT=3000
HOST=0.0.0.0
ARCJET_KEY=your_arcjet_key
```

### Database setup

```bash
npm run db:generate   # generate migration files from schema
npm run db:migrate    # apply migrations to the database
npm run db:push       # push schema directly (dev only)
npm run db:studio     # open Drizzle Studio to browse data
```

### Run

```bash
npm run dev     # development — ts-node-dev with hot reload
npm run build   # compile TypeScript to dist/
npm start       # run compiled output
```

### Test

```bash
npm test
```
