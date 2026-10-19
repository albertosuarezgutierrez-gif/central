// Sesión MANUAL persistida (07/10/2026): para portales con SMS en el acceso (Generali). Ver boveda-sesion.ts.
//
// Dónde vive: en asegura (BD), como blob OPACO sellado aquí con una clave que solo tiene el worker. No en un volumen
// de Fly: las máquinas son efímeras (una por trabajo, auto_destroy) y un volumen ata a un host y a una máquina a la vez.
// El worker no tiene BD (variables prohibidas): el almacén es HTTP contra asegura con el Bearer del worker.
//
// Reglas: sin sesión, caducada o ilegible → el robot NO intenta login (eso dispararía otro SMS): `requiere_humano`.
//         Sesión que el portal rechaza (vuelta al login / pantalla de código) → se BORRA y `requiere_humano`.
//         Tras un trabajo bueno se re-sella el estado refrescado con la caducidad ORIGINAL (el uso no la alarga).

import { ErrorTarificador } from './errores.ts'
import { CADUCIDAD_DISPOSITIVO_MS, NOMBRE_CLAVE_SESION, abrirSesion, sellarSesion, type SesionAbierta } from './boveda-sesion.ts'
import type { EstadoNavegador } from './sesion.ts'

/** Almacén del blob sellado. `leer` → `null` SOLO si el almacén dice «no hay» (404); otro fallo lanza (no es «no hay»). */
export interface AlmacenSesion {
  leer(compania: string): Promise<string | null>
  guardar(compania: string, token: string, caduca: number): Promise<void>
  borrar(compania: string): Promise<void>
}

export type Carga =
  | { estado: 'ok'; sesion: SesionAbierta }
  /** No hay sesión dada de alta, caducó o no abre: hace falta que Alberto la dé de alta. */
  | { estado: 'falta'; motivo: 'ninguna' | 'caducada' | 'invalida' }

export class GestorSesionManual {
  constructor(
    private readonly almacen: AlmacenSesion,
    private readonly o: { clave: Buffer; maxMs: number; ahora?: () => number },
  ) {}

  private ahora(): number {
    return (this.o.ahora ?? Date.now)()
  }

  /** Lee y abre. Caducada o ilegible → se borra del almacén (no se deja basura que parezca viva). */
  async cargar(compania: string): Promise<Carga> {
    const token = await this.almacen.leer(compania)
    if (token === null) return { estado: 'falta', motivo: 'ninguna' }
    const a = abrirSesion(token, { compania, clave: this.o.clave, ahora: this.ahora() })
    if (a.estado === 'ok') return a
    await this.almacen.borrar(compania)
    return { estado: 'falta', motivo: a.estado }
  }

  /** El portal no aceptó la sesión: fuera. */
  async invalidar(compania: string): Promise<void> {
    await this.almacen.borrar(compania)
  }

  /** Sella y guarda un estado NUEVO con la caducidad completa (`maxMs` desde ahora): solo tras una verificación hecha. */
  async guardarNueva(compania: string, estado: EstadoNavegador): Promise<number> {
    const { token, caduca } = sellarSesion(estado, { compania, clave: this.o.clave, ahora: this.ahora(), maxMs: this.o.maxMs })
    await this.almacen.guardar(compania, token, caduca)
    return caduca
  }

  /** Re-sella el estado refrescado tras un trabajo bueno SIN alargar la caducidad de la sesión original. */
  async refrescar(compania: string, estado: EstadoNavegador, caducaOriginal: number): Promise<void> {
    const ahora = this.ahora()
    if (ahora >= caducaOriginal) return
    const { token, caduca } = sellarSesion(estado, { compania, clave: this.o.clave, ahora, maxMs: this.o.maxMs, caducaPedida: caducaOriginal })
    await this.almacen.guardar(compania, token, caduca)
  }
}

/**
 * Almacén en asegura: `GET|PUT|DELETE /api/tarificador/sesion/<compania>` con el Bearer del worker.
 * ⏳ PENDIENTE en apps/asegura (ruta + tabla con el blob opaco y `caduca_en`). Mientras no exista, GET da 404 →
 * «no hay sesión» → `requiere_humano`: el robot no entra nunca. Un 5xx o la red caída NO es «no hay»: es `infra`.
 */
export function almacenHttp(c: { apiUrl: string; secreto: string }): AlmacenSesion {
  const url = (compania: string) => `${c.apiUrl}/api/tarificador/sesion/${encodeURIComponent(compania.trim().toLowerCase())}`
  const auth = { Authorization: `Bearer ${c.secreto}` }
  const fallo = (op: string, status: number) => new ErrorTarificador('infra', `almacén de sesión: ${op} respondió ${status}`)
  return {
    async leer(compania) {
      const res = await fetch(url(compania), { headers: auth, signal: AbortSignal.timeout(15_000) })
      if (res.status === 404) return null
      if (!res.ok) throw fallo('leer', res.status)
      const j = (await res.json()) as { token?: unknown }
      return typeof j.token === 'string' && j.token ? j.token : null
    },
    async guardar(compania, token, caduca) {
      const res = await fetch(url(compania), {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, caducaEn: new Date(caduca).toISOString() }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        // El motivo de asegura (`caduca_excesiva`, `sesion_sin_activar`, `token_formato`…) es un código, nunca el token.
        const j = (await res.json().catch(() => null)) as { estado?: unknown; motivo?: unknown } | null
        const m = codigoSeguro(j?.motivo) ?? codigoSeguro(j?.estado)
        throw new ErrorTarificador('infra', `almacén de sesión: guardar respondió ${res.status}${m ? ` (${m})` : ''}`)
      }
    },
    async borrar(compania) {
      const res = await fetch(url(compania), { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(15_000) })
      if (!res.ok && res.status !== 404) throw fallo('borrar', res.status)
    },
  }
}

