import { defineConfig } from "vite";

// Build the room server for Node: bundle workspace TS packages (@rift/*) into a
// single dist/index.js, keep `ws` external, and let node built-ins stay external.
export default defineConfig({
  ssr: { noExternal: [/@rift\//] },
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    target: "node22",
    rollupOptions: {
      external: ["ws"],
      output: { entryFileNames: "index.js" },
    },
  },
});
