/**
 * «Mis carnés» — el cliente da de alta, corrige y quita SUS carnés de conducir (06/10/2026). Reglas PURAS
 * del lado del portal: qué acepta la API (`/api/mis-datos/carnets`), cómo se lee la respuesta del puente
 * (`POST/PATCH/DELETE /api/portal/carnets` de `apps/asegura`) y qué se le dice a la persona.
 *
 * ─── Por qué la escritura no vive aquí ───────────────────────────────────────
 * La fecha de expedición va CIFRADA con `PII_ENCRYPTION_KEY`, que este portal no tiene. La escribe
 * `apps/asegura` con la MISMA función que usa el corredor (`guardarCarnet`: `revisarCarnet`, cifrado, uno por
 * tipo). Aquí solo viaja lo que la persona teclea, y de vuelta solo cómo salió.
 *
 * ─── De quién es el carné ────────────────────────────────────────────────────
 * La identidad la pone la COOKIE (`requireIdentidad`), nunca el cuerpo. El cuerpo trae el TITULAR elegido
 * (`fichaId`): asegura lo comprueba contra `portal_vinculo` (vinculado y con nivel que opera) y, al editar o
 * borrar, que el carné sea de esa ficha. Aquí `fichaId` es solo una propuesta.
 *
 * ─── Lo que NO se le dice ────────────────────────────────────────────────────
 * 🚨 `sin_puente` (503: este despliegue no tiene el puente configurado) ≠ `error` (502: el puente no
 * contestó o falló). Ninguno de los dos culpa a la persona ni le dice «revisa lo que has escrito».
 */
import { z } from 'zod'

import type { ResultadoEscrituraCarnet } from './carnets-vista'

export type { ResultadoEscrituraCarnet } from './carnets-vista'

const Uuid = z.string().trim().uuid()
const Tipo = z.string().trim().min(1).max(10)
const Fecha = z.string().trim().min(1).max(20)

/** Cuerpo de `POST /api/mis-datos/carnets` y de `PATCH /api/mis-datos/carnets/[id]`. */
export const EntradaCarnet = z.object({ fichaId: Uuid, tipo: Tipo, fecha: Fecha })
/** Cuerpo de `DELETE /api/mis-datos/carnets/[id]`. */
export const EntradaBajaCarnet = z.object({ fichaId: Uuid })
/** El `[id]` de la URL. */
export const IdCarnet = Uuid

export type EntradaCarnet = z.infer<typeof EntradaCarnet>

export type OperacionCarnet =
  | ({ accion: 'alta' } & EntradaCarnet)
  | ({ accion: 'cambio'; id: string } & EntradaCarnet)
  | { accion: 'baja'; id: string; fichaId: string }

/** `null` = cuerpo o id que esta ruta no acepta (400). Nunca `as`: siempre `safeParse`. */
export function leerEscrituraCarnet(accion: OperacionCarnet['accion'], cuerpo: unknown, id?: unknown): OperacionCarnet | null {
  if (accion !== 'alta') {
    const i = IdCarnet.safeParse(id)
    if (!i.success) return null
    if (accion === 'baja') {
      const b = EntradaBajaCarnet.safeParse(cuerpo)
      return b.success ? { accion, id: i.data, fichaId: b.data.fichaId } : null
    }
    const c = EntradaCarnet.safeParse(cuerpo)
    return c.success ? { accion, id: i.data, ...c.data } : null
  }
  const a = EntradaCarnet.safeParse(cuerpo)
  return a.success ? { accion, ...a.data } : null
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/** Lee lo que contesta `apps/asegura`. Una forma rara es `error`, nunca `ok`. */
export function interpretarEscrituraCarnet(status: number, j: unknown): ResultadoEscrituraCarnet {
  const estado = esObjeto(j) && typeof j.estado === 'string' ? j.estado : null
  if (estado === 'ok' && status >= 200 && status < 300 && esObjeto(j) && typeof j.id === 'string') return { estado: 'ok', id: j.id }
  if (estado === 'invalido' && esObjeto(j)) {
    const motivo = typeof j.motivo === 'string' && j.motivo !== 'datos_invalidos' ? j.motivo : 'dato no válido'
    return { estado: 'invalido', motivo, ...(typeof j.campo === 'string' ? { campo: j.campo } : {}) }
  }
  if (estado === 'duplicado') return { estado: 'duplicado' }
  if (estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (estado === 'sin_permiso') return { estado: 'sin_permiso' }
  if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  return { estado: 'error', causa: `puente_${status}_${estado ?? 'sin_estado'}` }
}

/** HTTP de la API del portal. */
export function statusEscrituraCarnet(estado: ResultadoEscrituraCarnet['estado'], alta = false): number {
  switch (estado) {
    case 'ok':
      return alta ? 201 : 200
    case 'invalido':
      return 422
    case 'duplicado':
    case 'sin_ficha':
      return 409
    case 'no_encontrado':
      return 404
    case 'sin_permiso':
      return 403
    case 'sin_puente':
      return 503
    default:
      return 502
  }
}