/** Un código corto de asegura (`caduca_excesiva`…) o `null`: nada que no sea `[a-z0-9_]` sale al log ni al mensaje. PURA. */
function codigoSeguro(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v) ? v : null
}

/**
 * Motivo SIN DATOS SENSIBLES de un fallo de la bóveda (19/10/2026, prueba real b41be722: SMS verificado y 0 filas en
 * `seguros.tarificador_sesiones`; el `catch` solo dejaba «dispositivo_no_guardado» en el stdout de una máquina efímera).
 * Solo códigos fijos o el estado HTTP del almacén: nunca el token, la clave ni el estado del navegador. PURA.
 */
export function motivoFalloBoveda(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (m.includes(NOMBRE_CLAVE_SESION)) return /32 bytes/.test(m) ? 'clave_mal_formada' : 'sin_clave'
  const http = /^almacén de sesión: (leer|guardar|borrar) respondió (\d{1,3})(?: \(([a-z0-9_]{1,40})\))?$/.exec(m)
  if (http) return `almacen_${http[1]}_${http[2]}${http[3] ? `_${http[3]}` : ''}`
  const nombre = e instanceof Error ? e.name : ''
  if (nombre === 'TimeoutError' || nombre === 'AbortError') return 'almacen_tiempo'
  if (nombre === 'TypeError' && /fetch/i.test(m)) return 'almacen_red'
  return 'desconocido'
}

/** Lo que el runner necesita de una fuente de sesión (estructural con `FuenteSesion` de runner.ts). */
export type FuenteDispositivo = {
  manual: false
  previa: () => EstadoNavegador | null
  alExito: (estado: EstadoNavegador) => Promise<void>
  alFallo: (rechazada: boolean) => Promise<void>
  alVerificar: (estado: EstadoNavegador) => Promise<void>
  /** `null` = nada que contar; si no, por qué el dispositivo NO quedó en la bóveda (sin datos sensibles; va al mensaje del error). */
  notaBoveda: () => string | null
}

/**
 * Fuente del DISPOSITIVO DE CONFIANZA (19/10/2026, Generali/Okta). Arranca con el estado de la bóveda (si lo hay); tras una
 * verificación del SMS guarda el estado NUEVO con 30 días EN ESE MOMENTO (justo tras pasar el login/SMS, antes del segundo
 * intento: la sesión vale aunque luego el mapa falle); tras un trabajo bueno re-sella el refrescado con la caducidad que ya
 * tenía (el uso no la alarga). Un fallo del trabajo NO borra nada. Sin gestor (sin `TARIFICADOR_SESION_KEY`) solo vive en
 * memoria de este proceso. Un fallo al guardar NO para el trabajo: se registra (`dispositivo_no_guardado` + motivo sin
 * datos) y queda en `notaBoveda` para el mensaje del resultado (el stdout de la máquina efímera se pierde).
 */
export function fuenteDispositivo(
  gestor: GestorSesionManual | null,
  compania: string,
  inicial: SesionAbierta | null,
  o: { log: (m: string, d?: Record<string, unknown>) => void; motivoSinBoveda?: string; ahora?: () => number },
): FuenteDispositivo {
  const ahora = o.ahora ?? Date.now
  let actual: { valor: EstadoNavegador; caduca: number } | null = inicial ? { valor: inicial.valor, caduca: inicial.caduca } : null
  let nota: string | null = null
  return {
    manual: false,
    previa: () => (actual && ahora() < actual.caduca ? actual.valor : null),
    alExito: async (estado) => {
      if (!actual) return
      actual = { valor: estado, caduca: actual.caduca }
      if (gestor) await gestor.refrescar(compania, estado, actual.caduca)
    },
    alFallo: async () => undefined,
    alVerificar: async (estado) => {
      actual = { valor: estado, caduca: ahora() + CADUCIDAD_DISPOSITIVO_MS }
      if (!gestor) {
        const motivo = o.motivoSinBoveda ?? 'sin_clave'
        nota = `dispositivo no guardado en la bóveda (${motivo})`
        o.log('dispositivo_no_guardado', { motivo })
        return
      }
      try {
        const caduca = await gestor.guardarNueva(compania, estado)
        actual = { valor: estado, caduca }
        nota = null
        o.log('dispositivo_guardado', { caducaEn: new Date(caduca).toISOString() })
      } catch (e) {
        const motivo = motivoFalloBoveda(e)
        nota = `dispositivo no guardado en la bóveda (${motivo})`
        o.log('dispositivo_no_guardado', { motivo })
      }
    },
    notaBoveda: () => nota,
  }
}

/**
 * Estado del DISPOSITIVO de confianza en SOLO LECTURA (prueba nocturna de humo, 19/10/2026): abre el blob de la bóveda y nunca
 * escribe ni borra (ni siquiera el caducado: eso lo hace un trabajo de verdad). `motivo` sin datos sensibles. Nunca lanza.
 */
export async function leerDispositivo(
  almacen: Pick<AlmacenSesion, 'leer'>,
  clave: Buffer,
  compania: string,
  ahora: number = Date.now(),
): Promise<{ estado: EstadoNavegador | null; motivo: string }> {
  try {
    const token = await almacen.leer(compania)
    if (token === null) return { estado: null, motivo: 'ninguna' }
    const a = abrirSesion(token, { compania, clave, ahora })
    return a.estado === 'ok' ? { estado: a.sesion.valor, motivo: 'ok' } : { estado: null, motivo: a.estado }
  } catch (e) {
    return { estado: null, motivo: motivoFalloBoveda(e) }
  }
}
