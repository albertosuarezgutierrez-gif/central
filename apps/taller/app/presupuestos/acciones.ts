'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { calcularPresupuesto, type LineaSolicitada } from '@central/module-taller'
import { conPermiso, configDe, mensajeDeAcceso } from '@/lib/contexto'
import { notificadorRegistro } from '@/lib/notificador'
import { crearPresupuestoDesdeOt, generarEnlace, reemplazarBorrador, type TxPresupuestos } from '@/lib/presupuestos'
import { auditar, type TxConfig } from '@/lib/config-repo'

export type Respuesta<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

const ent = z.number().int().safe()
const Linea = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('paquete'), paqueteCodigo: z.string().max(60), aceiteCodigo: z.string().max(60).nullable().optional(), litrosMl: ent.positive().nullable().optional() }),
  z.object({ tipo: z.literal('mano_obra'), descripcion: z.string().min(1).max(200), minutos: ent.positive(), ivaCodigo: z.string().max(60).optional() }),
  z.object({ tipo: z.literal('pieza'), descripcion: z.string().min(1).max(200), referencia: z.string().max(80).optional(), cantidad: ent.positive(), precioUnitarioCent: ent.nonnegative(), ivaCodigo: z.string().max(60).optional() }),
  z.object({ tipo: z.literal('granel'), aceiteCodigo: z.string().max(60), litrosMl: ent.positive().nullable(), ivaCodigo: z.string().max(60).optional() }),
  z.object({ tipo: z.literal('otro'), descripcion: z.string().min(1).max(200), cantidad: ent.positive(), precioUnitarioCent: ent.nonnegative(), ivaCodigo: z.string().max(60).optional() }),
])
const Entrada = z.object({
  otId: z.string().uuid(),
  tipoVehiculo: z.string().max(60).nullable(),
  lineas: z.array(Linea).min(1).max(60),
  soloCalcular: z.boolean(),
})

async function resp<R>(fn: () => Promise<R>): Promise<R | { ok: false; errores: string[] }> {
  try {
    return await fn()
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return { ok: false, errores: [m] }
    console.error('[presupuestos]', e)
    return { ok: false, errores: ['No se pudo completar. Inténtalo de nuevo'] }
  }
}

/** Calcula (sin guardar) o crea el presupuesto de una OT con la configuración VIGENTE del taller. */
export async function crearPresupuestoAccion(entrada: unknown): Promise<Respuesta<{ presupuestoId: string | null; totalCent: number | null }>> {
  const p = Entrada.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return resp(() =>
    conPermiso('presupuestos', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) return { ok: false as const, errores: ['El taller no tiene configuración de alta'] }
      const lineas = p.data.lineas as LineaSolicitada[]
      if (p.data.soloCalcular) {
        const r = calcularPresupuesto(config, { tipoVehiculo: p.data.tipoVehiculo, lineas })
        return r.ok ? { ok: true as const, presupuestoId: null, totalCent: r.presupuesto.totalCent } : { ok: false as const, errores: r.errores }
      }
      const r = await crearPresupuestoDesdeOt(tx as unknown as TxPresupuestos, {
        tallerId: c.tallerId, otId: p.data.otId, tipoVehiculo: p.data.tipoVehiculo, lineas, ahora: new Date(),
      }, config)
      if (!r.ok) return { ok: false as const, errores: r.errores }
      revalidatePath('/presupuestos'); revalidatePath('/ordenes')
      return { ok: true as const, presupuestoId: r.presupuestoId, totalCent: null }
    }),
  )
}

/** Genera el enlace público. El token solo se devuelve AQUÍ, una vez; en BD queda su hash. */
export async function generarEnlaceAccion(presupuestoId: unknown): Promise<Respuesta<{ ruta: string }>> {
  const id = z.string().uuid().safeParse(presupuestoId)
  if (!id.success) return { ok: false, errores: ['Datos inválidos'] }
  return resp(() =>
    conPermiso('presupuestos', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) return { ok: false as const, errores: ['El taller no tiene configuración de alta'] }
      const r = await generarEnlace(tx as unknown as TxPresupuestos, { tallerId: c.tallerId, presupuestoId: id.data, ahora: new Date(), config })
      if (!r.ok) return { ok: false as const, errores: [r.motivo] }
      // F1: no se envía correo real; se deja constancia de lo que se enviaría (puerto «registrar»).
      const pres = await tx.presupuesto.findFirst({ where: { tallerId: c.tallerId, id: id.data } })
      const cli = pres?.clienteId ? await tx.cliente.findFirst({ where: { tallerId: c.tallerId, id: pres.clienteId } }) : null
      if (cli?.correo) {
        await notificadorRegistro(tx as never, c.usuarioId).enviar({
          tallerId: c.tallerId, tipo: 'presupuesto', a: cli.correo, asunto: 'Tu presupuesto', texto: config.textos.firmaCorreo, referencia: id.data,
        })
      }
      void (await headers())
      revalidatePath(`/presupuestos/${id.data}`)
      return { ok: true as const, ruta: `/p/${r.token}` }
    }),
  )
}

const Reemplazo = z.object({
  presupuestoId: z.string().uuid(),
  tipoVehiculo: z.string().max(60).nullable(),
  lineas: z.array(Linea).min(1).max(60),
})

/** Rehace un presupuesto en BORRADOR con la configuración vigente. Enviado o aceptado: se rechaza (hay que hacer otro). */
export async function reemplazarBorradorAccion(entrada: unknown): Promise<Respuesta<{ presupuestoId: string }>> {
  const p = Reemplazo.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return resp(() =>
    conPermiso('presupuestos', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) return { ok: false as const, errores: ['El taller no tiene configuración de alta'] }
      const antes = await tx.presupuesto.findFirst({ where: { tallerId: c.tallerId, id: p.data.presupuestoId } })
      const r = await reemplazarBorrador(tx as unknown as TxPresupuestos, {
        tallerId: c.tallerId, presupuestoId: p.data.presupuestoId, tipoVehiculo: p.data.tipoVehiculo, lineas: p.data.lineas as LineaSolicitada[], ahora: new Date(),
      }, config)
      if (!r.ok) return { ok: false as const, errores: r.errores }
      await auditar(tx as unknown as TxConfig, {
        tallerId: c.tallerId, usuarioId: c.usuarioId, entidad: 'presupuestos', entidadId: r.presupuestoId, accion: 'borrador_rehecho',
        antes: antes ? { totalCent: Number(antes.totalCent) } : null, despues: { lineas: p.data.lineas.length },
      })
      revalidatePath('/presupuestos'); revalidatePath(`/presupuestos/${r.presupuestoId}`)
      return { ok: true as const, presupuestoId: r.presupuestoId }
    }),
  )
}
