import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const api = process.env.CHIRP_API ?? "http://localhost:8787";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": { target: api, changeOrigin: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          apexcharts: ["apexcharts", "vue3-apexcharts"],
        },
      },
    },
  },
});
