import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ahora = new Date()
    if (ahora.getDate() !== 1) {
      return NextResponse.json({ ok: true, msg: 'Solo se ejecuta el día 1 de cada mes' })
    }
    // Mes anterior
    const prev = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    const periodo = prev.toISOString().slice(0, 7)

    const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id FROM empresas`)
    let generados = 0

    for (const emp of empresas) {
      const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM clientes WHERE empresa_id = ${emp.id}::uuid
      `)
      for (const c of clientes) {
        await fetch(new URL('/api/admin/informes/generar',
          process.env.NEXTAUTH_URL || 'https://app.ialimp.es').toString(),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-empresa-id': emp.id },
            body: JSON.stringify({ cliente_id: c.id, periodo, enviar_email: true })
          }
        ).catch(() => {})
        generados++
      }
    }

    return NextResponse.json({ ok: true, periodo, generados })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
