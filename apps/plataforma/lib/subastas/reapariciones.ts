// ────────────────────────────────────────────────────────────────────────────
// Detección y aviso de la MISMA FINCA que vuelve a subasta más barata.
// Solo BD + Telegram; el emparejamiento y el umbral son puros
// (`@central/module-subastas/reaparicion`).
//
// Por qué es de las señales más valiosas del canal: cuando una subasta queda
// desierta el juzgado la reconvoca con el tipo rebajado, y esa segunda vuelta
// llega con la finca YA estudiada (cargas leídas, semáforo, €/m² de la zona). El
// radar no lo veía porque cada convocatoria trae un `SUB-JA-…` nuevo.
//
// Se avisa UNA vez por par (dedupe en `subastas_reapariciones`): la finca sigue
// viva semanas y el cron corre a diario.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { detectarReapariciones, textoReaparicion, type Convocatoria } from '@central/module-subastas'
import { tgAvisoBotones } from '@/lib/telegram'
import { eur } from '@/lib/dinero'

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Busca reapariciones en el corpus y avisa de las nuevas. Devuelve cuántas se
 * detectaron y cuántas se avisaron (las ya avisadas no se repiten).
 */
export async function avisarReapariciones(): Promise<{ detectadas: number; avisadas: number }> {
  // Ventana amplia: una reconvocatoria puede tardar meses en salir.
  const filas = await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
    SELECT dedupe_key, identificador, ref_catastral, finca_registral, registro_propiedad,
           valor_subasta, fecha_fin, resultado, municipio, descripcion, cargas, cargas_conocidas, semaforo
    FROM subastas
    WHERE es_inmueble = true
      AND (ref_catastral IS NOT NULL OR (finca_registral IS NOT NULL AND registro_propiedad IS NOT NULL))
      AND (fecha_fin IS NULL OR fecha_fin >= now() - make_interval(days => 900))
  `)

  const convocatorias: Convocatoria[] = filas.map((f) => ({
    dedupeKey: f.dedupe_key,
    identificador: f.identificador,
    refCatastral: f.ref_catastral,
    fincaRegistral: f.finca_registral,
    registroPropiedad: f.registro_propiedad,
    valorSubasta: f.valor_subasta == null ? null : Number(f.valor_subasta),
    fechaFin: f.fecha_fin ? new Date(f.fecha_fin).toISOString() : null,
    resultado: f.resultado,
    municipio: f.municipio,
    descripcion: f.descripcion,
  }))

  const reapariciones = detectarReapariciones(convocatorias)
  const porClave = new Map(filas.map((f) => [f.dedupe_key, f]))
  let avisadas = 0

  for (const r of reapariciones) {
    // Dedupe por el par (actual, anterior): un ON CONFLICT que no inserta = ya avisada.
    const insertadas = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_reapariciones (dedupe_key, dedupe_key_anterior, bajada_pct, avisado_at)
      VALUES (${r.actual.dedupeKey}, ${r.anterior.dedupeKey}, ${r.bajada}, now())
      ON CONFLICT (dedupe_key, dedupe_key_anterior) DO NOTHING
    `).catch((e) => {
      console.error('[subastas-reapariciones] insert', e)
      return 0
    })
    if (!insertadas) continue

    const fila = porClave.get(r.actual.dedupeKey) ?? {}
    const lineas = [
      `🔁 <b>${escapar(r.actual.identificador ?? r.actual.dedupeKey)}</b> — la misma finca, más barata`,
      escapar(textoReaparicion(r)),
    ]
    if (r.actual.municipio) lineas.push(`<i>${escapar(r.actual.municipio)}</i>`)

    // Lo que ya se sabe de ella: la ventaja de la segunda vuelta es no partir de cero.
    const cargas = fila.cargas == null ? null : Number(fila.cargas)
    if (fila.cargas_conocidas && cargas != null) {
      lineas.push(cargas > 0
        ? `🚨 Hereda cargas por ${escapar(eur(cargas))}`
        : '✅ Sin cargas subsistentes (ya leída su certificación)')
    }

    await tgAvisoBotones('subastas.reaparicion', lineas.join('\n'), [[
      { texto: '👀 Seguir', callback: `subv:seguir:${r.actual.dedupeKey}` },
      { texto: '🚫 No me interesa', callback: `subv:no:${r.actual.dedupeKey}` },
    ]]).catch(() => {})
    avisadas++
  }

  return { detectadas: reapariciones.length, avisadas }
}
