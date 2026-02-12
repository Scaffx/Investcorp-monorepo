import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseDateValue, resolveSlaDate, getSlaInfo } from "../src/helpers";

const toDate = (year, month, day) => new Date(year, month - 1, day);

const expectSameDate = (actual, expected) => {
  expect(actual).toBeInstanceOf(Date);
  expect(actual.getTime()).toBe(expected.getTime());
};

describe("parseDateValue", () => {
  it("parses ISO date strings to the start of the day", () => {
    const parsed = parseDateValue("2024-01-15");
    expectSameDate(parsed, toDate(2024, 1, 15));
  });

  it("parses BR formatted date strings", () => {
    const parsed = parseDateValue("15/02/2024");
    expectSameDate(parsed, toDate(2024, 2, 15));
  });

  it("normalizes Date instances to the start of the day", () => {
    const parsed = parseDateValue(new Date(2024, 3, 10, 15, 30));
    expectSameDate(parsed, toDate(2024, 4, 10));
  });

  it("returns null for invalid or empty values", () => {
    expect(parseDateValue("not-a-date")).toBeNull();
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue(null)).toBeNull();
  });
});

describe("resolveSlaDate", () => {
  it("returns the explicit SLA date when provided", () => {
    expectSameDate(resolveSlaDate({ slaDias: "2024-03-20" }), toDate(2024, 3, 20));
    expectSameDate(resolveSlaDate({ slaDias: "20/03/2024" }), toDate(2024, 3, 20));
  });

  it("adds numeric SLA days to the acionamento date", () => {
    expectSameDate(resolveSlaDate({ slaDias: 3, dataAcionamento: "2024-01-10" }), toDate(2024, 1, 13));
  });

  it("falls back to createdAt when acionamento is missing", () => {
    expectSameDate(resolveSlaDate({ slaDias: 2, createdAt: "2024-02-01" }), toDate(2024, 2, 3));
  });

  it("returns null when SLA is not provided", () => {
    expect(resolveSlaDate({ slaDias: "" })).toBeNull();
    expect(resolveSlaDate({})).toBeNull();
  });
});

describe("getSlaInfo", () => {
  const fixedNow = new Date(2024, 0, 10, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags overdue items", () => {
    const info = getSlaInfo({ slaDias: "2024-01-05" });
    expect(info.text).toBe("ATRASADO 5 DIAS");
    expect(info.variant).toBe("late");
    expect(info.daysDiff).toBe(-5);
    expect(info.dateLabel).toBe("05/01/2024");
  });

  it("indicates when items are due soon", () => {
    const info = getSlaInfo({ slaDias: "2024-01-12" });
    expect(info.text).toBe("2 dias restantes");
    expect(info.variant).toBe("due-soon");
    expect(info.daysDiff).toBe(2);
    expect(info.dateLabel).toBe("12/01/2024");
  });

  it("describes concluded items finished after the SLA", () => {
    const info = getSlaInfo({
      slaDias: "2024-01-10",
      status: "CONCLUIDO",
      concluidoEm: "2024-01-15",
    });
    expect(info.text).toBe("Concluído (atrasado 5 dias)");
    expect(info.variant).toBe("done-late");
    expect(info.daysDiff).toBe(-5);
  });

  it("describes concluded items finished before the SLA", () => {
    const info = getSlaInfo({
      slaDias: "2024-01-15",
      status: "CONCLUIDO",
      concluidoEm: "2024-01-10",
    });
    expect(info.text).toBe("Concluído (faltavam 5 dias)");
    expect(info.variant).toBe("done");
    expect(info.daysDiff).toBe(5);
  });
});
