const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const calendarDates = new WeakSet<object>();
const calendarDateRanges = new WeakSet<object>();

export interface CalendarDate {
  readonly apiValue: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly ordinalDay: number;
}

export interface CalendarDateRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly inclusiveDays: number;
}

export interface CalendarDateRangeOptions {
  readonly maxInclusiveDays?: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function daysBeforeYear(year: number): number {
  const priorYear = year - 1;
  return (
    priorYear * 365 +
    Math.floor(priorYear / 4) -
    Math.floor(priorYear / 100) +
    Math.floor(priorYear / 400)
  );
}

function daysBeforeMonth(year: number, month: number): number {
  const offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;
  const offset = offsets[month - 1];
  if (offset === undefined) {
    throw new Error("Calendar month is outside the supported range");
  }
  return offset + (month > 2 && isLeapYear(year) ? 1 : 0);
}

function toOrdinalDay(year: number, month: number, day: number): number {
  return daysBeforeYear(year) + daysBeforeMonth(year, month) + day;
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  return typeof value === "object" && value !== null && calendarDates.has(value);
}

export function isCalendarDateRange(value: unknown): value is CalendarDateRange {
  return typeof value === "object" && value !== null && calendarDateRanges.has(value);
}

export function parseCalendarDate(value: unknown): CalendarDate {
  if (isCalendarDate(value)) return value;
  if (typeof value !== "string") {
    throw new Error("Calendar date must be a YYYY-MM-DD string");
  }

  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error("Calendar date must use the exact YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("Calendar year must be from 0001 through 9999");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Calendar month must be from 01 through 12");
  }
  const maximumDay = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maximumDay) {
    throw new Error(`Calendar day is invalid for ${match[1]}-${match[2]}`);
  }

  const parsed: CalendarDate = Object.freeze({
    apiValue: value,
    year,
    month,
    day,
    ordinalDay: toOrdinalDay(year, month, day)
  });
  calendarDates.add(parsed);
  return parsed;
}

export function parseCalendarDateRange(
  startValue: unknown,
  endValue: unknown,
  options: CalendarDateRangeOptions = {}
): CalendarDateRange {
  const start = parseCalendarDate(startValue);
  const end = parseCalendarDate(endValue);
  if (end.ordinalDay < start.ordinalDay) {
    throw new Error("Calendar date range end must not precede its start");
  }

  const inclusiveDays = end.ordinalDay - start.ordinalDay + 1;
  const maxInclusiveDays = options.maxInclusiveDays;
  if (
    maxInclusiveDays !== undefined &&
    (!Number.isInteger(maxInclusiveDays) || maxInclusiveDays < 1)
  ) {
    throw new Error("maxInclusiveDays must be a positive integer");
  }
  if (maxInclusiveDays !== undefined && inclusiveDays > maxInclusiveDays) {
    throw new Error(`Calendar date range must not exceed ${maxInclusiveDays} inclusive days`);
  }

  const range: CalendarDateRange = Object.freeze({
    start,
    end,
    inclusiveDays
  });
  calendarDateRanges.add(range);
  return range;
}
