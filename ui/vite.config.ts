import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site under /<repo>/, so the base path must match.
// Locally (dev/preview) we want "/". The deploy workflow sets BASE_PATH.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? "/",
});
