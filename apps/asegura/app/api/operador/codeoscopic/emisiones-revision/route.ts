import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { prismaAsegura } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerPagina } from '@/lib/codeoscopic/emisiones-revision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cola de revisión del descubrimiento de emisiones de Avant2 (03/10/2026): las ABIERTAS, las de
 * actividad más reciente primero. `GET ?limite=50&desde=0`. Solo lectura, sin PII (la tabla no
 * guarda nombre ni documento). Fail-closed: un fallo es 5xx con `estado: 'error'`, nunca una lista vacía.
 */

type Fila = {
  id: string
  project_id: string
  motivo: string
  coincidencias: number | null
  ramo_vendor: string | null
  estado_emision: string | null
  compania: string | null
  numero_poliza: string | null
  cliente_id: string | null
  detalle: string | null
  veces: number
  primera_vez_at: Date
  ultima_vez_at: Date
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica().catch(() => null)
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const u = new URL(req.url)
    const { limite, desde } = leerPagina(u.searchParams.get('limite'), u.searchParams.get('desde'))
    const db = prismaAsegura()
    const [conteo] = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from codeoscopic_emisiones_revision
      where correduria_id = ${correduria.id}::uuid and resuelta_at is null`
    const filas = await db.$queryRaw<Fila[]>`
      select id::text as id, project_id_codeoscopic as project_id, motivo, coincidencias, ramo_vendor, estado_emision,
             compania, numero_poliza, cliente_id::text as cliente_id, detalle, veces, primera_vez_at, ultima_vez_at
      from codeoscopic_emisiones_revision
      where correduria_id = ${correduria.id}::uuid and resuelta_at is null
      order by ultima_vez_at desc, id
      limit ${limite} offset ${desde}`
    return NextResponse.json({
      estado: 'ok',
      total: conteo?.n ?? filas.length,
      filas: filas.map((f) => ({
        id: f.id,
        projectId: f.project_id,
        motivo: f.motivo,
        coincidencias: f.coincidencias,
        ramoVendor: f.ramo_vendor,
        estadoEmision: f.estado_emision,
        compania: f.compania,
        numeroPoliza: f.numero_poliza,
        clienteId: f.cliente_id,
        detalle: f.detalle,
        veces: f.veces,
        primeraVezAt: f.primera_vez_at.toISOString(),
        ultimaVezAt: f.ultima_vez_at.toISOString(),
      })),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: registrarErrorCartera('operador/codeoscopic/emisiones-revision', e) }, { status: 500 })
  }
}
