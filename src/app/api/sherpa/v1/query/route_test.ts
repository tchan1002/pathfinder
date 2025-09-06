import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ 
      message: "Query endpoint test", 
      received: body 
    });
  } catch (error) {
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
