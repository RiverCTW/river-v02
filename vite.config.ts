import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [".loca.lt", ".lhr.life"],
    port: 5182,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.RIVER_API_PORT || "8792"}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            proxyReq.setHeader("x-river-request-host", String(req.headers.host || ""));
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
