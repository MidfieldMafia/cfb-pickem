import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Vercel injects env at build time. Locally, `vercel env pull` writes .env.local.
if (!process.env.DATABASE_URL_UNPOOLED && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Direct (unpooled) connection for migrations, per the Neon research.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
