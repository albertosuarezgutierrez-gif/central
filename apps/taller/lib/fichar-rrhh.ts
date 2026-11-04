// Fichaje del trabajador del taller → rrhh. El taller SOLO ENVÍA (POST); no lee nada de rrhh.
//   · Se valida usuario + PIN con el mismo login (mismos bloqueos: IP, persona y taller), pero NO se abre sesión: solo se ficha.
//   · rrhh solo acepta el fichaje si SU empresa tiene habilitado ESTE taller (`taller_id` en el cuerpo): la empresa de rrhh la fija
//     el operador, nunca el dueño. La respuesta al trabajador es «registrado»; no se le devuelve ningún dato de rrhh (ni el nombre).
//   · Sin RRHH_URL o sin RRHH_FICHAJE_TALLER_SECRET la función no existe (los botones no aparecen).
//   · Si rrhh falla o no responde se dice CLARO y no se finge éxito: el fichaje no consta.
import { requireSecret } from '@central/core-identity'
import { loginTaller } from './login.ts'
import type { ConTaller } from './rls.ts'

export type AccionFichaje = 'entrada' | 'salida'
export const ACCIONES: readonly AccionFichaje[] = ['entrada', 'salida']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 8000

export function fichajeRrhhDisponible(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RRHH_URL?.trim() && !!env.RRHH_FICHAJE_TALLER_SECRET?.trim()
}

export type ResultadoFichaje = { ok: true; accion: AccionFichaje } | { ok: false; status: number; error: string }

const SIN_REGISTRAR = 'El fichaje NO se ha registrado.'

/** Mensaje claro para el trabajador según lo que respondió rrhh (o que no respondió). */
export function mensajeErrorRrhh(status: number, codigo: string | undefined): string {
  if (codigo === 'ya_fichado') return 'Ya tienes una entrada abierta. Ficha la salida primero. ' + SIN_REGISTRAR
  if (codigo === 'sin_entrada') return 'No tienes ninguna entrada abierta que cerrar. ' + SIN_REGISTRAR
  if (codigo === 'empleado_no_encontrado') return 'No te encuentro en RR.HH.: avisa al dueño para revisar tu identificador. ' + SIN_REGISTRAR
  if (codigo === 'empleado_inactivo') return 'Tu ficha de RR.HH. no está activa. ' + SIN_REGISTRAR
  if (codigo === 'fichaje_taller_no_habilitado') return 'RR.HH. no tiene habilitado el fichaje desde este taller. Avisa a Grupo ASegura. ' + SIN_REGISTRAR
  if (status === 401) return 'El taller no está bien conectado con RR.HH. (acceso rechazado). Avisa a Grupo ASegura. ' + SIN_REGISTRAR
  return `RR.HH. no ha podido registrar el fichaje (error ${status}). Inténtalo de nuevo. ${SIN_REGISTRAR}`
}

export async function enviarFichajeRrhh(o: {
  url: string; secreto: string; tallerId: string; empresaId: string; identificador: string; accion: AccionFichaje; ip: string | null
  fetchFn?: typeof fetch
}): Promise<ResultadoFichaje> {
  const f = o.fetchFn ?? fetch
  const id = o.identificador.trim()
  const cuerpo: Record<string, unknown> = { taller_id: o.tallerId, empresa_id: o.empresaId, accion: o.accion, ...(UUID.test(id) ? { empleado_id: id } : { dni: id }), ...(o.ip ? { ip: o.ip } : {}) }
  let res: Response
  try {
    res = await f(`${o.url.replace(/\/+$/, '')}/api/operador/fichajes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${o.secreto}` },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 502, error: `No se ha podido contactar con RR.HH. ${SIN_REGISTRAR} Inténtalo de nuevo en un momento.` }
  }
  const j = (await res.json().catch(() => ({}))) as { codigo?: string }
  if (!res.ok) return { ok: false, status: res.status === 409 || res.status === 404 || res.status === 403 ? 409 : 502, error: mensajeErrorRrhh(res.status, j.codigo) }
  return { ok: true, accion: o.accion }
}

type TxFichar = {
  usuarioTaller: { findFirst(a: unknown): Promise<{ rrhhIdentificador: string | null; activo: boolean } | null> }
  taller: { findFirst(a: unknown): Promise<{ rrhhEmpresaId: string | null } | null> }
}

/** Usuario + PIN → su identificador y la empresa rrhh del taller → envío. */
export async function ficharConPin(
  deps: { conTaller: ConTaller<TxFichar>; fetchFn?: typeof fetch; env?: Record<string, string | undefined>; secreto?: () => string },
  o: { tallerId: string; usuarioId: unknown; ip: string; pin: unknown; accion: unknown; ahora: Date },
): Promise<ResultadoFichaje | { ok: false; status: 400 | 401 | 429 | 503 | 422; error: string }> {
  const env = deps.env ?? process.env
  if (!fichajeRrhhDisponible(env)) return { ok: false, status: 503, error: 'El fichaje no está activado en este taller' }
  if (!ACCIONES.includes(o.accion as AccionFichaje)) return { ok: false, status: 400, error: 'Acción no válida' }
  const accion = o.accion as AccionFichaje

  const r = await loginTaller(deps.conTaller as never, { tallerId: o.tallerId, usuarioId: o.usuarioId, ip: o.ip, pin: o.pin, ahora: o.ahora })
  if (!r.ok) {
    if (r.motivo === 'usuario') return { ok: false, status: 401, error: 'Elige tu nombre de la lista' }
    if (r.motivo === 'formato') return { ok: false, status: 400, error: 'El PIN son 4 dígitos' }
    if (r.motivo === 'bloqueado') return { ok: false, status: 429, error: `Demasiados intentos. Prueba en ${r.minutos} min` }
    return { ok: false, status: 401, error: `PIN incorrecto. Te quedan ${r.intentosRestantes}` }
  }
  const vinculo = await deps.conTaller(o.tallerId, async (tx) => {
    const u = await tx.usuarioTaller.findFirst({ where: { tallerId: o.tallerId, id: r.credencial.usuarioId }, select: { rrhhIdentificador: true, activo: true } })
    const t = await tx.taller.findFirst({ where: { id: o.tallerId }, select: { rrhhEmpresaId: true } })
    return { identificador: u?.activo ? u.rrhhIdentificador?.trim() || null : null, empresaId: t?.rrhhEmpresaId ?? null }
  })
  if (!vinculo.identificador || !vinculo.empresaId) {
    return { ok: false, status: 422, error: 'Tu usuario no está vinculado a RR.HH. Pídele al dueño que lo configure en Ajustes. El fichaje NO se ha registrado.' }
  }
  return enviarFichajeRrhh({
    url: String(env.RRHH_URL), secreto: (deps.secreto ?? (() => requireSecret('RRHH_FICHAJE_TALLER_SECRET')))(),
    tallerId: o.tallerId, empresaId: vinculo.empresaId, identificador: vinculo.identificador, accion, ip: o.ip === 'sin-ip' ? null : o.ip, fetchFn: deps.fetchFn,
  })
}
