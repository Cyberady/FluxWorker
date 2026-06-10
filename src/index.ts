/**
 * FluxWorker — Off-thread, on-demand.
 * Offload any pure function to a Web Worker with zero config.
 * <2KB · TypeScript-native · Auto lifecycle management
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type AnyFn = (...args: any[]) => any;

/**
 * Converts a sync function T into an async Worker-backed version.
 * Argument types and return type are fully inferred from T.
 */
export type WorkerFn<T extends AnyFn> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>;

// ─── Jank Monitor ─────────────────────────────────────────────────────────────

/**
 * Dev-mode utility that warns when a function blocks the main thread > 16ms.
 *
 * @example
 * jankMonitor.enable();
 * // Now any call that takes >16ms on the main thread logs a warning.
 */
export const jankMonitor = {
  _enabled: false,

  /** Enable jank detection (call in dev/staging only) */
  enable() {
    this._enabled = true;
  },

  /** Disable jank detection */
  disable() {
    this._enabled = false;
  },

  /**
   * Measure a function call and warn if it exceeds the 16ms frame budget.
   * @param name   - Function name shown in the warning
   * @param callFn - The function to measure and execute
   */
  measure<T>(name: string, callFn: () => T): T {
    if (!this._enabled) return callFn();
    const t0 = performance.now();
    const result = callFn();
    const ms = performance.now() - t0;
    if (ms > 16) {
      console.warn(
        `[FluxWorker] ⚠️  "${name}" blocked the main thread for ${ms.toFixed(1)}ms.\n` +
        `  → Frame budget is 16ms. Wrap it: const worker${name} = createWorker(${name});`
      );
    }
    return result;
  },
};

// ─── createWorker ─────────────────────────────────────────────────────────────

/**
 * Wraps a pure function in a Web Worker and returns a typed async version.
 *
 * **Rules for the function you pass in:**
 * - Must be a pure function (no closures, no `this`, no imported modules)
 * - All arguments must be structured-cloneable (objects, arrays, numbers, strings)
 * - The function is serialized to a string — it cannot reference outer variables
 *
 * @param fn - A pure, self-contained function to run off the main thread
 * @returns  A typed async function that resolves with fn's return value
 *
 * @example
 * const heavySort = (arr: number[]) => [...arr].sort((a, b) => a - b);
 * const workerSort = createWorker(heavySort);
 * const sorted = await workerSort([5, 3, 1, 4, 2]);
 */
export function createWorker<T extends AnyFn>(fn: T): WorkerFn<T> {
  // ── Smart Fallback: SSR / environments without Worker support ──
  if (typeof Worker === "undefined") {
    console.warn(
      "[FluxWorker] Web Workers not supported in this environment. " +
        "Falling back to synchronous execution."
    );
    return ((...args: Parameters<T>) => {
        try {
            return Promise.resolve(fn(...args));
        } catch (err) {
            return Promise.reject(err);
        }
    }) as WorkerFn<T>;
  }

  return function (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    return new Promise((resolve, reject) => {
      // ── ① Serializer Engine: fn → Blob URL ──
      const workerSrc = `
        const fn = ${fn.toString()};
        self.onmessage = function(e) {
          try {
            const result = fn(...e.data.args);
            // Handle async functions inside the worker too
            if (result && typeof result.then === 'function') {
              result
                .then(r  => self.postMessage({ id: e.data.id, result: r }))
                .catch(err => self.postMessage({ id: e.data.id, error: String(err) }));
            } else {
              self.postMessage({ id: e.data.id, result });
            }
          } catch (err) {
            self.postMessage({ id: e.data.id, error: String(err) });
          }
        };
      `;

      const blob = new Blob([workerSrc], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      // ── ② Communication Bridge: unique request ID per call ──
      const worker = new Worker(url);
      const id = Math.random().toString(36).slice(2);

      worker.postMessage({ id, args });

      // ── ③ Safety Proxy: crash → reject (never hang) ──
      worker.onmessage = (e: MessageEvent) => {
        const { result, error } = e.data;
        // ── ④ Lifecycle Manager: terminate + revoke on every exit path ──
        worker.terminate();
        URL.revokeObjectURL(url);
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      };

      worker.onerror = (e: ErrorEvent) => {
        worker.terminate();
        URL.revokeObjectURL(url);
        reject(new Error(e.message ?? "Worker crashed unexpectedly"));
      };
    });
  } as WorkerFn<T>;
}