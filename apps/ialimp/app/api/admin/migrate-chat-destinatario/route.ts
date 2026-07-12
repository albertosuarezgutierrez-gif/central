import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function POST() {
  if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  try {
    await prisma.$executeRaw(Prisma.sql`
      ALTER TABLE chat_hilos
        ADD COLUMN IF NOT EXISTS destinatario_tipo TEXT NOT NULL DEFAULT 'todos',
        ADD COLUMN IF NOT EXISTS destinatario_id   UUID
    `)
    await prisma.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_chat_hilos_destinatario ON chat_hilos(destinatario_id)
    `)
    return NextResponse.json({ ok: true, msg: 'Columnas destinatario añadidas' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
