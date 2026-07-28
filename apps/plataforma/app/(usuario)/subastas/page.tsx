import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { evaluarOportunidad } from '@central/module-subastas'
import { filaASubasta } from '@/lib/subastas-radar'
import { tesoreriaSubastas } from '@/lib/subastas/tesoreria'
import SubastasClient from './SubastasClient'

export const dynamic = 'force-dynamic'

/** Primera página por SSR: la pantalla entra con datos, sin spinner inicial. */
export default async function SubastasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let inicial = null
  try {
    const [filas, total, criterios, radar, tesoreria] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM subastas
        WHERE es_inmueble = true AND (fecha_fin IS NULL OR fecha_fin >= now())
        ORDER BY fecha_fin ASC NULLS LAST, actualizado_en DESC
        LIMIT 30
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM subastas
        WHERE es_inmueble = true AND (fecha_fin IS NULL OR fecha_fin >= now())
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM subastas_criterios WHERE cuenta_id = ${session.id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id, dedupe_key, subasta, puntuacion, motivos, avisos, coste_total, descuento, visto, fecha_fin
        FROM subastas_radar
        WHERE cuenta_id = ${session.id}::uuid AND descartado = false
        ORDER BY puntuacion DESC NULLS LAST, created_at DESC
        LIMIT 50
      `),
      // Si la tesorería falla (banca sin sincronizar, etc.) la pantalla sigue
      // siendo útil: el panel simplemente no se pinta.
      tesoreriaSubastas(session.id).catch((e) => {
        console.error('[subastas page tesoreria]', e)
        return null
      }),
    ])

    const c = criterios[0]
    inicial = {
      resultados: filas.map((f) => {
        const s = filaASubasta(f)
        return { subasta: s, oportunidad: evaluarOportunidad(s) }
      }),
      total: total[0]?.total ?? 0,
      criterios: {
        activo: c?.activo ?? false,
        provincias: c?.provincias ?? [],
        palabras_clave: c?.palabras_clave ?? [],
        precio_min: c?.precio_min == null ? null : Number(c.precio_min),
        precio_max: c?.precio_max == null ? null : Number(c.precio_max),
        descuento_min: c?.descuento_min ?? 0,
        excluir_ocupadas: c?.excluir_ocupadas ?? false,
      },
      radar,
      tesoreria,
    }
  } catch (e) {
    console.error('[subastas page inicial]', e)
  }

  return <SubastasClient inicial={inicial} />
}
