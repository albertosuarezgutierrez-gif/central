// /api/internal/mapa-arquitectura — Puerto de INYECCIÓN del índice de funciones en Supabase.
// Lo llama el workflow .github/workflows/auditoria.yml (solo desde main) con el contenido de
// docs/mapa-funciones.generated.json. Upsert idempotente por `ruta` (salta no-ops por `hash`)
// + borra las filas de archivos que ya no existen. Auth: Bearer CRON_SECRET (o ?secret=).
// Así el SHA/DATABASE_URL NUNCA viajan a CI: CI solo necesita PLATAFORMA_URL + CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type FuncionIdx = {
  nombre: string; kind: string; exportada?: boolean
  params?: string; retorno?: string | null; linea?: number; resumen?: string
}
type ArchivoIdx = {
  ruta: string; ambito?: string; resumen?: string
  funciones?: FuncionIdx[]; tablas?: string[]; rutaApi?: string | null; hash?: string
}

const CHUNK = 300 // ~9 params/fila → <2700 params/statement (bajo el tope de Postgres)

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const archivos: ArchivoIdx[] = Array.isArray(body?.archivos) ? body.archivos : []
  const sha: string = typeof body?.sha === 'string' ? body.sha : ''
  if (!archivos.length) return NextResponse.json({ error: 'archivos requerido (array no vacío)' }, { status: 400 })

  // Campo de búsqueda para el índice trigram: ruta + resumen + nombres de función.
  const filas = archivos
    .filter(a => a && typeof a.ruta === 'string' && a.ruta)
    .map(a => {
      const nombres = (a.funciones ?? []).map(f => f.nombre).filter(Boolean)
      const busqueda = [a.ruta, a.resumen ?? '', nombres.join(' ')].join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
      return {
        ruta: a.ruta,
        ambito: a.ambito ?? null,
        resumen: a.resumen ?? null,
        funciones: JSON.stringify(a.funciones ?? []),
        tablas: Array.isArray(a.tablas) ? a.tablas : [],
        rutaApi: a.rutaApi ?? null,
        hash: a.hash ?? null,
        busqueda,
      }
    })

  try {
    let upserts = 0
    for (let i = 0; i < filas.length; i += CHUNK) {
      const chunk = filas.slice(i, i + CHUNK)
      const values = chunk.map(f => Prisma.sql`(${f.ruta}, ${f.ambito}, ${f.resumen}, ${f.funciones}::jsonb, ${f.tablas}::text[], ${f.rutaApi}, ${f.hash}, ${sha}, ${f.busqueda}, now())`)
      upserts += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mapa_arquitectura (ruta, ambito, resumen, funciones, tablas, ruta_api, hash, sha, busqueda, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (ruta) DO UPDATE SET
          ambito = EXCLUDED.ambito, resumen = EXCLUDED.resumen, funciones = EXCLUDED.funciones,
          tablas = EXCLUDED.tablas, ruta_api = EXCLUDED.ruta_api, hash = EXCLUDED.hash,
          sha = EXCLUDED.sha, busqueda = EXCLUDED.busqueda, updated_at = now()
        WHERE mapa_arquitectura.hash IS DISTINCT FROM EXCLUDED.hash`)
    }
    // Borra los archivos que ya no existen (renombrados/eliminados).
    const rutas = filas.map(f => f.ruta)
    const borradas = await prisma.$executeRaw(Prisma.sql`
      DELETE FROM mapa_arquitectura WHERE ruta <> ALL(${rutas}::text[])`)

    return NextResponse.json({ ok: true, recibidas: filas.length, upserts, borradas, sha: sha || null })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'error'
    return NextResponse.json({ error: 'fallo al inyectar el mapa', detalle: msg }, { status: 500 })
  }
}
