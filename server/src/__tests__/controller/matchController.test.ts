import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() is hoisted to the top of the file by Vitest it runs before any
// imports. This means when matchController imports db, it gets our fake version
// instead The real db.ts file never executes, so no DATABASE_URL needed
vi.mock("../../db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// We also mock getMatchStatus because createMatch calls it internally
// We don't want our controller tests to depend on time-sensitive logic that's already covered in matchStatus.test.ts.
vi.mock("../../utils/matchStatus", () => ({
  getMatchStatus: vi.fn().mockReturnValue("scheduled"),
}));

// These imports happen AFTER vi.mock() intercepts them
import { listMatches, createMatch } from "../../controllers/matchController";
import { db } from "../../db/db";

// Helpers

// buildRes() creates a fake Express response object
// Each method is a vi.fn() so we can assert: was .json() called? With what?
// .status() returns `res` itself so chaining works: res.status(400).json(...)
function buildRes() {
  const res: any = {
    json: vi.fn(),
    status: vi.fn(),
    app: { locals: {} },
  };
  res.status.mockReturnValue(res);
  return res;
}

// buildReq() creates a fake Express request object
// We spread in whatever the test needs (body, query, params)
function buildReq(overrides: { body?: any; query?: any; params?: any } = {}) {
  return {
    body: {},
    query: {},
    params: {},
    app: { locals: {} },
    ...overrides,
  };
}

// listMatches
describe("listMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with data when db call succeeds", async () => {
    const fakeMatches = [
      { id: 1, sport: "football", homeTeam: "Arsenal", awayTeam: "Chelsea" },
    ];

    // We need to mock the full chain: db.select().from().orderBy().limit()
    // Each method returns an object with the next method, except the last which returns a resolved promise with our fake data.
    const limitMock = vi.fn().mockResolvedValue(fakeMatches);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq({ query: { limit: "10" } });
    const res = buildRes();

    await listMatches(req as any, res);

    expect(res.json).toHaveBeenCalledWith({ data: fakeMatches });
  });

  it("returns 400 when query params are invalid", async () => {
    // limit must be a positive integer a negative number should fail validation
    const req = buildReq({ query: { limit: "-5" } });
    const res = buildRes();

    await listMatches(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid query" }),
    );
  });

  it("returns 500 when db throws", async () => {
    // Force the chain to throw at the .limit() call
    const limitMock = vi
      .fn()
      .mockRejectedValue(new Error("DB connection lost"));
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq();
    const res = buildRes();

    await listMatches(req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to fetch matches" }),
    );
  });

  it("caps limit at MAX_LIMIT of 60 even if query asks for more", async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq({ query: { limit: "999" } });
    const res = buildRes();

    await listMatches(req as any, res);

    // The controller enforces MAX_LIMIT = 60 regardless of what the client sends
    expect(limitMock).toHaveBeenCalledWith(60);
  });
});

// createMatch

describe("createMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A valid payload we can reuse across tests. Spread and override per test.
  const validBody = {
    sport: "football",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    startTime: "2099-01-01T10:00:00Z",
    endTime: "2099-01-01T12:00:00Z",
  };

  it("returns 201 with the created match", async () => {
    const fakeMatch = {
      id: 1,
      ...validBody,
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
    };

    // insert chain: db.insert().values().returning()
    const returningMock = vi.fn().mockResolvedValue([fakeMatch]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const req = buildReq({ body: validBody });
    const res = buildRes();

    await createMatch(req as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: fakeMatch });
  });

  it("calls broadcastMatchCreated when it is defined on app.locals", async () => {
    const fakeMatch = { id: 1, ...validBody };
    const returningMock = vi.fn().mockResolvedValue([fakeMatch]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    //we attach a mock broadcast function, this simulates what the WS server sets up
    const broadcastMatchCreated = vi.fn();
    const req = buildReq({ body: validBody });
    (req.app.locals as any).broadcastMatchCreated = broadcastMatchCreated;

    const res = buildRes();
    res.app.locals.broadcastMatchCreated = broadcastMatchCreated;

    await createMatch(req as any, res);

    expect(broadcastMatchCreated).toHaveBeenCalledWith(fakeMatch);
  });

  it("returns 400 when body is missing required fields", async () => {
    const req = buildReq({ body: { sport: "football" } }); // missing teams and times
    const res = buildRes();

    await createMatch(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid payload" }),
    );
  });

  it("returns 400 when endTime is before startTime", async () => {
    const req = buildReq({
      body: {
        ...validBody,
        startTime: "2099-01-01T12:00:00Z",
        endTime: "2099-01-01T10:00:00Z", // before startTime
      },
    });
    const res = buildRes();

    await createMatch(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 when db throws", async () => {
    const returningMock = vi.fn().mockRejectedValue(new Error("DB error"));
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const req = buildReq({ body: validBody });
    const res = buildRes();

    await createMatch(req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to create match" }),
    );
  });
});
