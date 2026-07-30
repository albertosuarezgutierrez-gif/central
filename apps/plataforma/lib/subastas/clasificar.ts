// Clasificador de lentes sobre el corpus: 🔨 flip, 🏖️ playa Huelva y 🚦
// semáforo documental. Todo DETERMINISTA con lógica del módulo puro — aquí
// solo va la BD. Corre al final del cron `subastas-enriquecer`, cuando la fila
// ya tiene ficha, Catastro, mercado y notas del edicto.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  analisisDocumental,
  esPlayaHuelva,
  evaluarFlip,
  evaluarOportunidad,
  FLIP_MARGEN_MIN,
} from '@central/module-subastas'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'

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
  let playa = 0
  let flipViables = 0

  for (const f of filas) {
    const s = filaASubasta(f)
    const oportunidad = evaluarOportunidad(s)
    const flip = evaluarFlip(s, oportunidad, anio)
    const esPlaya = esPlayaHuelva(s.municipio, s.descripcion, s.provincia)
    // El listado de adjuntos va al análisis para que «procesado sin hallazgos»
    // no se confunda con «no se ha leído nada» (ficha sin adjuntos o todos
    // escaneados): sin él, el semáforo podía salir 🟢 sin abrir un documento.
    const analisis = analisisDocumental(s, f.notas_edicto ?? null, Array.isArray(f.documentos) ? f.documentos : null)

    if (esPlaya) playa++
    if (flip.apto && (flip.margenPct ?? -1) >= FLIP_MARGEN_MIN) flipViables++

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        es_playa = ${esPlaya},
        margen_flip = ${flip.margen},
        margen_flip_pct = ${flip.margenPct},
        flip_apto = ${flip.apto},
        semaforo = ${analisis.semaforo},
        analisis = ${JSON.stringify(analisis.puntos)}::jsonb
      WHERE dedupe_key = ${f.dedupe_key}
    `)
  }

  return { revisadas: filas.length, playa, flipViables }
}
