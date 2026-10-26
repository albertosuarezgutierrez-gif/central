import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { avisosAsegura } from '@/lib/seguimiento-asegura'
import { leerIngestaCima } from '@/lib/correduria/ingesta-cima'
import { interpretarVistaIngesta, type VistaIngesta } from '@/lib/correduria/ingesta-pantalla'
import { componerAvisos, componerCampana } from '@/lib/correduria/avisos'
import { solicitudesPortalAsegura } from '@/lib/portal-cliente-asegura'
import { interpretarSolicitudesPortal, type LecturaSolicitudesPortal } from '@/lib/correduria/solicitudes-portal'
import { interpretarLeads, leadsAsegura, type ResultadoLeads } from '@/lib/leads-asegura'
import { conversionLeadsWebAsegura, type ConversionLeadsWeb } from '@/lib/leads-web-conversion-asegura'
import { permisosPortalAsegura, type LecturaPermisosPortal } from '@/lib/correduria/permisos-portal'
import { senalesPatrimonio, type LecturaOportunidadesPatrimonio } from '@/lib/correduria/oportunidades-patrimonio'
import { leerCartasPorTramitar, type LecturaPorTramitar } from '@/lib/carta-mediador-asegura'
import { interpretarSincroCima, sincroCimaAsegura, type LecturaSincroCima } from '@/lib/cima-sincro-asegura'

export const dynamic = 'force-dynamic'
// Todas las fuentes EN PARALELO, cada una con su tope (la más lenta, el puerto de avisos, 20 s).
export const maxDuration = 30

const TOPE_MS = 22_000

/** Una fuente que no contesta a tiempo es «no se ha podido comprobar», nunca vacía. */
function conTope<T>(p: Promise<T>, fallo: T): Promise<T> {
  return Promise.race([p.catch(() => fallo), new Promise<T>((r) => setTimeout(() => r(fallo), TOPE_MS))])
}

/**
 * ficha ↔ CIMA es una lectura pesada (recorre la cartera; su puerto tiene 60 s): la campana la refresca cada 2 min, así
 * que el resultado BUENO se cachea 10 min. Un fallo NO se cachea (se lanza dentro): el siguiente intento vuelve a preguntar.
 */
const cimaCacheada = unstable_cache(async (): Promise<LecturaSincroCima> => {
  const r = await sincroCimaAsegura()
  const l = interpretarSincroCima(r.status, r.json)
  if (l.estado !== 'ok') throw new Error(`cima-sincro: ${l.estado}`)
  return l
}, ['correduria-campana-cima-sincro'], { revalidate: 600 })

async function leerCima(): Promise<LecturaSincroCima> {
  try {
    return await cimaCacheada()
  } catch {
    // Sin caché: se pregunta otra vez para dar el motivo de verdad.
    const r = await sincroCimaAsegura()
    return interpretarSincroCima(r.status, r.json)
  }
}

/**
 * GET — avisos de la correduría.
 *   · `avisos` (13/10/2026, contrato de la antigua banda de «Mi mesa»): una línea por cola con plazo o urgente.
 *   · `campana` (26/10/2026): la campana de `AccionesCabecera` — grupos por tipo (colas de arriba + solicitudes del
 *     portal, leads nuevos, permisos del portal, Patrimonio, cartas del mediador, diferencias con CIMA), ≤20 filas por
 *     tipo, contador con «+»/«!» si alguna fuente no se pudo leer. Contrato en `lib/correduria/avisos.ts`.
 * Una fuente que no se pudo leer sale como «no se ha podido comprobar», nunca desaparece ni cuenta 0.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const [puerto, ingesta, solicitudes, leadsPortal, leadsWeb, permisos, patrimonio, cartas, cima] = await Promise.all([
    avisosAsegura(),
    leerIngestaCima()
      .then((r): VistaIngesta => interpretarVistaIngesta(200, r))
      .catch((): VistaIngesta => ({ estado: 'error', motivo: 'respuesta_ilegible' })),
    conTope<LecturaSolicitudesPortal>(
      solicitudesPortalAsegura().then((r) => interpretarSolicitudesPortal(r.status, r.json)),
      { estado: 'error', motivo: 'sin respuesta a tiempo' }),
    conTope<ResultadoLeads>(leadsAsegura().then((r) => interpretarLeads(r.json)), { ok: false, motivo: 'red', causa: null }),
    conTope<ConversionLeadsWeb>(conversionLeadsWebAsegura(), { estado: 'error', motivo: 'red' }),
    conTope<LecturaPermisosPortal>(permisosPortalAsegura(), { estado: 'error', motivo: 'sin respuesta a tiempo' }),
    conTope<LecturaOportunidadesPatrimonio>(senalesPatrimonio(), { estado: 'error', motivo: 'sin respuesta a tiempo' }),
    conTope<LecturaPorTramitar>(leerCartasPorTramitar(), { estado: 'sin_datos', causa: 'sin respuesta a tiempo' }),
    conTope<LecturaSincroCima>(leerCima(), { estado: 'error', motivo: 'sin respuesta a tiempo' }),
  ])
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const avisos = componerAvisos(puerto.status, puerto.json, ingesta, hoy)
  const campana = componerCampana({ avisos, solicitudes, leadsPortal, leadsWeb, permisos, patrimonio, cartas, cima })
  return NextResponse.json({ ...avisos, campana }, { headers: { 'cache-control': 'no-store' } })
}
