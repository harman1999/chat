import { config } from "dotenv";

// Each worker needs the connection strings too, not just the global setup.
config({ path: ".env.local", quiet: true });

if (process.env.NEXT_PUBLIC_USE_MOCK !== "false") {
  throw new Error(
    "Tests must run with NEXT_PUBLIC_USE_MOCK=false, or they exercise fixtures instead of the API",
  );
}
