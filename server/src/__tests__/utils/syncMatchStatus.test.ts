import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncMatchStatus } from "../../utils/matchStatus";

describe("syncMatchStatus", () => {
  // vi.fn() creates a mock function — it does nothing by default but tracks
  // every call made to it. We can then ask: was it called? With what arguments?
  // We declare it here so every test in this block has access to it.
  const updateStatus = vi.fn();

  // beforeEach runs before every single it() in this describe block.
  // We clear the mock so call history from one test doesn't bleed into the next.
  // Without this, if test 1 calls updateStatus once, test 2 would see 2 total calls.
  beforeEach(() => {
    updateStatus.mockClear();
  });

  it("does not call updateStatus when status is already correct", async () => {
    // We build a match that is definitively in the past so getMatchStatus
    // will always return "finished" — no ambiguity, no flakiness.
    const match = {
      startTime: "2020-01-01T10:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
      status: "finished", // already matches what getMatchStatus will return
    };

    const result = await syncMatchStatus(match, updateStatus);

    // The status was already correct — no DB write should happen.
    expect(updateStatus).not.toHaveBeenCalled();

    // The returned status should be unchanged.
    expect(result).toBe("finished");
  });

  it("calls updateStatus with the new status when status is outdated", async () => {
    const match = {
      startTime: "2020-01-01T10:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
      status: "scheduled", // wrong — this match is clearly in the past
    };

    const result = await syncMatchStatus(match, updateStatus);

    // updateStatus should have been called exactly once...
    expect(updateStatus).toHaveBeenCalledTimes(1);

    // ...and called with the correct new status, not something arbitrary.
    expect(updateStatus).toHaveBeenCalledWith("finished");

    // The returned value should reflect the updated status.
    expect(result).toBe("finished");
  });

  it("mutates the match object's status when updating", async () => {
    // syncMatchStatus does match.status = nextStatus internally.
    // This test verifies that side effect explicitly — the caller's object is updated.
    // This matters because callers might rely on the match object being up to date
    // after the call, not just the return value.
    const match = {
      startTime: "2020-01-01T10:00:00Z",
      endTime: "2020-01-01T12:00:00Z",
      status: "live",
    };

    await syncMatchStatus(match, updateStatus);

    expect(match.status).toBe("finished");
  });

  it("bubbles up an error when match dates are invalid", async () => {
    const match = {
      startTime: "not-a-date",
      endTime: "2020-01-01T12:00:00Z",
      status: "scheduled",
    };

    // syncMatchStatus is async so we need rejects.toThrow() instead of
    // the plain toThrow() we used for the synchronous getMatchStatus.
    // rejects unwraps the rejected promise so Vitest can inspect the error.
    await expect(syncMatchStatus(match, updateStatus)).rejects.toThrow(
      "Invalid match dates",
    );

    // Also confirm no DB write was attempted on bad data.
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
