import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
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
