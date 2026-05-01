import { Request, Response } from "express";
import { matchIdParamSchema } from "../validation/matches";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary";
import { commentary } from "../db/schema";
import { db } from "../db/db";
import { eq, desc } from "drizzle-orm";

const MAX_LIMIT = 60;

export async function listCommentary(
  req: Request,
  res: Response,
): Promise<void> {
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    res
      .status(400)
      .json({ error: "Invalid match ID", details: paramsResult.error.issues });
    return;
  }

  const queryResult = listCommentaryQuerySchema.safeParse(req.query);

  if (!queryResult.success) {
    res.status(400).json({
      error: "Invalid commentary query",
      details: queryResult.error.issues,
    });
    return;
  }

  try {
    const { id: matchId } = paramsResult.data;
    const { limit = 10 } = queryResult.data;

    const safeLimit = Math.min(limit, MAX_LIMIT);

    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(safeLimit);

    res.status(200).json({ data: results });
  } catch (error) {
    console.error("Failed to fetch commentary:", error);
    res.status(500).json({ error: "Failed to fetch commentary" });
  }
}

export async function createCommentary(
  req: Request,
  res: Response,
): Promise<void> {
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    res
      .status(400)
      .json({ error: "Invalid match ID", details: paramsResult.error.issues });
    return;
  }

  const bodyResult = createCommentarySchema.safeParse(req.body);

  if (!bodyResult.success) {
    res.status(400).json({
      error: "Invalid commentary payload",
      details: bodyResult.error.issues,
    });
    return;
  }

  try {
    const { minute, ...rest } = bodyResult.data;
    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramsResult.data.id,
        minute,
        ...rest,
      })
      .returning();

    if (req.app.locals.broadcastCommentary) {
      req.app.locals.broadcastCommentary(result.matchId, result);
    }

    res.status(201).json({ data: result });
  } catch (error) {
    console.error("Failed to create commentary", error);
    res.status(500).json({ error: "Failed to create commentary" });
  }
}
