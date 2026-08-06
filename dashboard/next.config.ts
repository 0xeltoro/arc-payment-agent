import type { NextConfig } from "next";
import path from "node:path";

// The payments API route reads agent/payments.seed.json (and, locally,
// agent/payments.db) from a sibling directory one level above dashboard/ —
// see lib/server/paymentsDb.ts. That path is built from process.cwd() at
// runtime, so Vercel's static file tracer can't see it and would otherwise
// leave it out of the deployed function, making the fallback silently
// return an empty list in production. outputFileTracingRoot widens the
// trace boundary to the repo root (Vercel's "Root Directory" is set to
// dashboard/, which would otherwise become the trace root and exclude
// anything above it); outputFileTracingIncludes force-includes the seed
// file itself since it's never statically imported.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/payments": ["../agent/payments.seed.json"],
  },
};

export default nextConfig;
