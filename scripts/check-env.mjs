import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  const file = readFileSync(envPath, "utf8");
  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const rawValue = valueParts.join("=").trim();
    process.env[key] ??= rawValue.replace(/^["']|["']$/g, "");
  }
}

const required = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
];

const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error("Missing required Phase 1 environment variables:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  console.error("\nSet these in .env, then restart npm run dev.");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.startsWith("postgresql://")) {
  console.error("DATABASE_URL must be a PostgreSQL connection string.");
  console.error(
    "Example: postgresql://USER:PASSWORD@localhost:5432/lecturemind_ai?schema=public"
  );
  process.exit(1);
}

console.log("Environment looks ready for Phase 1.");
