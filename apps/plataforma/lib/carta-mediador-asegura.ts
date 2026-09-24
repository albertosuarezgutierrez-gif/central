// Cartas de nombramiento de mediador (presupuesto, salida B, PR 6): cliente del puerto de asegura
// (`/api/operador/carta-mediador`) + lectura defensiva y frases (puras, con test).
//
// La carta la firma el cliente en su portal; aquí Alberto la ve y marca a mano lo que pasa después:
// «enviada» (la manda él), «aceptada» o «rechazada» por la compañía. Nada sale solo.

import type { EstadoCartaMediador } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

export type CartaMediador = {
  id: string
  estado: EstadoCartaMediador
  creadaAt: string
  firmadaAt: string | null
  enviadaAt: string | null
  aceptadaAt: string | null
  rechazadaAt: string | null
  rechazoMotivo: string | null
  cartaTexto: string | null
}

export type LecturaCartas = { estado: 'ok'; cartas: CartaMediador[] } | { estado: 'sin_datos'; causa: string }

const ESTADOS: readonly string[] = ['pendiente', 'firmada', 'enviada', 'aceptada', 'rechazada', 'desistida']
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** Una fila ilegible devuelve `null` y la lista entera se declara ilegible (no se esconde una carta). */
export function leerCarta(v: unknown): CartaMediador | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = t(o.id), estado = t(o.estado), creadaAt = t(o.creadaAt)
  if (!id || !estado || !ESTADOS.includes(estado) || !creadaAt) return null
  return {
    id, estado: estado as EstadoCartaMediador, creadaAt,
    firmadaAt: t(o.firmadaAt), enviadaAt: t(o.enviadaAt), aceptadaAt: t(o.aceptadaAt), rechazadaAt: t(o.rechazadaAt),
    rechazoMotivo: t(o.rechazoMotivo), cartaTexto: t(o.cartaTexto),
  }
}

export type CartaPorTramitar = {
  id: string; estado: 'firmada' | 'enviada'; polizaId: string; cliente: string | null
  compania: string | null; numeroPoliza: string | null; firmadaAt: string; enviadaAt: string | null
  /** `true` = su correo espera el OK en la cola; `false` = hay que mandarla desde la ficha; `null` = asegura no lo dice. */
  enCola: boolean | null
}

export type LecturaPorTramitar = { estado: 'ok'; cartas: CartaPorTramitar[] } | { estado: 'sin_datos'; causa: string }

/** Una fila de «Hoy». Ilegible → `null` (y la lista entera se declara ilegible). */
export function leerCartaPorTramitar(v: unknown): CartaPorTramitar | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = t(o.id), polizaId = t(o.polizaId), firmadaAt = t(o.firmadaAt)
  if (!id || !polizaId || !firmadaAt || (o.estado !== 'firmada' && o.estado !== 'enviada')) return null
  return {
    id, estado: o.estado, polizaId, cliente: t(o.cliente), compania: t(o.compania), numeroPoliza: t(o.numeroPoliza),
    firmadaAt, enviadaAt: t(o.enviadaAt), enCola: typeof o.enCola === 'boolean' ? o.enCola : null,
  }
}

/** Qué se puede hacer desde cada estado (la regla la vuelve a aplicar asegura). */
export function accionesCarta(e: EstadoCartaMediador): { enviar: boolean; resolver: boolean; desistir: boolean } {
  return { enviar: e === 'firmada', resolver: e === 'enviada', desistir: e === 'pendiente' || e === 'firmada' || e === 'enviada' }
}

export const ROTULO_ESTADO_CARTA: Record<EstadoCartaMediador, string> = {
  pendiente: 'El cliente la está firmando (pidió el código)',
  firmada: 'Firmada por el cliente · falta mandarla a la compañía',
  enviada: 'Enviada a la compañía · esperando que la acepte (aún no es nuestra)',
  aceptada: 'Aceptada: la póliza pasa a nosotros',
  rechazada: 'Rechazada por la compañía',
  desistida: 'Desistida',
}

function base(): { url: string; secreto: string } | null {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return null
  return { url: `${(process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')}/api/operador/carta-mediador`, secreto }
}

export async function leerCartas(polizaId: string): Promise<LecturaCartas> {
  const b = base()
  if (!b) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const res = await fetch(`${b.url}?polizaId=${encodeURIComponent(polizaId)}`, { headers: await cabecerasPuerto(b.secreto), cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/carta-mediador desplegado' }
    if (!res.ok || j?.estado !== 'ok' || !Array.isArray(j.cartas)) return { estado: 'sin_datos', causa: `HTTP ${res.status}` }
    const lista = j.cartas.map(leerCarta)
    if (lista.some((x) => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió una carta incompleta' }
    return { estado: 'ok', cartas: lista as CartaMediador[] }
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura' }
  }
}

export async function leerCartasPorTramitar(): Promise<LecturaPorTramitar> {
  const b = base()
  if (!b) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const res = await fetch(`${b.url}?pendientes=1`, { headers: await cabecerasPuerto(b.secreto), cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/carta-mediador desplegado' }
    if (!res.ok || j?.estado !== 'ok' || !Array.isArray(j.cartas)) return { estado: 'sin_datos', causa: `HTTP ${res.status}` }
    const lista = j.cartas.map(leerCartaPorTramitar)
    if (lista.some((x) => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió una carta incompleta' }
    return { estado: 'ok', cartas: lista as CartaPorTramitar[] }
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura' }
  }
}

export async function accionCartaAsegura(cuerpo: Record<string, unknown>, actor: string): Promise<{ status: number; ok: boolean; motivo: string | null }> {
  const b = base()
  if (!b) return { status: 503, ok: false, motivo: 'puerto sin configurar' }
  try {
    const res = await fetch(b.url, {
      method: 'PATCH',
      headers: { ...(await cabecerasPuerto(b.secreto)), 'Content-Type': 'application/json' },
      // El actor, el ÚLTIMO: lo pone la sesión.
      body: JSON.stringify({ ...cuerpo, actor }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, ok: res.ok && j?.estado === 'ok', motivo: t(j?.motivo) }
  } catch {
    return { status: 504, ok: false, motivo: 'no se pudo llegar a asegura: no sabemos si se anotó, recarga' }
  }
}
