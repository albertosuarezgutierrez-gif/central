// Salud EN VIVO de los agentes con señal en BD, para el panel /operador/agentes. Por cada agente
// con rastro (una tabla que toca al ejecutarse) calcula su última actividad y un semáforo contra
// una cadencia esperada. Los agentes SIN señal en BD (varias rutinas Claude) se marcan en gris
// "sin telemetría" (honesto: no inventamos verde). Nunca lanza: cada consulta cae a null.

import { prisma } from '@/lib/db'

export type EstadoSalud = 'verde' | 'ambar' | 'rojo' | 'gris'
export type SaludAgente = { ultima: string | null; horas: number | null; estado: EstadoSalud; detalle: string }

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
