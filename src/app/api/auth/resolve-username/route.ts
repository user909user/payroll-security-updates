import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { username: username.toLowerCase().trim() },
      select: { email: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Username not found" }, { status: 404 });
    }

    return NextResponse.json({ email: profile.email });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
