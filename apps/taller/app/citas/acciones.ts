'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { huecosDisponibles, instanteLocal } from '@central/module-taller'
import { conPermiso, configDe, mensajeDeAcceso } from '@/lib/contexto'
import { notificadorRegistro } from '@/lib/notificador'
import {
  aceptarCita, cargarExistentes, crearInvitacion, marcarNoPresentado, moverCita, rechazarCita, revocarInvitacion, type TxCitas,
} from '@/lib/citas'
import { origenPublico } from '@/lib/enlaces'

export type Resp<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

const uuid = z.string().uuid()
const fallo = (e: unknown, donde: string): { ok: false; errores: string[] } => {
  const m = mensajeDeAcceso(e)
  if (m) return { ok: false, errores: [m] }
  console.error(`[citas/${donde}]`, e)
  return { ok: false, errores: ['No se pudo completar. Inténtalo de nuevo'] }
}

const Invitar = z.object({ nombre: z.string().max(200), correo: z.string().max(200), matricula: z.string().max(20) })

/** «Invitar a pedir cita»: lo dispara el botón de una persona del taller. Devuelve el enlace UNA vez (en BD solo queda el hash). */
export async function invitarAccion(entrada: unknown): Promise<Resp<{ enlace: string; correoRegistrado: boolean; caducaEn: string }>> {
  const p = Invitar.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  const h = await headers()
  const origen = origenPublico(process.env, h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))
  try {
    return await conPermiso('citas', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) return { ok: false as const, errores: ['El taller no tiene configuración de alta'] }
      const r = await crearInvitacion(tx as unknown as TxCitas, {
        tallerId: c.tallerId, usuarioId: c.usuarioId, ...p.data, ahora: new Date(), config, origen,
      }, notificadorRegistro(tx as never, c.usuarioId))
      if (!r.ok) return { ok: false as const, errores: [r.mensaje] }
      revalidatePath('/citas')
      return { ok: true as const, enlace: `${origen ?? ''}/c/${r.token}`, correoRegistrado: r.correoRegistrado, caducaEn: r.caducaEn.toISOString() }
    })
  } catch (e) {
    return fallo(e, 'invitar')
  }
}

export async function revocarInvitacionAccion(id: unknown): Promise<Resp> {
  const i = uuid.safeParse(id)
  if (!i.success) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const ok = await revocarInvitacion(tx as unknown as TxCitas, { tallerId: c.tallerId, invitacionId: i.data, ahora: new Date() })
      revalidatePath('/citas')
      return ok ? { ok: true as const } : { ok: false as const, errores: ['La invitación ya no se puede anular'] }
    })
  } catch (e) {
    return fallo(e, 'revocar')
  }
}

const traducir = (r: { ok: boolean; mensaje?: string }): Resp => (r.ok ? { ok: true } : { ok: false, errores: [r.mensaje ?? 'No se pudo completar'] })

export async function aceptarCitaAccion(id: unknown): Promise<Resp> {
  const i = uuid.safeParse(id)
  if (!i.success) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const r = traducir(await aceptarCita(tx as unknown as TxCitas, { tallerId: c.tallerId, citaId: i.data }))
      revalidatePath('/citas')
      return r
    })
  } catch (e) {
    return fallo(e, 'aceptar')
  }
}

export async function rechazarCitaAccion(id: unknown, motivo: unknown): Promise<Resp> {
  const i = uuid.safeParse(id)
  const m = z.string().max(500).safeParse(motivo ?? '')
  if (!i.success || !m.success) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const r = traducir(await rechazarCita(tx as unknown as TxCitas, { tallerId: c.tallerId, citaId: i.data, motivo: m.data }))
      revalidatePath('/citas')
      return r
    })
  } catch (e) {
    return fallo(e, 'rechazar')
  }
}

export async function noPresentadoAccion(id: unknown): Promise<Resp> {
  const i = uuid.safeParse(id)
  if (!i.success) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const r = traducir(await marcarNoPresentado(tx as unknown as TxCitas, { tallerId: c.tallerId, citaId: i.data }))
      revalidatePath('/citas')
      return r
    })
  } catch (e) {
    return fallo(e, 'no-presentado')
  }
}

const Mover = z.object({ id: z.string().uuid(), inicio: z.string().max(40) })

export async function moverCitaAccion(entrada: unknown): Promise<Resp> {
  const p = Mover.safeParse(entrada)
  const t = p.success ? new Date(p.data.inicio) : null
  if (!p.success || !t || Number.isNaN(t.getTime())) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) return { ok: false as const, errores: ['El taller no tiene configuración de alta'] }
      const r = traducir(await moverCita(tx as unknown as TxCitas, { tallerId: c.tallerId, citaId: p.data.id, nuevoInicio: t, ahora: new Date(), config }))
      revalidatePath('/citas')
      return r
    })
  } catch (e) {
    return fallo(e, 'mover')
  }
}

const Libres = z.object({ id: z.string().uuid(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

/** Franjas a las que se puede mover una cita ese día (las mismas reglas del motor, sin antelación mínima). */
export async function huecosParaMoverAccion(entrada: unknown): Promise<Resp<{ huecos: Array<{ inicio: string; hora: string }> }>> {
  const p = Libres.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  try {
    return await conPermiso('citas', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      const cita = await (tx as unknown as TxCitas).cita.findFirst({ where: { tallerId: c.tallerId, id: p.data.id } })
      if (!config || !cita?.servicio) return { ok: false as const, errores: ['Esta cita no se puede mover'] }
      const ahora = new Date()
      const ex = await cargarExistentes(tx as unknown as TxCitas, { tallerId: c.tallerId, desde: new Date(ahora.getTime() - 86_400_000), ahora, excepto: cita.id })
      const z = config.agenda.zonaHoraria
      const hs = huecosDisponibles(config, ex, cita.servicio, instanteLocal(p.data.fecha, '00:00', z), instanteLocal(p.data.fecha, '23:59', z), ahora, { comoTaller: true })
      return { ok: true as const, huecos: hs.map((h) => ({ inicio: h.inicio.toISOString(), hora: h.hora })) }
    })
  } catch (e) {
    return fallo(e, 'huecos-mover')
  }
}
