/**
 * La campana de /correduria en el NAVEGADOR (26/10/2026). PURO: valida el campo `campana` de
 * `GET /api/correduria/avisos` (contrato en `avisos.ts`) para que una respuesta rota (500 de Vercel, HTML de error,
 * forma vieja) nunca se pinte como «no hay nada». Una fila o un grupo con forma rara se DESCARTA y la campana queda
 * PARCIAL (el contador lleva «+»), nunca se calla. El contador se recalcula aquí con `contadorCampana` (la misma regla).
 */
import {
  contadorCampana, COLAS_AVISO, ordenarGrupos, TIPOS_NUEVOS_CAMPANA,
  type Campana, type GrupoCampana, type ItemCampana, type NivelAviso, type TipoCampana,
} from './avisos.ts'
import type { SolicitudPortal } from './solicitudes-portal.ts'

export type LecturaCampana =
  | { estado: 'ok'; campana: Campana; descartados: number }
  | { estado: 'error'; motivo: string }

const TIPOS: readonly string[] = [...COLAS_AVISO, 'ingesta', 'puerto', ...TIPOS_NUEVOS_CAMPANA]
const NIVELES: readonly NivelAviso[] = ['urgente', 'no_comprobado', 'aviso']
const ESTADOS: readonly GrupoCampana['estado'][] = ['ok', 'parcial', 'error']

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
/** Solo enlaces internos de plataforma: nunca un `javascript:` ni un sitio de fuera. */
export function hrefInterno(v: unknown): string | null {
  return typeof v === 'string' && /^\/[^/\\]/.test(v) ? v : null
}

function item(v: unknown, tipo: TipoCampana): ItemCampana | null {
  const o = objeto(v)
  const id = texto(o?.id), t = texto(o?.texto)
  if (!o || !id || !t) return null
  const it: ItemCampana = { id, texto: t, detalle: texto(o.detalle), href: hrefInterno(o.href) }
  if (tipo === 'solicitudes_portal') {
    // El Activar/Rechazar exige la solicitud entera y legible: sin ella, la fila se enseña pero sin botones.
    const s = solicitud(o.solicitud)
    if (s) it.solicitud = s
  }
  return it
}

function solicitud(v: unknown): SolicitudPortal | null {
  const o = objeto(v)
  const id = texto(o?.id), modulo = texto(o?.modulo), cliente = texto(o?.cliente), solicitadoEn = texto(o?.solicitadoEn)
  if (!o || !id || !modulo || !cliente || !solicitadoEn || typeof o.puedeActivar !== 'boolean') return null
  const motivo = texto(o.motivoNoActivar)
  if (!o.puedeActivar && !motivo) return null
  const clienteId = texto(o.clienteId)
  return {
    id, modulo, moduloNombre: texto(o.moduloNombre) ?? modulo, clienteId, cliente, sinFicha: clienteId === null,
    solicitadoEn, puedeActivar: o.puedeActivar, motivoNoActivar: o.puedeActivar ? null : motivo,
  }
}

function grupo(v: unknown): { g: GrupoCampana; descartados: number } | null {
  const o = objeto(v)
  const tipo = TIPOS.find((t) => t === o?.tipo) as TipoCampana | undefined
  const nivel = NIVELES.find((n) => n === o?.nivel)
  const estado = ESTADOS.find((e) => e === o?.estado)
  const titulo = texto(o?.titulo), t = texto(o?.texto)
  if (!o || !tipo || !nivel || !estado || !titulo || !t || !Array.isArray(o.items)) return null
  const n = o.n === null ? null : entero(o.n)
  if (n === null && o.n !== null) return null
  let descartados = 0
  const items: ItemCampana[] = []
  for (const x of o.items) {
    const it = item(x, tipo)
    if (it) items.push(it)
    else descartados++
  }
  return {
    descartados,
    g: {
      tipo, titulo, nivel, texto: t, items, n,
      estado: descartados > 0 && estado === 'ok' ? 'parcial' : estado,
      plazoLegal: o.plazoLegal === true,
      plazo: typeof o.plazo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.plazo) ? o.plazo : null,
      diasRestantes: typeof o.diasRestantes === 'number' && Number.isFinite(o.diasRestantes) ? o.diasRestantes : null,
      href: hrefInterno(o.href), mas: entero(o.mas) ?? 0, informativos: entero(o.informativos) ?? 0,
    },
  }
}

export function interpretarCampana(status: number, json: unknown): LecturaCampana {
  const raiz = objeto(json)
  const c = objeto(raiz?.campana)
  if (status !== 200 || raiz?.estado !== 'ok' || !c || !Array.isArray(c.grupos)) {
    return { estado: 'error', motivo: status === 401 || status === 403 ? 'sin permiso' : `respuesta ${status}` }
  }
  const grupos: GrupoCampana[] = []
  let descartados = 0
  for (const v of c.grupos) {
    const r = grupo(v)
    if (!r) { descartados++; continue }
    grupos.push(r.g)
    descartados += r.descartados
  }
  const cuenta = contadorCampana(grupos)
  // Un grupo entero ilegible no se sabe cuánto contaba: el total pasa a ser un suelo.
  const parcial = cuenta.parcial || descartados > 0
  const contador = cuenta.total > 0 ? `${cuenta.total}${parcial ? '+' : ''}` : parcial ? '!' : ''
  return {
    estado: 'ok', descartados,
    campana: { hoy: texto(c.hoy) ?? '', total: cuenta.total, parcial, contador, grupos: ordenarGrupos(grupos) },
  }
}

/** Rojo = plazo legal o urgente; ámbar = no comprobado; neutro = aviso. */
export function tonoGrupo(g: Pick<GrupoCampana, 'nivel' | 'plazoLegal' | 'estado'>): 'malo' | 'aviso' | 'neutral' {
  if (g.estado === 'error' || g.estado === 'parcial' || g.nivel === 'no_comprobado') return 'aviso'
  if (g.plazoLegal || g.nivel === 'urgente') return 'malo'
  return 'neutral'
}
