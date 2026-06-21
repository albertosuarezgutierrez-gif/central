import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Añadir columnas que faltan en propietario_gastos
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE propietario_gastos ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'otros'`)
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE propietario_gastos ADD COLUMN IF NOT EXISTS mes INT`)
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE propietario_gastos ADD COLUMN IF NOT EXISTS anio INT`)
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE propietario_gastos ADD COLUMN IF NOT EXISTS recurrente BOOLEAN DEFAULT false`)
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE propietario_gastos ADD COLUMN IF NOT EXISTS justificante_url TEXT`)
    // Tabla para ingresos manuales de reservas
    await prisma.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS propietario_ingresos (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     UUID NOT NULL,
        cliente_id     UUID NOT NULL,
        propiedad_id   UUID,
        concepto       TEXT NOT NULL,
        importe        NUMERIC(10,2) NOT NULL,
        fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
        portal         TEXT DEFAULT 'directo',
        num_noches     INT,
        notas          TEXT,
        creado_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await prisma.$executeRaw(Prisma.sql`CREATE INDEX IF NOT EXISTS idx_pingresos_cliente ON propietario_ingresos(cliente_id)`)
    await prisma.$executeRaw(Prisma.sql`CREATE INDEX IF NOT EXISTS idx_pingresos_propiedad ON propietario_ingresos(propiedad_id)`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
