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
  // Lotes (12/09/2026): el mapa entero (~4,5 MB) ya no cabe en un POST de Vercel (413), así que
  // scripts/mapa-arquitectura-inyectar.mjs lo manda partido en { lote, total }. Sin esos campos se
  // trata como un único lote (compatibilidad con el envío entero de antes).
  const lote: number = typeof body?.lote === 'number' ? body.lote : 1
  const total: number = typeof body?.total === 'number' ? body.total : 1
  if (!archivos.length) return NextResponse.json({ error: 'archivos requerido (array no vacío)' }, { status: 400 })
  if (!sha) return NextResponse.json({ error: 'sha requerido: es lo que separa el mapa nuevo del viejo al borrar' }, { status: 400 })
  if (lote < 1 || total < 1 || lote > total) return NextResponse.json({ error: 'lote/total ≥1 y lote ≤ total' }, { status: 400 })

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
      // El `sha` se estampa SIEMPRE (es la marca de «este archivo sigue existiendo en esta pasada»);
      // `updated_at` solo cambia cuando cambia el contenido (hash), que es lo que lee la frescura del
      // Director de código. Antes el WHERE saltaba la fila entera y el sha se quedaba viejo — con el
      // borrado por sha de abajo eso habría borrado todos los archivos sin cambios.
      upserts += await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mapa_arquitectura (ruta, ambito, resumen, funciones, tablas, ruta_api, hash, sha, busqueda, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (ruta) DO UPDATE SET
          ambito = EXCLUDED.ambito, resumen = EXCLUDED.resumen, funciones = EXCLUDED.funciones,
          tablas = EXCLUDED.tablas, ruta_api = EXCLUDED.ruta_api, hash = EXCLUDED.hash,
          sha = EXCLUDED.sha, busqueda = EXCLUDED.busqueda,
          updated_at = CASE WHEN mapa_arquitectura.hash IS DISTINCT FROM EXCLUDED.hash THEN now() ELSE mapa_arquitectura.updated_at END`)
    }
    // Borra los archivos que ya no existen (renombrados/eliminados): solo en el ÚLTIMO lote y por
    // `sha`, no por la lista de rutas — con el mapa partido en lotes ningún POST trae la lista entera.
    let borradas: number | null = null
    if (lote === total) {
      borradas = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM mapa_arquitectura WHERE sha IS DISTINCT FROM ${sha}`)
    }

    return NextResponse.json({ ok: true, lote, total, recibidas: filas.length, upserts, borradas, sha })
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'error'
    return NextResponse.json({ error: 'fallo al inyectar el mapa', detalle: msg }, { status: 500 })
  }
}
