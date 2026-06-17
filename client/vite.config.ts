import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://localhost:9000",
      "/stream": "http://localhost:9000",
      "/proto": {
        target: "http://localhost:9000",
        rewrite: (path) => path,
      },
    },
  },
});
