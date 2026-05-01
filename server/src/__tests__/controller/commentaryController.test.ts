import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as matchController intercept db before the real file runs
// Without this, db.ts throws immediately because DATABASE_URL isn't set in tests.
vi.mock("../../db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import {
  listCommentary,
  createCommentary,
} from "../../controllers/commentaryController";
import { db } from "../../db/db";

// Helpers

function buildRes() {
  const res: any = {
    json: vi.fn(),
    status: vi.fn(),
    app: { locals: {} },
  };
  res.status.mockReturnValue(res);
  return res;
}

function buildReq(
  overrides: { body?: any; query?: any; params?: any; locals?: any } = {},
) {
  return {
    body: {},
    query: {},
    params: {},
    app: { locals: {} },
    ...overrides,
  };
}

// A valid matchId param we can reuse coerce.number() in the schema means
// it arrives as a string from the URL and gets coerced to a number.
const validParams = { id: "1" };

// listCommentary

describe("listCommentary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with data when params and query are valid", async () => {
    const fakeCommentary = [
      {
        id: 1,
        matchId: 1,
        minute: 23,
        message: "Goal!",
        createdAt: new Date(),
      },
    ];

    // Chain: db.select().from().where().orderBy().limit()
    // Commentary has one extra step (.where()) compared to matches
    // because we filter by matchId
    const limitMock = vi.fn().mockResolvedValue(fakeCommentary);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq({ params: validParams, query: { limit: "5" } });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: fakeCommentary });
  });

  it("returns 400 when matchId param is not a valid number", async () => {
    // "abc" can't be coerced to a number matchIdParamSchema should reject it
    const req = buildReq({ params: { id: "abc" } });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid match ID" }),
    );

    // Confirm we never even tried to hit the db
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 400 when matchId param is a negative number", async () => {
    // Schema uses .positive() so negative IDs should fail
    const req = buildReq({ params: { id: "-1" } });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid match ID" }),
    );
  });

  it("returns 400 when query limit is invalid", async () => {
    // Valid params, but the limit query value is not a number
    const req = buildReq({
      params: validParams,
      query: { limit: "not-a-number" },
    });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid commentary query" }),
    );
  });

  it("caps limit at MAX_LIMIT of 60", async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq({ params: validParams, query: { limit: "999" } });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(limitMock).toHaveBeenCalledWith(60);
  });

  it("returns 500 when db throws", async () => {
    const limitMock = vi
      .fn()
      .mockRejectedValue(new Error("DB connection lost"));
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const req = buildReq({ params: validParams });
    const res = buildRes();

    await listCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to fetch commentary" }),
    );
  });
});

// createCommentary

describe("createCommentary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    message: "Great tackle in midfield",
    minute: 34,
  };

  it("returns 201 with the created commentary entry", async () => {
    const fakeEntry = {
      id: 1,
      matchId: 1,
      minute: 34,
      message: "Great tackle in midfield",
      createdAt: new Date(),
    };

    // insert chain: db.insert().values().returning()
    const returningMock = vi.fn().mockResolvedValue([fakeEntry]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const req = buildReq({ params: validParams, body: validBody });
    const res = buildRes();

    await createCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: fakeEntry });
  });

  it("inserts with the matchId taken from params, not body", async () => {
    // This is an important behavioural test, the matchId should always come
    // from the URL param, never from the request body. A client shouldn't be
    // able to insert commentary for a different match by sending a matchId in body.
    const fakeEntry = {
      id: 1,
      matchId: 1,
      message: "Test",
      createdAt: new Date(),
    };

    const returningMock = vi.fn().mockResolvedValue([fakeEntry]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const req = buildReq({ params: { id: "42" }, body: validBody });
    const res = buildRes();

    await createCommentary(req as any, res);

    // The values() call should have received matchId: 42 from params
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 42 }),
    );
  });

  it("calls broadcastCommentary with matchId and the new entry", async () => {
    const fakeEntry = {
      id: 1,
      matchId: 1,
      message: "Test",
      createdAt: new Date(),
    };

    const returningMock = vi.fn().mockResolvedValue([fakeEntry]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const broadcastCommentary = vi.fn();
    const req = buildReq({ params: validParams, body: validBody });
    (req.app.locals as any).broadcastMatchCreated = broadcastCommentary;

    const res = buildRes();
    res.app.locals.broadcastCommentary = broadcastCommentary;

    await createCommentary(req as any, res);

    expect(broadcastCommentary).toHaveBeenCalledWith(
      fakeEntry.matchId,
      fakeEntry,
    );
  });

  it("returns 400 when matchId param is invalid", async () => {
    const req = buildReq({ params: { id: "abc" }, body: validBody });
    const res = buildRes();

    await createCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid match ID" }),
    );

    // Param validation should short-circuit, body never gets parsed, db never called
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required message field", async () => {
    const req = buildReq({ params: validParams, body: {} });
    const res = buildRes();

    await createCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid commentary payload" }),
    );
  });

  it("returns 500 when db throws", async () => {
    const returningMock = vi.fn().mockRejectedValue(new Error("DB error"));
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    const req = buildReq({ params: validParams, body: validBody });
    const res = buildRes();

    await createCommentary(req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Failed to create commentary" }),
    );
  });
});
