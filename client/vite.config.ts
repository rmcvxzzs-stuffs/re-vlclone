import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://localhost:9000",
      "/stream": "http://localhost:9000",
      "/hls": "http://localhost:9000",
      "/thumbnails": "http://localhost:9000",
      "/proto": {
        target: "http://localhost:9000",
        rewrite: (path) => path,
      },
    },
  },
});
