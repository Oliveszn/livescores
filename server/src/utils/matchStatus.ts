import { MATCH_STATUS } from "../validation/matches";

export function getMatchStatus(
  startTime: string,
  endTime: string,
  now = new Date(),
): "scheduled" | "live" | "finished" {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    // return null;
    throw new Error("Invalid match dates");
  }

  if (now < start) {
    return MATCH_STATUS.SCHEDULED;
  }

  if (now >= end) {
    return MATCH_STATUS.FINISHED;
  }

  return MATCH_STATUS.LIVE;
}

export async function syncMatchStatus(match: any, updateStatus: any) {
  const nextStatus = getMatchStatus(match.startTime, match.endTime);
  if (!nextStatus) {
    return match.status;
  }

  if (match.status !== nextStatus) {
    await updateStatus(nextStatus);
    match.status = nextStatus;
  }

  return match.status;
}
