import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(() => ({
  base: "/",
  build: { outDir: "../../dist", emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // En dev (port 5173), on relaie les appels API vers le serveur PHP admin.
    // Le cookie SSO (scopé sur le host "localhost", pas le port) est transmis.
    proxy: {
      "/admin/api.php": {
        target: "http://localhost:8003",
        changeOrigin: false,
      },
      "/admin/proxy.php": {
        target: "http://localhost:8003",
        changeOrigin: false,
      },
    },
  },
}));
