import { Request, Response } from "express";
import { createMatchSchema, listMatchQuerySchema } from "../validation/matches";
import { db } from "../db/db";
import { matches } from "../db/schema";
import { getMatchStatus } from "../utils/matchStatus";

const MAX_LIMIT = 60;

export async function listMatches(req: Request, res: Response): Promise<void> {
  const parsed = listMatchQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }

  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(matches.createdAt)
      .limit(limit);

    res.json({ data });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch matches",
    });
  }
}

export async function createMatch(req: Request, res: Response): Promise<void> {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.issues });
    return;
  }

  const { startTime, endTime, homeScore, awayScore } = parsed.data;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime),
      })
      .returning();

    if (req.app.locals.broadcastMatchCreated) {
      req.app.locals.broadcastMatchCreated(event);
    }

    res.status(201).json({ data: event });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create match",
      details: JSON.stringify(error),
    });
  }
}
