/**
 * El CLIENTE da de alta, corrige y quita SUS carnés de conducir desde el portal — la regla PURA del puente
 * `POST/PATCH/DELETE /api/portal/carnets` (06/10/2026). Sin BD: la lectura y la escritura viven en
 * `carnets-portal.ts`, que llama a las MISMAS `guardarCarnet`/`borrarCarnet` que el corredor
 * (`cartera-edicion.ts`: misma validación `revisarCarnet`, mismo cifrado de la fecha, uno por tipo).
 *
 * ─── De qué ficha es la escritura ────────────────────────────────────────────
 *  - La IDENTIDAD sale de la sesión del portal (viaja como `identidadId`, nunca un `clienteId`).
 *  - El portal manda la ficha DESTINO (`fichaId`): con varias fichas vinculadas el cliente elige titular.
 *    🚨 Esa ficha se acepta solo si está vinculada a la identidad CON nivel que opera (`fichaDeRecurso`,
 *    gestionar/administrar). Una ficha no vinculada, o vinculada solo para ver, se rechaza como «no es tuya».
 *  - Editar/borrar: el DUEÑO del carné se lee de BD y tiene que ser esa misma ficha. Un carné de otra
 *    ficha (aunque también sea suya) se rechaza: el `fichaId` no puede servir para mover un carné de titular.
 *  - Una ficha de EMPRESA no recibe carnés nuevos desde el portal: una SL no conduce (`carnets-titulares.ts`
 *    ya no la enseña como titular si no tiene ninguno).
 *
 * ─── Trazabilidad ────────────────────────────────────────────────────────────
 * Sin columna nueva: `historial_interno` lleva el texto con `PREFIJO_HISTORIAL_CARNET_PROPIO` (el muro lo
 * clasifica como `carnet`, y el aviso por Telegram de plataforma lo recoge) y nombra el acceso del portal por
 * los 8 primeros caracteres de su `identidadId`. La fecha del carné NUNCA va en el texto (va cifrada).
 */
import { z } from 'zod'

import { PREFIJO_HISTORIAL_CARNET_PROPIO } from '@central/module-seguros-portal'

import { fichaDeRecurso, type VinculoPortal } from './ficha-de-poliza.ts'

const Uuid = z.string().trim().uuid()
/** Texto corto: el tipo y la fecha los valida `revisarCarnet` (la misma regla que el corredor). */
const Tipo = z.string().trim().min(1).max(10)
const Fecha = z.string().trim().min(1).max(20)

export const AltaCarnetPortal = z.object({ identidadId: Uuid, fichaId: Uuid, tipo: Tipo, fecha: Fecha })
export const CambioCarnetPortal = z.object({ identidadId: Uuid, fichaId: Uuid, id: Uuid, tipo: Tipo, fecha: Fecha })
export const BajaCarnetPortal = z.object({ identidadId: Uuid, fichaId: Uuid, id: Uuid })

export type AltaCarnetPortal = z.infer<typeof AltaCarnetPortal>
export type CambioCarnetPortal = z.infer<typeof CambioCarnetPortal>
export type BajaCarnetPortal = z.infer<typeof BajaCarnetPortal>

export type OperacionCarnetPortal =
  | ({ accion: 'alta' } & AltaCarnetPortal)
  | ({ accion: 'cambio' } & CambioCarnetPortal)
  | ({ accion: 'baja' } & BajaCarnetPortal)

/**
 * Lee el cuerpo de una escritura. `null` = forma inválida (422 sin detalle: un cuerpo que esta ruta no
 * ofrece). Nunca `as`: siempre `safeParse`. Un `clienteId` en el cuerpo se IGNORA (Zod descarta lo que no
 * está en el esquema): la ficha la dice `fichaId` y se comprueba contra los vínculos.
 */
export function leerOperacionCarnet(metodo: string, cuerpo: unknown): OperacionCarnetPortal | null {
  if (metodo === 'POST') {
    const r = AltaCarnetPortal.safeParse(cuerpo)
    return r.success ? { accion: 'alta', ...r.data } : null
  }
  if (metodo === 'PATCH') {
    const r = CambioCarnetPortal.safeParse(cuerpo)
    return r.success ? { accion: 'cambio', ...r.data } : null
  }
  if (metodo === 'DELETE') {
    const r = BajaCarnetPortal.safeParse(cuerpo)
    return r.success ? { accion: 'baja', ...r.data } : null
  }
  return null
}

export type DestinoCarnet =
  | { estado: 'ok'; clienteId: string }
  /** La identidad no tiene ninguna ficha vinculada. */
  | { estado: 'sin_ficha' }
  /** No se escribe. `motivo` es para el log; hacia fuera es el mismo «no encontrado». */
  | { estado: 'ajena'; motivo: 'sin_dueno' | 'no_vinculada' | 'sin_permiso' | 'otra_ficha' | 'empresa' }

