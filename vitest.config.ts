import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // needed for Worker, Blob, URL.createObjectURL
    globals: true,
  },
});