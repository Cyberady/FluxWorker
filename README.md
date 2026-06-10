# ⚡ FluxWorker

> Offload any heavy function to a background thread with **one line of code**.

No separate worker files. No postMessage spaghetti. No lost type safety.

```ts
import { createWorker } from 'fluxworker';

const fib = (n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2));

const workerFib = createWorker(fib);
//    ^ TypeScript infers: (n: number) => Promise<number> 🎯

const result = await workerFib(42); // UI never freezes
```

---

## Why?

The main thread is shared between your **UI** and your **JavaScript**. Every heavy computation — parsing JSON, filtering big arrays, running algorithms — **freezes your UI** while it runs. This is the "jank" effect.

Web Workers fix this, but the standard setup requires:
- A **separate file** per worker
- Manual `postMessage` / `addEventListener` wiring
- No type safety
- Manual `.terminate()` calls to avoid memory leaks

Most developers just skip it. **FluxWorker removes every reason to skip it.**

---

## Install

```bash
npm install fluxworker
```

---

## API

### `createWorker(fn)`

Wraps a pure function and returns a typed async version that runs in a Worker.

```ts
import { createWorker } from 'fluxworker';

// Any pure function works
const processData = (data: number[]) => data.map(x => x * 2).filter(x => x > 10);

const workerProcess = createWorker(processData);

// Call it exactly like the original, but async
const result = await workerProcess([1, 5, 8, 12]);
// result is number[] — fully typed ✅
```

**Rules for your function:**
- Must be **pure** — no closures, no `this`, no imported modules
- Arguments must be **structured-cloneable** (objects, arrays, numbers, strings, typed arrays)
- The function is serialized to a string — it cannot reference outer-scope variables

---

### `jankMonitor`

A dev-mode utility. Enable it and it will warn you whenever any function blocks the main thread for more than 16ms (one frame).

```ts
import { jankMonitor } from 'fluxworker';

// Enable once in your app entry point (dev only)
if (import.meta.env.DEV) {
  jankMonitor.enable();
}

// Wrap any suspicious function to measure it
const result = jankMonitor.measure('heavyFilter', () => {
  return myBigArray.filter(complexCondition);
});

// Console output if it's slow:
// [FluxWorker] ⚠️ "heavyFilter" blocked the main thread for 47.3ms.
//   → Frame budget is 16ms. Wrap it: const workerHeavyFilter = createWorker(heavyFilter);
```

---

## Comparison

| Feature | FluxWorker | Comlink | Raw Worker |
|---|---|---|---|
| Zero separate files | ✅ | ❌ | ❌ |
| Bundle size | **<2KB** | ~5KB | 0KB |
| Promise / async-await | ✅ | ✅ | ❌ manual |
| TypeScript types inferred | ✅ automatic | ⚠️ manual | ❌ |
| Auto cleanup on done | ✅ | ❌ manual | ❌ manual |
| Jank detection built-in | ✅ | ❌ | ❌ |
| Fallback for SSR / no-Worker | ✅ | ❌ throws | ❌ throws |

---

## How it works (Architecture)

```
createWorker(fn)
      │
      ▼
① Serializer Engine
  fn.toString() → Blob URL → new Worker(url)

      │
      ▼
② Communication Bridge
  Unique request ID → postMessage({ id, args })

      │
      ▼
③ Safety Proxy (inside Worker)
  try/catch → postMessage({ id, result | error })

      │
      ▼
④ Lifecycle Manager
  worker.terminate() + URL.revokeObjectURL()
  on every resolve AND reject path
```

---

## Live Demo

[**fluxworker-demo.vercel.app**](https://fluxworker-demo.vercel.app) — See the UI freeze vs. smooth comparison in real time.

---

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Watch mode (for development)
npm run dev
```

---

## Roadmap

- [x] Phase 1 — Core `createWorker` with Serializer + Communication Bridge
- [x] Phase 2 — TypeScript generics, Jank Monitor, smart SSR fallback
- [x] Phase 3 — Live demo page
- [ ] `createWorkerPool(fn, size)` — reusable pool of N workers
- [ ] SharedArrayBuffer support for zero-copy typed array transfer
- [ ] Vite plugin for auto-wrapping annotated functions

---

## License

MIT © Aditya