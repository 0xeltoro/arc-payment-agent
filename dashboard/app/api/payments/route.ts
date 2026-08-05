import { NextResponse } from "next/server";
import { getPayments } from "@/lib/server/paymentsDb";

export async function GET() {
  try {
    return NextResponse.json({ payments: getPayments() });
  } catch (err) {
    console.error("[payments] failed to read payments.db:", err);
    // Status cards live on a fully separate route/cache and are unaffected
    // either way — this just keeps a bad/corrupt db file from 500ing the
    // route instead of degrading to an empty table.
    return NextResponse.json({
      payments: [],
      error: "Payment history temporarily unavailable",
    });
  }
}
