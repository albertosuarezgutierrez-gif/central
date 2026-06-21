import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // 1. Crear tabla chat_hilos
    await prisma.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS chat_hilos (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id    UUID NOT NULL,
        tipo          TEXT NOT NULL DEFAULT 'general',
        titulo        TEXT NOT NULL,
        contexto_id   UUID,
        visibilidad   TEXT NOT NULL DEFAULT 'todos',
        cliente_id    UUID,
        creado_por    TEXT DEFAULT 'admin',
        creado_at     TIMESTAMPTZ DEFAULT NOW(),
        ultimo_msg_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // 2. Añadir hilo_id a chat_mensajes
    await prisma.$executeRaw(Prisma.sql`
      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS hilo_id UUID
    `)

    // 3. Índices
    await prisma.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_chat_hilos_empresa ON chat_hilos(empresa_id)
    `)
    await prisma.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_chat_hilos_tipo ON chat_hilos(tipo)
    `)
    await prisma.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_chat_mensajes_hilo ON chat_mensajes(hilo_id)
    `)

    return NextResponse.json({ ok: true, msg: 'Migración completada' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
