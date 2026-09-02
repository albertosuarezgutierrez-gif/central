// Salud EN VIVO de los agentes con señal en BD, para el panel /operador/agentes. Por cada agente
// con rastro (una tabla que toca al ejecutarse) calcula su última actividad y un semáforo contra
// una cadencia esperada. Los agentes SIN señal en BD (varias rutinas Claude) se marcan en gris
// "sin telemetría" (honesto: no inventamos verde). Nunca lanza: cada consulta cae a null.

import { prisma } from '@/lib/db'
import { clasificarSalud, type EstadoSalud, type SaludAgente, type SaludLatido, type FilaSalud } from './agentes-salud-clasificar'

export { clasificarSalud } from './agentes-salud-clasificar'
export type { EstadoSalud, SaludAgente, SaludLatido, FilaSalud } from './agentes-salud-clasificar'

// Horas de margen esperadas entre ejecuciones por agente (verde ≤ margen, ámbar ≤ 2×, rojo >2×).
// On-demand (director) y semanales llevan margen holgado para no dar falsos rojos.
const INTERVALO_H: Record<string, number> = {
  'ia-director': 72,
  'ia-director-refresh': 192, // semanal (lunes) + margen
  'contable-proactivo': 192,
  'correo-triaje': 1,         // cada 10 min → stale si >1h
  'facturas-proveedor': 48,
  'concursos': 12,
}

type Fila = { ultima: Date | null; horas: number | null }
const q = (p: Promise<Fila[]>) => p.then(r => r[0] ?? null).catch(() => null)

