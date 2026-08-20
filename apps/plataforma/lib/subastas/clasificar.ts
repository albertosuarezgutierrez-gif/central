// Clasificador de lentes sobre el corpus: 🔨 flip, 🏖️ playa (Huelva y Cádiz) y 🚦
// semáforo documental. Todo DETERMINISTA con lógica del módulo puro — aquí
// solo va la BD. Corre al final del cron `subastas-enriquecer`, cuando la fila
// ya tiene ficha, Catastro, mercado y notas del edicto.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  analisisDocumental,
  esPlaya,
  evaluarFlip,
  evaluarOportunidad,
  FLIP_MARGEN_MIN,
  pujaMaximaParaDescuento,
  remateEsperado,
  revisarTecho,
} from '@central/module-subastas'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'
import { calibracionResultados } from '@/lib/subastas/calibracion'

export async function clasificarSubastas(max = 400): Promise<{ revisadas: number; playa: number; flipViables: number }> {
  // Vigentes siempre (el margen cambia con cada enriquecimiento) + históricas
  // aún sin clasificar (una sola vez).
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ${COLS_SUBASTA} FROM subastas
    WHERE es_inmueble = true
      AND ((fecha_fin IS NULL OR fecha_fin >= now()) OR semaforo IS NULL)
    ORDER BY actualizado_en DESC
    LIMIT ${max}
  `)

  const anio = new Date().getFullYear()
  // Los remates REALES capturados hasta hoy: una sola consulta para toda la
  // pasada. Es lo que convierte el techo teórico en un número contrastado —
  // hasta el 20/08/2026 esta calibración existía y no la usaba nadie para
  // decidir: solo pintaba una frase en /subastas.
  const calibracion = await calibracionResultados().catch((e) => {
    console.error('[subastas/clasificar] calibración', e)
    return []
  })
  let enPlaya = 0
  let flipViables = 0

  for (const f of filas) {
    const s = filaASubasta(f)
    const oportunidad = evaluarOportunidad(s, null, undefined, anio)
    const flip = evaluarFlip(s, oportunidad, anio)
    const playa = esPlaya(s.municipio, s.descripcion, s.provincia)
    // El listado de adjuntos va al análisis para que «procesado sin hallazgos»
    // no se confunda con «no se ha leído nada» (ficha sin adjuntos o todos
    // escaneados): sin él, el semáforo podía salir 🟢 sin abrir un documento.
    // `publicaAdjuntos` por fuente: en los lotes de la Junta un `documentos`
    // NULL no está pendiente de nada (no hay ficha documental que revisar), y
    // prometer una pasada que nunca llegará es otra forma de mentir.
    const analisis = analisisDocumental(
      s,
      f.notas_edicto ?? null,
      Array.isArray(f.documentos) ? f.documentos : null,
      (f.fuente ?? 'boe') === 'boe',
    )
    // Techo de puja para un 25% de descuento REAL — el mismo que pinta la ficha.
    // Se CONGELA aquí: cuando la subasta concluya, esta fila deja de entrar en la
    // consulta de arriba (ya tiene semáforo y la fecha pasó), así que el número
    // que queda es el que teníamos ANTES del remate. Es lo único que permite
    // comprobar después si nuestro techo tenía algo que ver con el mercado.
    const pujaMaxima = oportunidad.valorMercado
      ? pujaMaximaParaDescuento(s, oportunidad.valorMercado, 0.25).importe
      : null

    // Realidad contra teoría: qué se remata DE VERDAD en esta provincia y si el
    // techo de arriba se sostiene. Sin muestra suficiente, `remate.importe` es
    // NULL y no se escribe una cifra inventada.
    const remate = remateEsperado(s.valorSubasta ?? null, s.provincia ?? null, calibracion)
    const techo = revisarTecho({
      techo: pujaMaxima,
      valorSubasta: s.valorSubasta ?? null,
      valorOrientativo: oportunidad.valorOrientativo,
      remate,
    })

    if (playa) enPlaya++
    if (flip.apto && (flip.margenPct ?? -1) >= FLIP_MARGEN_MIN) flipViables++

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        es_playa = ${playa},
        margen_flip = ${flip.margen},
        margen_flip_pct = ${flip.margenPct},
        flip_apto = ${flip.apto},
        semaforo = ${analisis.semaforo},
        analisis = ${JSON.stringify(analisis.puntos)}::jsonb,
        puja_maxima_calc = ${pujaMaxima},
        remate_esperado = ${remate.importe},
        remate_ratio = ${remate.ratio},
        remate_muestra = ${remate.muestra},
        techo_fiable = ${techo.fiable},
        techo_motivo = ${techo.motivo},
        valor_orientativo = ${oportunidad.valorOrientativo}
      WHERE dedupe_key = ${f.dedupe_key}
    `)
  }

  return { revisadas: filas.length, playa: enPlaya, flipViables }
}