/**
 * Decide la ficha en la que se escribe.
 *  - `alta`: `duenoCarnet` no aplica (no hay carné aún); la ficha es `fichaId` si opera.
 *  - `cambio`/`baja`: `duenoCarnet` = `cliente_id` del carné leído de BD (`null` = no existe en esta
 *    correduría). Tiene que ser `fichaId` Y operable.
 *  - `tipoPersonaDestino`: `'juridica'` en un alta → rechazo (`empresa`). Desconocido (`null`) no bloquea.
 */
export function destinoCarnet(p: {
  accion: OperacionCarnetPortal['accion']
  vinculos: readonly VinculoPortal[]
  fichaId: string
  duenoCarnet?: string | null
  tipoPersonaDestino?: string | null
}): DestinoCarnet {
  const ficha = p.fichaId.trim()
  if (p.accion !== 'alta') {
    const dueno = typeof p.duenoCarnet === 'string' ? p.duenoCarnet.trim() : ''
    // Primero «¿es tuya la ficha?» y solo después «¿es de esa ficha el carné?»: así un carné ajeno y uno
    // inexistente acaban igual hacia fuera, sin que la respuesta diga si existe.
    const r = fichaDeRecurso(p.vinculos, ficha)
    if (r.estado !== 'ok') return r
    if (dueno === '') return { estado: 'ajena', motivo: 'sin_dueno' }
    if (dueno !== ficha) return { estado: 'ajena', motivo: 'otra_ficha' }
    return r
  }
  const r = fichaDeRecurso(p.vinculos, ficha)
  if (r.estado !== 'ok') return r
  if (p.tipoPersonaDestino === 'juridica') return { estado: 'ajena', motivo: 'empresa' }
  return r
}

/** Lo que contesta el puente al portal. Nunca lleva datos de la ficha: solo cómo salió. */
export type ResultadoCarnetPortalEscritura =
  | { estado: 'ok'; id: string }
  /** El dato no vale (tipo desconocido, fecha imposible/futura/antes de los 15). `motivo` se le puede enseñar. */
  | { estado: 'invalido'; motivo: string; campo?: string }
  /** Ya tiene un carné de ese tipo en esa ficha: que cambie su fecha en vez de añadir otro. */
  | { estado: 'duplicado'; campo?: string }
  /** El carné o la ficha no son suyos, o ya no existen. Ajeno e inexistente, iguales hacia fuera. */
  | { estado: 'no_encontrado' }
  | { estado: 'sin_ficha' }
  | { estado: 'error'; causa: string }

/**
 * Traduce lo que devuelve `guardarCarnet`/`borrarCarnet` (forma del corredor) a la del portal. El 409 de
 * «ya tiene carné B» es `duplicado`: el texto del corredor habla en tercera persona («Ya tiene…») y el
 * portal pone el suyo.
 */
export function traducirResultadoCarnet(
  r: { ok: true; id: string } | { ok: false; estado: string; motivo: string; campo?: string; status: number },
): ResultadoCarnetPortalEscritura {
  if (r.ok) return { estado: 'ok', id: r.id }
  if (r.estado === 'invalido' && r.status === 409) return { estado: 'duplicado', campo: r.campo }
  if (r.estado === 'invalido') return { estado: 'invalido', motivo: r.motivo, campo: r.campo }
  if (r.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  return { estado: 'error', causa: r.estado }
}

/** HTTP de cada estado. 503 solo para «no se ha podido mirar/escribir» (no es culpa del cliente). */
export function statusCarnetPortal(estado: ResultadoCarnetPortalEscritura['estado']): number {
  switch (estado) {
    case 'ok':
      return 200
    case 'invalido':
      return 422
    case 'duplicado':
      return 409
    case 'no_encontrado':
      return 404
    case 'sin_ficha':
      return 409
    default:
      return 503
  }
}

export type OrigenCarnet = { origen: 'plataforma'; actor: string } | { origen: 'portal'; identidadId: string }

/**
 * La línea de `historial_interno`. Plataforma: la de siempre («… desde plataforma por <actor>»). Portal:
 * con el prefijo compartido (el muro la clasifica como del cliente) y el acceso abreviado. Sin la fecha.
 */
export function textoHistorialCarnet(que: string, o: OrigenCarnet): string {
  if (o.origen === 'portal') {
    const acceso = o.identidadId.trim().slice(0, 8) || 'desconocido'
    return `${PREFIJO_HISTORIAL_CARNET_PROPIO} ${que} (acceso ${acceso})`
  }
  return `${que} desde plataforma por ${o.actor}`
}