/** Última actividad + desfase en horas de un agente (o null si no hay rastro). */
async function señales(): Promise<Record<string, Fila | null>> {
  const [director, refresh, contable, triaje, facturas, concursos] = await Promise.all([
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM ai_usos WHERE endpoint='director'`),
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM ia_director_prompt WHERE origen='cron'`),
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM ai_usos WHERE endpoint='contable'`),
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM correo_triaje`),
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM facturas_proveedor`),
    q(prisma.$queryRaw<Fila[]>`SELECT max(creada_at) AS ultima, EXTRACT(EPOCH FROM (now()-max(creada_at)))/3600 AS horas FROM concursos_radar_anuncios`),
  ])
  return {
    'ia-director': director, 'ia-director-refresh': refresh, 'contable-proactivo': contable,
    'correo-triaje': triaje, 'facturas-proveedor': facturas, 'concursos': concursos,
  }
}

function semaforo(id: string, fila: Fila | null): SaludAgente {
  if (!fila || fila.ultima == null || fila.horas == null) {
    return { ultima: null, horas: null, estado: 'gris', detalle: 'sin telemetría' }
  }
  const horas = Number(fila.horas)
  const margen = INTERVALO_H[id] ?? 48
  const estado: EstadoSalud = horas <= margen ? 'verde' : horas <= margen * 2 ? 'ambar' : 'rojo'
  const detalle = horas < 1 ? 'hace <1h' : horas < 48 ? `hace ${Math.round(horas)}h` : `hace ${Math.round(horas / 24)}d`
  return { ultima: String(fila.ultima), horas, estado, detalle }
}

/** Salud por id de agente (los no rastreados no aparecen → el panel los pinta en gris). */
export async function getSaludAgentes(): Promise<Record<string, SaludAgente>> {
  const s = await señales().catch(() => ({} as Record<string, Fila | null>))
  const out: Record<string, SaludAgente> = {}
  for (const id of Object.keys(INTERVALO_H)) out[id] = semaforo(id, s[id] ?? null)
  return out
}


// ─── Salud desde el vigía de latidos (02/09/2026) ────────────────────────────────────────────
// La decisión vive en `agentes-salud-clasificar.ts` (puro y testeado); aquí solo la consulta.

/**
 * Veredicto persistido del vigía, por id de agente vigilado. Devuelve `{}` si la tabla no existe
 * todavía o la consulta falla: preferimos «no sé» a inventar un verde.
 */
export async function getSaludLatidos(): Promise<Record<string, SaludLatido>> {
  let filas: FilaSalud[]
  try {
    filas = await prisma.$queryRaw<FilaSalud[]>`
      SELECT agente, evaluado_at, alerta, horas, motivo, max_horas, etiqueta, nota, sonda_error
      FROM agente_salud`
  } catch {
    return {}
  }
  const ahora = Date.now()
  const out: Record<string, SaludLatido> = {}
  for (const f of filas) out[f.agente] = clasificarSalud(f, ahora)
  return out
}

/**
 * Mapa id-del-catálogo → ids de latido que lo respaldan. Explícito y NO derivable: el catálogo
 * usa kebab-case («pricing-agente») y el registro de latidos snake_case con otra granularidad
 * («pricing»), y algunos agentes tienen DOS latidos. Un `join` por nombre no funcionaría.
 *
 * Solo se mapea lo que de verdad mide al mismo agente. Deliberadamente SIN mapear, aunque el
 * nombre invite:
 *   · `ialimp-client-health` (skill que mide la salud del CLIENTE) ≠ `ialimp_pms` (el sync).
 *   · `impagos-ialimp` (ialimp) ≠ `sivra_extras_impago` (extras del huésped de SIVRA).
 * Mapearlos daría un verde prestado de otro agente, que es peor que un gris honesto.
 */
export const LATIDOS_POR_AGENTE: Record<string, string[]> = {
  // ⚠️ CORREGIDO 02/09/2026: antes 'facturas-correo' apuntaba a 'facturas_gmail', que es el CRON
  // de las 06:15 — OTRO proceso sobre el mismo buzón. Eso era un verde prestado, justo lo que este
  // mapa dice no hacer. La rutina de Claude tiene ahora su propio latido.
  'facturas-correo': ['facturas_correo'],
  'pricing-agente': ['pricing'],
  'trading-analista': ['trading_watchdog', 'trading_operaciones'],
  'mercado-booking': ['sivra_mercado_booking'],
  'correo-triaje': ['correo_triaje'],
  'agente-huesped': ['sivra_mensajes_prog'],
  'subastas': ['subastas_mercado'],
  // Las cinco rutinas que hasta hoy no dejaban huella (ver AGENTES_VIGILADOS).
  'psd2-health-check': ['psd2_health_check'],
  'fiscal-novedades': ['fiscal_novedades'],
  'rrhh-compliance-calendar': ['rrhh_compliance'],
  'github-vigia': ['github_vigia'],
}

const PEOR: Record<EstadoSalud, number> = { verde: 0, gris: 1, ambar: 2, rojo: 3 }

/**
 * Salud del catálogo: el latido manda sobre la sonda local (tiene umbral declarado y lo evalúa
 * el vigía), y con varios latidos gana el PEOR — un agente con dos patas está sano solo si lo
 * están las dos.
 */
export async function getSaludAgentesCompleta(): Promise<Record<string, SaludAgente>> {
  const [sondas, latidos] = await Promise.all([getSaludAgentes(), getSaludLatidos()])
  const out: Record<string, SaludAgente> = { ...sondas }
  for (const [idCatalogo, ids] of Object.entries(LATIDOS_POR_AGENTE)) {
    const vistos = ids.map(i => latidos[i]).filter((x): x is SaludLatido => !!x)
    if (vistos.length === 0) continue
    const peor = vistos.reduce((a, b) => (PEOR[b.estado] > PEOR[a.estado] ? b : a))
    out[idCatalogo] = { ultima: peor.ultima, horas: peor.horas, estado: peor.estado, detalle: peor.detalle }
  }
  return out
}

/**
 * Los latidos vigilados que NO tienen fila en el catálogo de la pantalla. Son 19 de 27: agentes
 * con umbral y sonda cuyo estado no se veía en ningún sitio. Se pintan aparte en vez de
 * quedarse fuera, que es como estaban.
 */
export async function getLatidosFueraDelCatalogo(): Promise<SaludLatido[]> {
  const latidos = await getSaludLatidos()
  const mapeados = new Set(Object.values(LATIDOS_POR_AGENTE).flat())
  return Object.entries(latidos)
    .filter(([id]) => !mapeados.has(id))
    .map(([, v]) => v)
    .sort((a, b) => PEOR[b.estado] - PEOR[a.estado])
}
