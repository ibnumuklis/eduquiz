import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", app: "eduquiz", time: new Date().toISOString() });
}
