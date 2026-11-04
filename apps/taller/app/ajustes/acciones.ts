'use server'
// Acciones de Ajustes. TODAS: sesión → taller de la sesión → conTaller (RLS) → re-comprobar dueño en BD →
// cambio validado (validarConfig) → auditoría antes/después. Nada se fía de lo que llega del navegador.
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { conTaller, type Tx } from '@/lib/db'
import { getSession } from '@/lib/session'
import { usuarioConRol, type Acceso } from '@/lib/acceso'
import { aplicarAjuste, type CambioAjustes } from '@/lib/ajustes'
import { auditar, guardarConfig, leerConfig, type TxConfig } from '@/lib/config-repo'
import { altaUsuario, bajaUsuario, ErrorPersonal, guardarProveedor, resetPinUsuario, ROLES, type TxPersonal } from '@/lib/personal'

export type Respuesta<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

class NoAutorizado extends Error {}

async function comoDueno<T>(fn: (tx: Tx, s: Acceso) => Promise<T>): Promise<T> {
  const s = await getSession()
  if (!s) throw new NoAutorizado('sin sesión')
  return conTaller(s.tallerId, async (tx) => {
    if (!(await usuarioConRol(tx as never, s, ['dueno']))) throw new NoAutorizado('solo el dueño')
    return fn(tx, s)
  }, { timeout: 20_000 })
}

async function responder<T extends object>(fn: () => Promise<T>): Promise<Respuesta<T>> {
  try {
    const r = await fn()
    revalidatePath('/ajustes')
    return { ok: true, ...r }
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, errores: ['Solo el dueño puede cambiar los ajustes'] }
    if (e instanceof ErrorPersonal) return { ok: false, errores: [e.message] }
    if (e && typeof e === 'object' && 'errores' in e && Array.isArray((e as { errores: unknown }).errores)) {
      return { ok: false, errores: (e as { errores: string[] }).errores }
    }
    console.error('[ajustes]', e)
    return { ok: false, errores: ['No se pudo guardar. Inténtalo de nuevo'] }
  }
}

const ent = z.number().int().safe()
const txt = z.string().max(200)
const Cambio = z.discriminatedUnion('seccion', [
  z.object({ seccion: z.literal('mano_obra'), precioHoraCent: ent }),
  z.object({
    seccion: z.literal('iva_defecto'),
    ivaPorDefecto: z.object({ mano_obra: txt, pieza: txt, granel: txt, otro: txt }),
  }),
  z.object({
    seccion: z.literal('intervalos'),
    intervalos: z.object({
      itvAntelacionDias: ent, revisionFechaAntelacionDias: ent, revisionKmAntelacion: ent,
      seguroAntelacionDias: ent, recordatorioCitaHoras: ent,
    }),
  }),
  z.object({
    seccion: z.literal('tipos_vehiculo'),
    tipos: z.array(z.object({ codigo: txt, nombre: txt, recargoPuntosBasicos: ent, activo: z.boolean() })).max(100),
  }),
  z.object({
    seccion: z.literal('paquetes'),
    paquetes: z.array(z.object({
      codigo: txt, nombre: txt, baremoMinutos: ent, requiereAceite: z.boolean(), activo: z.boolean(),
      precioCerradoPorTipo: z.record(ent),
    })).max(1000),
  }),
  z.object({
    seccion: z.literal('aceites'),
    aceites: z.array(z.object({
      codigo: txt, nombre: txt, familia: txt, precioLitroCent: ent, ivaCodigo: txt.optional(), activo: z.boolean(),
    })).max(1000),
  }),
  z.object({
    seccion: z.literal('ivas'),
    ivas: z.array(z.object({ codigo: txt, nombre: txt, puntosBasicos: ent })).max(20),
  }),
  z.object({
    seccion: z.literal('series'),
    series: z.array(z.object({ codigo: txt, prefijo: z.string().max(10), descripcion: txt, rectificativa: z.boolean(), porDefecto: z.boolean() })).max(20),
  }),
  z.object({
    seccion: z.literal('horario'),
    franjas: z.array(z.object({ diaSemana: ent, desde: z.string().max(5), hasta: z.string().max(5) })).max(50),
    duracionHuecoMinutos: ent,
    puestos: ent,
  }),
  z.object({
    seccion: z.literal('textos'),
    textos: z.object({
      pieResguardo: z.string().max(4000), pieFactura: z.string().max(4000),
      condicionesPresupuesto: z.string().max(8000), firmaCorreo: z.string().max(2000),
    }),
    validezPresupuestoDias: ent,
  }),
  z.object({
    seccion: z.literal('medios_cobro'),
    medios: z.array(z.object({ codigo: txt, nombre: txt, esEfectivo: z.boolean(), activo: z.boolean() })).max(100),
  }),
])

