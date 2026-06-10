/**
 * FluxWorker — Test Suite
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorker, jankMonitor } from "../src/index";

// ─── createWorker Tests ───────────────────────────────────────────────────────

describe("createWorker", () => {
  it("Phase 1 — runs a basic function off the main thread", async () => {
    const square = (n: number) => n * n;
    const workerSquare = createWorker(square);
    const result = await workerSquare(7);
    expect(result).toBe(49);
  });

  it("Phase 1 — works with multiple arguments", async () => {
    const add = (a: number, b: number) => a + b;
    const workerAdd = createWorker(add);
    const result = await workerAdd(3, 4);
    expect(result).toBe(7);
  });

  it("Phase 1 — works with array input", async () => {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const workerSum = createWorker(sum);
    const result = await workerSum([1, 2, 3, 4, 5]);
    expect(result).toBe(15);
  });

  it("Phase 1 — works with string input", async () => {
    const shout = (s: string) => s.toUpperCase();
    const workerShout = createWorker(shout);
    const result = await workerShout("hello fluxworker");
    expect(result).toBe("HELLO FLUXWORKER");
  });

  it("Phase 1 — returns a Promise", () => {
    const noop = (n: number) => n;
    const workerNoop = createWorker(noop);
    const r = workerNoop(1);
    expect(r).toBeInstanceOf(Promise);
  });

  it("Phase 2 — rejects gracefully when the function throws", async () => {
    const boom = (_: number) => {
      throw new Error("intentional crash");
    };
    const workerBoom = createWorker(boom);
    await expect(workerBoom(1)).rejects.toThrow("intentional crash");
  });

  it("Phase 2 — can run multiple workers concurrently", async () => {
    const slow = (n: number) => {
      let x = 0;
      for (let i = 0; i < 1_000_000; i++) x += i;
      return n + x;
    };
    const workerSlow = createWorker(slow);
    const [a, b, c] = await Promise.all([
      workerSlow(1),
      workerSlow(2),
      workerSlow(3),
    ]);
    expect(b - a).toBe(1);
    expect(c - b).toBe(1);
  });

  it("Phase 3 — fib(10) returns correct result", async () => {
    const fib = (n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2));
    const workerFib = createWorker(fib);
    const result = await workerFib(10);
    expect(result).toBe(55);
  });

  it("Phase 3 — works with object return value", async () => {
    const analyze = (arr: number[]) => ({
      min: Math.min(...arr),
      max: Math.max(...arr),
      sum: arr.reduce((a, b) => a + b, 0),
    });
    const workerAnalyze = createWorker(analyze);
    const result = await workerAnalyze([3, 1, 4, 1, 5]);
    expect(result).toEqual({ min: 1, max: 5, sum: 14 });
  });
});

// ─── jankMonitor Tests ────────────────────────────────────────────────────────

describe("jankMonitor", () => {
  beforeEach(() => {
    jankMonitor.enable();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jankMonitor.disable();
    vi.restoreAllMocks();
  });

  it("logs a warning when a function runs longer than 16ms", () => {
    // Simulate a slow function by mocking performance.now
    let call = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (call++ === 0 ? 0 : 100));

    jankMonitor.measure("slowFn", () => "result");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("blocked the main thread")
    );
  });

  it("does NOT warn for fast functions", () => {
    vi.spyOn(performance, "now").mockImplementation(() => 0);
    jankMonitor.measure("fastFn", () => "result");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns the function result even when warning fires", () => {
    const result = jankMonitor.measure("fn", () => 42);
    expect(result).toBe(42);
  });

  it("does nothing when disabled", () => {
    jankMonitor.disable();
    vi.spyOn(performance, "now").mockImplementation(() => {
      return Date.now();
    });
    jankMonitor.measure("fn", () => {});
    expect(console.warn).not.toHaveBeenCalled();
  });
});