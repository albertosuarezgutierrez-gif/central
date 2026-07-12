import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generarInforme } from '@/lib/informes'

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
        // Invocación DIRECTA de la lógica (sin sub-fetch HTTP): el fetch no
        // mandaba cookie ni Bearer y `generar` usa requireEmpresaId() (cookie),
        // así que devolvía 401 silencioso → los informes nunca se generaban.
        // Ahora se pasa el empresa_id EXPLÍCITO por cada empresa del bucle.
        try {
          await generarInforme({ empresa_id: emp.id, cliente_id: c.id, periodo, enviar_email: true })
          generados++
        } catch (_) {}
      }
    }

    return NextResponse.json({ ok: true, periodo, generados })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
