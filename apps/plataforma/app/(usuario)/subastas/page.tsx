import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { evaluarOportunidad, pujaMaximaParaDescuento, yieldTuristico } from '@central/module-subastas'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'
import { tesoreriaSubastas } from '@/lib/subastas/tesoreria'
import { chollosVigentes, leerIndiceINE, pulsoMercado } from '@/lib/subastas/mercado'
import { calibracionResultados } from '@/lib/subastas/calibracion'
import { ingresoPorDormitorio } from '@/lib/subastas/rendimiento'
import SubastasClient from './SubastasClient'

export const dynamic = 'force-dynamic'

/** Primera página por SSR: la pantalla entra con datos, sin spinner inicial. */
export default async function SubastasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let inicial = null
  try {
    const [filas, total, criterios, radar, tesoreria, chollos, ingresoDorm, indice, calibracion, pulso] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${COLS_SUBASTA} FROM subastas
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
      // Chollos de venta directa desde los mismos comparables de Idealista.
      chollosVigentes().catch((e) => {
        console.error('[subastas page chollos]', e)
        return []
      }),
      // €/año por dormitorio de SUS pisos: la base del yield estimado.
      ingresoPorDormitorio().catch((e) => {
        console.error('[subastas page rendimiento]', e)
        return null
      }),
      // IPV del INE cacheado (contexto de mercado) — sin él la página vive igual.
      leerIndiceINE().catch(() => null),
      // Calibración con resultados reales; [] mientras no haya conclusiones.
      calibracionResultados().catch(() => []),
      // Pulso de enfriamiento del corpus propio (% de anuncios que bajan).
      pulsoMercado().catch(() => null),
    ])

    // El radar guarda un SNAPSHOT (sobrevive a la poda del corpus), pero se
    // escribió con las columnas que había en su pasada. Si la subasta sigue
    // viva, se pinta con la foto de HOY —así las características aparecen sin
    // esperar al cron— y si ya no está en el corpus, manda el snapshot.
    const vivas = new Map<string, ReturnType<typeof filaASubasta>>()
    // Cargas/semáforo/notas/documentos van APARTE del snapshot: la ficha del
    // radar los pinta igual que la de «Todas» (antes solo salían allí).
    const docs = new Map<string, { semaforo: string | null; analisis: unknown; notasEdicto: string | null; documentos: unknown }>()
    if (radar.length > 0) {
      const claves = radar.map((r) => r.dedupe_key as string)
      const corpus = await prisma
        .$queryRaw<any[]>(Prisma.sql`SELECT ${COLS_SUBASTA} FROM subastas WHERE dedupe_key IN (${Prisma.join(claves)})`)
        .catch((e) => {
          console.error('[subastas page radar corpus]', e)
          return [] as any[]
        })
      for (const f of corpus) {
        vivas.set(f.dedupe_key, filaASubasta(f))
        docs.set(f.dedupe_key, {
          semaforo: f.semaforo ?? null,
          analisis: f.analisis ?? null,
          notasEdicto: f.notas_edicto ?? null,
          documentos: f.documentos ?? null,
        })
      }
    }

    const c = criterios[0]
    inicial = {
      resultados: filas.map((f) => {
        const s = filaASubasta(f)
        // `filaASubasta` ya cae a la descripción registral cuando la columna
        // está vacía (mismo dato que pinta la ficha, sin recalcularlo aquí).
        const dormitorios = s.dormitorios ?? null
        const oportunidad = evaluarOportunidad(s)
        const rendimiento = ingresoDorm && dormitorios
          ? yieldTuristico(ingresoDorm.porDormitorio, dormitorios, oportunidad.coste.total)
          : null
        // Hasta cuánto pujar para que salga con ≥25% de descuento REAL.
        const pujaMaxima = oportunidad.valorMercado
          ? pujaMaximaParaDescuento(s, oportunidad.valorMercado, 0.25)
          : null
        return {
          subasta: s, oportunidad, rendimiento, dormitorios, pujaMaxima,
          notasEdicto: f.notas_edicto ?? null,
          tipoBien: f.tipo_bien ?? null,
          esPlaya: f.es_playa ?? false,
          margenFlip: f.margen_flip == null ? null : Number(f.margen_flip),
          margenFlipPct: f.margen_flip_pct == null ? null : Number(f.margen_flip_pct),
          flipApto: f.flip_apto ?? false,
          semaforo: f.semaforo ?? null,
          analisis: f.analisis ?? null,
          documentos: f.documentos ?? null,
          precioM2Zona: f.precio_m2_zona != null ? Number(f.precio_m2_zona) : null,
          muestraZona: f.muestra_zona ?? null,
          zonaPortal: f.zona_portal ?? null,
        }
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
      radar: radar.map((r) => ({
        ...r,
        subasta: vivas.get(r.dedupe_key) ?? r.subasta,
        doc: docs.get(r.dedupe_key) ?? null,
      })),
      tesoreria,
      chollos: chollos.map((ch) => ({
        ...ch,
        rendimiento: ingresoDorm && ch.comparable.habitaciones
          ? yieldTuristico(ingresoDorm.porDormitorio, ch.comparable.habitaciones, ch.comparable.precio)
          : null,
      })),
      ingresoDorm,
      indice,
      calibracion,
      pulso,
    }
  } catch (e) {
    console.error('[subastas page inicial]', e)
  }

  return <SubastasClient inicial={inicial} />
}