export async function guardarAjuste(entrada: unknown): Promise<Respuesta> {
  const p = Cambio.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const antes = await leerConfig(tx as unknown as TxConfig, s.tallerId)
      if (!antes) throw { errores: ['El taller no tiene configuración de alta (0002 sin aplicar)'] }
      const r = aplicarAjuste(antes, p.data as CambioAjustes)
      if (!r.ok) throw { errores: r.errores }
      await guardarConfig(tx as unknown as TxConfig, s.tallerId, r.config)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'configuracion', accion: `ajustes:${p.data.seccion}`,
        antes, despues: r.config,
      })
      return {}
    }),
  )
}

const Datos = z.object({ razonSocial: txt, nombreComercial: txt, nif: z.string().max(20) })

export async function guardarDatosTaller(entrada: unknown): Promise<Respuesta> {
  const p = Datos.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  const d = { razonSocial: p.data.razonSocial.trim(), nombreComercial: p.data.nombreComercial.trim(), nif: p.data.nif.trim().toUpperCase() }
  if (!d.razonSocial || !d.nombreComercial) return { ok: false, errores: ['Faltan la razón social o el nombre comercial'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const antes = await tx.taller.findFirst({ where: { id: s.tallerId }, select: { razonSocial: true, nombreComercial: true, nif: true } })
      // NIF vacío = no se sabe (NULL), nunca una cadena vacía que parezca un dato.
      const despues = { razonSocial: d.razonSocial, nombreComercial: d.nombreComercial, nif: d.nif || null }
      await tx.taller.update({ where: { id: s.tallerId }, data: despues })
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'talleres', entidadId: s.tallerId, accion: 'ajustes:datos', antes, despues,
      })
      return {}
    }),
  )
}

const Alta = z.object({ nombre: txt, rol: z.enum(ROLES) })

export async function altaPersona(entrada: unknown): Promise<Respuesta<{ pin: string }>> {
  const p = Alta.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const r = await altaUsuario(tx as unknown as TxPersonal, s.tallerId, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: r.id, accion: 'alta',
        antes: null, despues: { nombre: p.data.nombre, rol: p.data.rol },
      })
      return { pin: r.pin }
    }),
  )
}

const Id = z.string().uuid()

export async function bajaPersona(id: unknown): Promise<Respuesta> {
  const p = Id.safeParse(id)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      await bajaUsuario(tx as unknown as TxPersonal, s.tallerId, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: p.data, accion: 'baja',
        antes: { activo: true }, despues: { activo: false },
      })
      return {}
    }),
  )
}

export async function resetPinPersona(id: unknown): Promise<Respuesta<{ pin: string }>> {
  const p = Id.safeParse(id)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const r = await resetPinUsuario(tx as unknown as TxPersonal, s.tallerId, p.data)
      // Nunca el PIN ni su hash en la auditoría.
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: p.data, accion: 'reset_pin',
        antes: null, despues: { pin: 'regenerado' },
      })
      return { pin: r.pin }
    }),
  )
}

const Prov = z.object({ id: Id.optional(), nombre: txt, correo: z.string().max(200), activo: z.boolean().optional() })

export async function guardarProveedorAccion(entrada: unknown): Promise<Respuesta> {
  const p = Prov.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const id = await guardarProveedor(tx as unknown as TxPersonal, s.tallerId, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'proveedores', entidadId: id,
        accion: p.data.id ? 'editar' : 'alta', antes: null, despues: { nombre: p.data.nombre, correo: p.data.correo, activo: p.data.activo },
      })
      return {}
    }),
  )
}
