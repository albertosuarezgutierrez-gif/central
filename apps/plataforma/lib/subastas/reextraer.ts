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
// Es un paso barato y sin red: relee la descripción que ya está en la BD. Y es
// CONSERVADOR por construcción — solo rellena columnas que están a NULL, nunca
// pisa un dato existente. Si una pasada del extractor empeorase, no puede
// borrar lo que otra fuente (la ficha, el Catastro) ya había averiguado.
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
 * La cola son las filas con algún hueco extraíble, no «las no procesadas»: no
 * hay marca de versión de extractor porque no hace falta — al rellenar solo
 * NULLs, la pasada es idempotente y la fila deja de aparecer en cuanto se
 * completa. Lo que nunca esté en el texto (la mayoría de las descripciones del
 * BOE son una línea) seguirá saliendo, y eso es correcto: es un hueco real, no
 * un pendiente. El tope evita que una pasada se alargue por el tamaño del corpus.
 */
export async function reextraerDatosDeTexto(max = 60): Promise<ResultadoReextraccion> {
  const filas = await prisma.$queryRaw<FilaTexto[]>(Prisma.sql`
    SELECT dedupe_key, descripcion
    FROM subastas
    WHERE archivada_at IS NULL
      AND es_inmueble = true
      AND descripcion IS NOT NULL
      AND (fecha_fin IS NULL OR fecha_fin >= now())
      AND (
        superficie IS NULL OR tipo_bien IS NULL OR direccion IS NULL
        OR finca_registral IS NULL OR registro_propiedad IS NULL
        OR dormitorios IS NULL OR banos IS NULL OR planta IS NULL
      )
    ORDER BY fecha_fin ASC NULLS LAST
    LIMIT ${max}
  `)

  let completadas = 0
  let conSuperficie = 0

  for (const f of filas) {
    const d = extraerDatos(f.descripcion ?? '')
    // Sin nada nuevo que aportar, ni se toca la fila (así `actualizado_en` sigue
    // significando «algo cambió» y no «el cron pasó por aquí»).
    const algo = d.superficie != null || d.tipoBien != null || d.direccion != null ||
      d.fincaRegistral != null || d.registroPropiedad != null ||
      d.dormitorios != null || d.banos != null || d.planta != null
    if (!algo) continue

    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        superficie = COALESCE(superficie, ${d.superficie ?? null}),
        tipo_bien = COALESCE(tipo_bien, ${d.tipoBien ?? null}),
        direccion = COALESCE(direccion, ${d.direccion ?? null}),
        finca_registral = COALESCE(finca_registral, ${d.fincaRegistral ?? null}),
        registro_propiedad = COALESCE(registro_propiedad, ${d.registroPropiedad ?? null}),
        dormitorios = COALESCE(dormitorios, ${d.dormitorios ?? null}),
        banos = COALESCE(banos, ${d.banos ?? null}),
        planta = COALESCE(planta, ${d.planta ?? null}),
        cuota_participacion = COALESCE(cuota_participacion, ${d.cuotaParticipacion ?? null}),
        actualizado_en = now()
      WHERE dedupe_key = ${f.dedupe_key}
        -- Solo si de verdad hay un hueco que este dato tapa: sin esto la
        -- pasada reescribiría las mismas filas cada día sin cambiar nada.
        AND (
          (superficie IS NULL AND ${d.superficie ?? null}::numeric IS NOT NULL)
          OR (tipo_bien IS NULL AND ${d.tipoBien ?? null}::text IS NOT NULL)
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
