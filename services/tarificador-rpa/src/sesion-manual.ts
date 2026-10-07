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
import { abrirSesion, sellarSesion, type SesionAbierta } from './boveda-sesion.ts'
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
      if (!res.ok) throw fallo('guardar', res.status)
    },
    async borrar(compania) {
      const res = await fetch(url(compania), { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(15_000) })
      if (!res.ok && res.status !== 404) throw fallo('borrar', res.status)
    },
  }
}
