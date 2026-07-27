import { describe, expect, it } from "vitest";
import {
  isCalendarDate,
  isCalendarDateRange,
  parseCalendarDate,
  parseCalendarDateRange
} from "../../src/resources/index.js";

describe("CalendarDate", () => {
  it.each([
    ["0001-01-01", 1, 1, 1],
    ["2000-02-29", 2000, 2, 29],
    ["2024-02-29", 2024, 2, 29],
    ["9999-12-31", 9999, 12, 31]
  ])("parses valid calendar date %s by components", (value, year, month, day) => {
    const parsed = parseCalendarDate(value);

    expect(parsed).toMatchObject({ apiValue: value, year, month, day });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(isCalendarDate(parsed)).toBe(true);
    expect(parseCalendarDate(parsed)).toBe(parsed);
  });

  it.each([
    "0000-01-01",
    "10000-01-01",
    "1900-02-29",
    "2023-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-1-01",
    "2026-01-1",
    "2026/01/01",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00:00Z",
    "",
    null,
    undefined
  ])("rejects invalid or non-exact calendar value %j", (value) => {
    expect(() => parseCalendarDate(value)).toThrow();
  });

  it("rejects structurally forged dates", () => {
    const forged = Object.freeze({
      apiValue: "2026-01-01",
      year: 2026,
      month: 1,
      day: 1,
      ordinalDay: 1
    });

    expect(isCalendarDate(forged)).toBe(false);
    expect(() => parseCalendarDate(forged)).toThrow();
  });
});

describe("CalendarDateRange", () => {
  it.each([
    ["2026-01-01", "2026-01-01", 1],
    ["2026-01-01", "2026-03-31", 90],
    ["2024-01-01", "2024-03-30", 90],
    ["1999-12-31", "2000-01-01", 2]
  ])("computes inclusive range %s through %s without Date.parse", (start, end, inclusiveDays) => {
    const range = parseCalendarDateRange(start, end);

    expect(range.inclusiveDays).toBe(inclusiveDays);
    expect(range.start.apiValue).toBe(start);
    expect(range.end.apiValue).toBe(end);
    expect(Object.isFrozen(range)).toBe(true);
    expect(isCalendarDateRange(range)).toBe(true);
  });

  it("enforces an optional inclusive-day ceiling exactly", () => {
    expect(parseCalendarDateRange("2026-01-01", "2026-03-31", { maxInclusiveDays: 90 }).inclusiveDays).toBe(
      90
    );
    expect(() =>
      parseCalendarDateRange("2026-01-01", "2026-04-01", { maxInclusiveDays: 90 })
    ).toThrow(/90 inclusive days/);
  });

  it("rejects reversed ranges and malformed ceilings", () => {
    expect(() => parseCalendarDateRange("2026-01-02", "2026-01-01")).toThrow(/must not precede/);
    for (const maxInclusiveDays of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        parseCalendarDateRange("2026-01-01", "2026-01-01", { maxInclusiveDays })
      ).toThrow(/positive integer/);
    }
  });
});
