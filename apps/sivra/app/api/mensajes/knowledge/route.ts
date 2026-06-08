import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, property_id, category, keywords, 
             answer_es, answer_en, answer_fr, answer_de, answer_it,
             uses, active, created_at, updated_at
      FROM knowledge_base
      ORDER BY active DESC, uses DESC, id ASC
    `)
    return NextResponse.json({ entries: rows })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { id, active } = await req.json()
  try {
    await prisma.$executeRaw(Prisma.sql`UPDATE knowledge_base SET active = ${active}, updated_at = NOW() WHERE id = ${id}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  try {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM knowledge_base WHERE id = ${id}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { category, keywords, answer_es, answer_en, answer_fr, answer_de, answer_it, property_id } = await req.json()
  try {
    const kws = Array.isArray(keywords) ? keywords : (keywords as string).split(",").map((k: string) => k.trim())
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO knowledge_base (property_id, category, keywords, answer_es, answer_en, answer_fr, answer_de, answer_it, active)
      VALUES (${property_id ?? null}, ${category}, ${kws}::text[], ${answer_es ?? null}, ${answer_en ?? null}, ${answer_fr ?? null}, ${answer_de ?? null}, ${answer_it ?? null}, true)
    `)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
