// Referencia de mercado (€/m² por zona) para las subastas sin tasación.
//
// Va DESPUÉS de `subastas-enriquecer` (que trae la superficie catastral) y
// ANTES de `subastas-radar` (que puntúa): sin este paso, la práctica totalidad
// de las subastas se quedaría sin puntuación, porque el BOE publica
// «Tasación 0,00 €» y el valor de referencia del Catastro exige certificado.
//
// 200 con {ok:false} si el correo falla: un fallo de red no debe teñir el cron
// de rojo ni borrar los comparables ya ingeridos.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { aplicarReferenciaMercado, avisarBajadas, avisarChollos, enriquecerAnunciantesFotocasa, ingerirComparables, referenciaZonasFotocasa, refrescarIndiceINE } from '@/lib/subastas/mercado'
import { ingerirComparablesIdealistaApi } from '@/lib/subastas/idealista-api'
import { deadlineEnriquecimiento } from '@/lib/subastas/presupuesto-mercado'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

export const dynamic = 'force-dynamic'
// 300 y no 60: con Fotocasa la lectura IMAP procesa el DOBLE de correos y la
// pasada completa (2 portales + fichas de anunciante) superó los 60s en la
// prueba E2E del 29/07/2026 — con 60 el paso de anunciantes nunca llegaba.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  // `?dias=N` permite un backfill manual del histórico de alertas sin tocar código.
  const dias = Math.min(Math.max(parseInt(sp.get('dias') || '30', 10) || 30, 1), 365)
  const max = Math.min(Math.max(parseInt(sp.get('max') || '150', 10) || 150, 1), 500)

  // Presupuesto de tiempo (incidente 06/08/2026: 504 a los 300 s justo ANTES de
  // avisar chollos → cero avisos ese día sin un solo error visible). Los pasos
  // de red se estiran solo hasta `deadline`; el resto del tiempo está reservado
  // para el tramo que de verdad avisa. Subir `maxDuration` habría movido la
  // pared; el presupuesto es lo que garantiza que la pasada VUELVE.
  const inicio = Date.now()
  const deadline = deadlineEnriquecimiento(inicio)
  // Latido de INTENTO: se escribe ANTES del trabajo, así que si la función
  // vuelve a morir a medias queda constancia de que se disparó (la lección del
  // landmine de `facturas-scan`, 31/07/2026: la huella al final no se escribe
  // nunca si el proceso muere).
  await registrarLatido('subastas_mercado', false, 'pasada iniciada')

  try {
    const ingesta = await ingerirComparables(dias, max)
    // Anunciante de los comparables de Fotocasa (👤 particular). Best-effort:
    // si el portal bloquea la IP, la pasada se corta y se reintenta otro día.
    const anunciantes = await enriquecerAnunciantesFotocasa(8, deadline).catch((e) => {
      console.error('[subastas-mercado] anunciantes', e)
      return { revisados: 0, particulares: 0, fallos: [String(e?.message ?? e)], corte: null }
    })
    // API oficial de Idealista (si hay credenciales): búsqueda directa por zona
    // vigilada, mismo corpus y mismo dedupe que las alertas. Inerte sin
    // IDEALISTA_API_KEY/IDEALISTA_API_SECRET; presupuesto ~100 llamadas/mes.
    const idealistaApi = await ingerirComparablesIdealistaApi().catch((e) => {
      console.error('[subastas-mercado] idealista-api', e)
      return { disponible: false, llamadas: 0, anuncios: 0, upserts: 0, usadasMes: 0, fallos: [String(e?.message ?? e)] }
    })
    // Mediana €/m² de las zonas con subastas vivas (buscador de Fotocasa, caché
    // 30 días) — ANTES de aplicar la referencia, que la usa como fallback.
    const zonas = await referenciaZonasFotocasa(6, deadline).catch((e) => {
      console.error('[subastas-mercado] zonas', e)
      return { zonasConsultadas: 0, subastasConZona: 0, fallos: [String(e?.message ?? e)], corte: null }
    })
    // Se aplica aunque la ingesta no traiga nada nuevo: la superficie catastral
    // pudo llegar hoy y desbloquear una subasta que ayer no era valorable.
    const aplicacion = await aplicarReferenciaMercado()
    // El mismo corpus, mirado al revés: anuncios muy por debajo de su zona.
    // Best-effort — que un fallo de Telegram no tire la referencia de mercado.
    const chollos = await avisarChollos().catch((e) => {
      console.error('[subastas-mercado] chollos', e)
      return { chollos: 0, avisados: 0 }
    })
    // Bajadas de precio: señal de negociación aunque el anuncio no sea chollo.
    const bajadas = await avisarBajadas().catch((e) => {
      console.error('[subastas-mercado] bajadas', e)
      return { bajadas: 0 }
    })
    // IPV del INE (variación anual, trimestral): contexto de mercado cacheado.
    const indice = await refrescarIndiceINE().catch((e) => {
      console.error('[subastas-mercado] indice INE', e)
      return { ok: false, detalle: String(e?.message ?? e) }
    })

    // Latido DEFINITIVO: la pasada llegó a avisar. Los cortes por presupuesto NO
    // la marcan como fallida (el enriquecimiento se retoma mañana), pero SÍ se
    // dicen en el detalle: una cola truncada por tiempo no es «ya no hay nada».
    const cortes = [anunciantes.corte, zonas.corte].filter(Boolean) as string[]
    const segundos = Math.round((Date.now() - inicio) / 1000)
    await registrarLatido(
      'subastas_mercado',
      true,
      `${ingesta.anuncios} anuncio(s), ${chollos.avisados} chollo(s) avisado(s), ${bajadas.bajadas} bajada(s) en ${segundos}s` +
        (cortes.length ? ` · ${cortes.join(' · ')}` : ''),
    )

    return NextResponse.json({ ok: true, ...ingesta, ...aplicacion, ...chollos, bajadas: bajadas.bajadas, anunciantes, zonas, indice, idealistaApi, segundos, cortes })
  } catch (e: any) {
    console.error('[subastas-mercado]', e)
    // El latido de intento ya está escrito y NO se pisa con `ok:true`: la
    // frescura la marca solo una pasada que llegó a avisar.
    await registrarLatido('subastas_mercado', false, `error: ${String(e?.message ?? e).slice(0, 200)}`)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
