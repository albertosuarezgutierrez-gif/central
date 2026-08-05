// ────────────────────────────────────────────────────────────────────────────
// Re-extracción de los datos que viven en el TEXTO registral.
//
// Por qué existe (05/08/2026). `extraerDatos` solo se ejecutaba en la INGESTA,
// al dar de alta la subasta. Así que cuando el extractor mejora, el corpus vivo
// no se entera: una finca que se ingirió cuando el parser aún no entendía su
// redacción se queda con `superficie` a NULL PARA SIEMPRE, y sin superficie no
// hay valor de mercado, ni margen de flip, ni ranking de rentabilidad. De 17
// subastas vigentes, 12 estaban así — y dos de ellas publicaban su superficie
// en la descripción, en la fórmula registral con coma que el extractor no
// reconocía («setenta y siete metros, diecinueve decímetros cuadrados»).
//
// Es un paso barato y sin red: relee la descripción que ya está en la BD.
//
// CONSERVADOR con lo que comparte fuente, RE-DERIVADO con lo que no. Las
// columnas que otra fuente (la ficha del BOE, el Catastro) también rellena solo
// se tocan si están a NULL: si una pasada del extractor empeorase, no puede
// borrar lo que otro averiguó. `tipo_bien` es la excepción y va aparte, porque
// su ÚNICA fuente es este texto — ahí un COALESCE no protege el trabajo de
// nadie, solo congela la lectura de la versión vieja del parser (ver el
// comentario en el UPDATE).
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { extraerDatos } from '@central/module-subastas'

interface FilaTexto {
  dedupe_key: string
  descripcion: string | null
}

export interface ResultadoReextraccion {
  revisadas: number
  /** Filas donde se ha rellenado al menos un hueco. */
  completadas: number
  /** De esas, cuántas ganaron la superficie (la que desbloquea el margen). */
  conSuperficie: number
}

/**
 * Vuelve a extraer del texto los datos que falten en las subastas VIGENTES.
 *
 * La cola son TODAS las vigentes con descripción, no solo las que tienen un
 * hueco: desde que `tipo_bien` se re-deriva, una fila sin huecos puede seguir
 * teniendo un valor que el parser de hoy leería distinto, y filtrarla por
 * «le falta algo» la dejaría con la lectura vieja para siempre. Puede hacerse
 * así porque el paso es CPU pura sobre texto que ya está en la BD —ni red ni
 * IA— y quien evita las escrituras repetidas es el guardián del `WHERE`, no la
 * cola. Lo que nunca esté en el texto (la mayoría de las descripciones del BOE
 * son una línea) seguirá sin rellenarse, y eso es correcto: es un hueco real,
 * no un pendiente. El tope acota la pasada si el corpus crece mucho.
 */
export async function reextraerDatosDeTexto(max = 60): Promise<ResultadoReextraccion> {
  const filas = await prisma.$queryRaw<FilaTexto[]>(Prisma.sql`
    SELECT dedupe_key, descripcion
    FROM subastas
    WHERE archivada_at IS NULL
      AND es_inmueble = true
      AND descripcion IS NOT NULL
      AND (fecha_fin IS NULL OR fecha_fin >= now())
    ORDER BY fecha_fin ASC NULLS LAST
    LIMIT ${max}
  `)

  let completadas = 0
  let conSuperficie = 0

  for (const f of filas) {
    const d = extraerDatos(f.descripcion ?? '')
    // Sin nada nuevo que aportar, ni se toca la fila (así `actualizado_en` sigue
    // significando «algo cambió» y no «el cron pasó por aquí»).
    const algo: boolean = d.superficie != null || d.tipoBien != null || d.direccion != null ||
      d.fincaRegistral != null || d.registroPropiedad != null ||
      d.dormitorios != null || d.banos != null || d.planta != null
    if (!algo) continue

    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        superficie = COALESCE(superficie, ${d.superficie ?? null}),
        -- OJO: aquí NO vale COALESCE, al revés que en el resto. La columna
        -- tipo_bien tiene UNA sola fuente —esta misma descripción— así que un
        -- COALESCE no protege el trabajo de nadie: solo congela para siempre la
        -- lectura de la versión vieja del extractor. La unifamiliar de Alcalá
        -- del Río (SUB-JA-2026-264398) siguió marcada "garaje" en BD después de
        -- arreglar tipoBien (PR #1265), y esa columna es la que filtra
        -- GET /api/subastas y pinta el mapa: la casa quedaba invisible al
        -- filtrar por vivienda. Se re-deriva siempre que el texto dé un tipo.
        -- Mismo razonamiento que el CASE de cargas en documentos.ts (#1250).
        tipo_bien = COALESCE(${d.tipoBien ?? null}, tipo_bien),
        direccion = COALESCE(direccion, ${d.direccion ?? null}),
        finca_registral = COALESCE(finca_registral, ${d.fincaRegistral ?? null}),
        registro_propiedad = COALESCE(registro_propiedad, ${d.registroPropiedad ?? null}),
        dormitorios = COALESCE(dormitorios, ${d.dormitorios ?? null}),
        banos = COALESCE(banos, ${d.banos ?? null}),
        planta = COALESCE(planta, ${d.planta ?? null}),
        cuota_participacion = COALESCE(cuota_participacion, ${d.cuotaParticipacion ?? null}),
        actualizado_en = now()
      WHERE dedupe_key = ${f.dedupe_key}
        -- Solo si de verdad hay algo que cambiar: sin esto la pasada
        -- reescribiría las mismas filas cada día sin cambiar nada. Es este
        -- guardián —y no la cola— el que hace idempotente la re-extracción.
        AND (
          (superficie IS NULL AND ${d.superficie ?? null}::numeric IS NOT NULL)
          -- tipo_bien se COMPARA, no se mira si está vacío: se re-deriva.
          OR (${d.tipoBien ?? null}::text IS NOT NULL AND tipo_bien IS DISTINCT FROM ${d.tipoBien ?? null}::text)
          OR (direccion IS NULL AND ${d.direccion ?? null}::text IS NOT NULL)
          OR (finca_registral IS NULL AND ${d.fincaRegistral ?? null}::text IS NOT NULL)
          OR (registro_propiedad IS NULL AND ${d.registroPropiedad ?? null}::text IS NOT NULL)
          OR (dormitorios IS NULL AND ${d.dormitorios ?? null}::int IS NOT NULL)
          OR (banos IS NULL AND ${d.banos ?? null}::int IS NOT NULL)
          OR (planta IS NULL AND ${d.planta ?? null}::text IS NOT NULL)
        )
    `)
    if (n > 0) {
      completadas++
      if (d.superficie != null) conSuperficie++
    }
  }

  return { revisadas: filas.length, completadas, conSuperficie }
}
