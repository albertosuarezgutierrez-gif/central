// Bajas de Allianz para tramitar a mano en el PUE (30/09/2026). Ver `docs/ALLIANZ-PUE.md`.
//
// Allianz no recibe las bajas por correo: la intranet las prepara (asegura: `/api/operador/anulaciones/pue`)
// y Alberto las teclea en el PUE y las marca como tramitadas. Aquí: cliente del puerto, intérprete PURO
// de su respuesta y el texto del aviso diario de Telegram.
//
// 🚨 Un fallo de lectura NUNCA es «0 pendientes»: `interpretarBajasPue` distingue `ok` de `error`.
//
// `pedir` de `correduria-puerto.ts` no está exportada y ese archivo lo edita otro agente: se replica
// aquí el patrón mínimo (mismo secreto, misma URL por defecto, mismas cabeceras).

import { cabecerasPuerto } from '../puerto-actor.ts'
import { URL_PLATAFORMA_POR_DEFECTO } from '../correduria-emision-tg.ts'

export type CampoPue = { etiqueta: string; valor: string | null }
export type BajaPue = {
  anulacionId: string
  polizaId: string
  clienteId: string
  cliente: string | null
  desde: string | null
  ficha: { url: string; campos: CampoPue[]; texto: string }
  documentoId: string | null
  esperaEmision: boolean
}

export type LecturaBajasPue =
  | { estado: 'ok'; bajas: BajaPue[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function leerCampo(v: unknown): CampoPue | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const etiqueta = cadena(o.etiqueta)
  return etiqueta ? { etiqueta, valor: cadena(o.valor) } : null
}

export function leerBajaPue(v: unknown): BajaPue | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const anulacionId = cadena(o.anulacionId), polizaId = cadena(o.polizaId), clienteId = cadena(o.clienteId)
  const f = typeof o.ficha === 'object' && o.ficha !== null ? (o.ficha as Record<string, unknown>) : null
  const url = cadena(f?.url), texto = cadena(f?.texto)
  if (!anulacionId || !polizaId || !clienteId || !f || !url || !texto || !Array.isArray(f.campos)) return null
  const campos = f.campos.map(leerCampo)
  if (campos.some((c) => c === null)) return null
  return {
    anulacionId, polizaId, clienteId, cliente: cadena(o.cliente), desde: cadena(o.desde),
    ficha: { url, texto, campos: campos as CampoPue[] },
    documentoId: cadena(o.documentoId),
    // Solo `false` explícito dice «se puede tramitar»; ausente = no se sabe, y se trata como que espera.
    esperaEmision: o.esperaEmision !== false,
  }
}

/** Una fila ilegible no se esconde: si falta una, la lista no es la lista. */
export function interpretarBajasPue(status: number, json: unknown): LecturaBajasPue {
  const j = (json ?? null) as Record<string, unknown> | null
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/anulaciones/pue desplegado' }
  if (status !== 200 || j?.estado !== 'ok' || !Array.isArray(j.bajas)) {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const bajas = j.bajas.map(leerBajaPue)
  if (bajas.some((b) => b === null)) return { estado: 'error', motivo: 'asegura devolvió una baja incompleta' }
  return { estado: 'ok', bajas: bajas as BajaPue[] }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function bajasPuePendientes(): Promise<LecturaBajasPue> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/anulaciones/pue`, {
      headers: { ...(await cabecerasPuerto(secret)) }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    return interpretarBajasPue(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export type ResultadoTramitada = { status: number; json: unknown }

/** El actor lo pone la sesión (nunca el cuerpo del navegador). */
export async function marcarBajaTramitada(anulacionId: string, actor: string): Promise<ResultadoTramitada> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/anulaciones/pue`, {
      method: 'POST',
      headers: { ...(await cabecerasPuerto(secret)), 'content-type': 'application/json' },
      body: JSON.stringify({ anulacionId, actor }),
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 504, json: { estado: 'error', motivo: 'no se pudo llegar a asegura: no se sabe si quedó marcada' } }
  }
}

// ── Aviso de Telegram ───────────────────────────────────────────────────────

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function urlFichaCliente(clienteId: string, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO): string {
  return `${base.replace(/\/$/, '')}/correduria/cliente/${encodeURIComponent(clienteId)}`
}

const dato = (b: BajaPue, etiqueta: string): string => b.ficha.campos.find((c) => c.etiqueta === etiqueta)?.valor ?? 'no consta'

/** `null` = nada que avisar (lista vacía o solo bajas que esperan la emisión): no se manda «0 pendientes». */
export function mensajeBajasPue(bajas: readonly BajaPue[], base?: string): string | null {
  const listas = bajas.filter((b) => !b.esperaEmision)
  if (listas.length === 0) return null
  const url = listas[0]!.ficha.url
  const lineas = listas.slice(0, 15).map((b) =>
    `• <a href="${esc(urlFichaCliente(b.clienteId, base))}">${esc(b.cliente ?? '(sin nombre)')}</a> — póliza ${esc(dato(b, 'Nº de póliza'))} · efecto ${esc(dato(b, 'Fecha de efecto de la baja'))} · ${esc(dato(b, 'Operativa'))}`)
  const mas = listas.length > 15 ? `\n… y ${listas.length - 15} más en /correduria (Hoy).` : ''
  return [
    `📮 <b>Bajas de Allianz para tramitar en el PUE · ${listas.length}</b>`,
    'Allianz no las recibe por correo: tramítalas a mano y márcalas como tramitadas.',
    '',
    ...lineas,
    mas,
    '',
    `<a href="${esc(url)}">Abrir el PUE</a> · Tramítala en el PUE y márcala como tramitada en /correduria (Hoy).`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
