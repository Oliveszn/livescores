import { describe, it, expect } from "vitest";
import { getMatchStatus } from "../../utils/matchStatus";

//describe() is a container it groups related tests together under a label
//when tests faile i sould see "getmatchstatus > [test name in the output"
describe("getMatchStatus", () => {
  // We need consistent times to test against
  // Using fixed strings means tests don't break
  const past = "2020-01-01T10:00:00Z";
  const future = "2099-01-01T10:00:00Z";

  //it() is a single test case, the string describes the behaviour being tested not the code
  //Good test names read like sentences: "it returns scheduled when..."
  it("returns 'scheduled' when now is before starting time", () => {
    //getmatchstatus accepts an optional third argument 'now', instead of calling 'new Date()' and make the function unpredictable
    //we pass in a controlled time
    const result = getMatchStatus(
      future,
      "2099-06-01T10:00:00Z",
      new Date("2024-01-01T00:00:00Z"),
    );

    // expect() + .toBe() is an assertion, if result !== "scheduled", the test fails.
    expect(result).toBe("scheduled");
  });

  it("returns 'finished' when now is after end time", () => {
    const result = getMatchStatus(
      past,
      "2020-01-01T12:00:00Z",
      new Date("2025-01-01T00:00:00Z"),
    );
    expect(result).toBe("finished");
  });

  it("returns 'live' when now is between start and end time", () => {
    const start = "2020-01-01T10:00:00Z";
    const end = "2020-01-01T12:00:00Z";
    const now = new Date("2020-01-01T11:00:00Z"); // exactly halfway through

    const result = getMatchStatus(start, end, now);
    expect(result).toBe("live");
  });

  it("returns 'finished' when now exactly equals end time", () => {
    //boundary conditions are important, the code uses 'now >= end' for finished, the test verfies that eaxct boundary behaves as expected
    const start = "2020-01-01T10:00:00Z";
    const end = "2020-01-01T12:00:00Z";
    const now = new Date("2020-01-01T12:00:00Z"); // exactly at end

    const result = getMatchStatus(start, end, now);
    expect(result).toBe("finished");
  });

  // This block groups the "unhappy path" what happens when inputs are bad
  // Separating these makes the output easier to read when something breaks

  //this groups the "unhappy path" hwat happens when inputs are bad
  //seperating hese makes the output easier to read when something breaks
  describe("invalid inputs", () => {
    it("throws an error when startTime is not a valid date string", () => {
      // expect(() => ...).toThrow() — we're asserting the function throws
      // We wrap the call in an arrow function so Vitest can catch the error itself
      expect(() => getMatchStatus("not-a-date", future)).toThrow(
        "Invalid match dates",
      );
    });

    it("throws an error when endTime is not a valid date string", () => {
      expect(() => getMatchStatus(past, "also-not-a-date")).toThrow(
        "Invalid match dates",
      );
    });
  });
});
