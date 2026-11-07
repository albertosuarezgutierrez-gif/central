'use server'
// Acciones de Ajustes. TODAS: sesión → taller de la sesión → conTaller (RLS) → capacidad re-leída en BD («ajustes», o
// «usuarios» para personas/roles; ambas reservadas al dueño en module-taller) →
// cambio validado (validarConfig) → auditoría antes/después. Nada se fía de lo que llega del navegador.
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { conTaller, type Tx } from '@/lib/db'
import { getSession } from '@/lib/session'
import { type Acceso } from '@/lib/acceso'
import { DebeCambiarPinError, exigir, SesionObsoletaError, SinPermisoError, type Capacidad } from '@/lib/permisos'
import { aplicarAjuste, type CambioAjustes } from '@/lib/ajustes'
import { auditar, guardarConfig, leerConfig, type TxConfig } from '@/lib/config-repo'
import { almacenActivo, mimeReal } from '@/lib/almacen'
import { direccionOpcional } from '@/lib/direccion'
import { ErrorMarca, guardarColores, guardarLogoRuta, type TxMarca } from '@/lib/marca-repo'
import { guardarIdentificadorRrhh, type TxVinculo } from '@/lib/vinculo-rrhh'
import { desbloquearTaller, fijarCodigoTaller } from '@/lib/bloqueos-ajustes'
import { altaUsuario, bajaUsuario, ErrorPersonal, guardarProveedor, guardarRolesUsuario, resetPinUsuario, ROLES, type TxPersonal } from '@/lib/personal'
import { CAPACIDADES, validarCapacidadesPorRol } from '@central/module-taller'

export type Respuesta<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

class NoAutorizado extends Error {}

/** Capacidad re-leída en BD (roles + config del taller). Un PIN temporal o una sesión obsoleta tampoco pasan. */
async function comoCon<T>(cap: Capacidad, fn: (tx: Tx, s: Acceso) => Promise<T>): Promise<T> {
  const s = await getSession()
  if (!s) throw new NoAutorizado('sin sesión')
  return conTaller(s.tallerId, async (tx) => {
    try {
      await exigir(tx as never, s, cap)
    } catch (e) {
      // Solo los errores de ACCESO se traducen; un fallo de BD sigue siendo un fallo (no «no tienes permiso»).
      if (e instanceof SinPermisoError || e instanceof DebeCambiarPinError || e instanceof SesionObsoletaError) throw new NoAutorizado(e.message)
      throw e
    }
    return fn(tx, s)
  }, { timeout: 20_000 })
}
const comoDueno = <T,>(fn: (tx: Tx, s: Acceso) => Promise<T>) => comoCon('ajustes', fn)
const comoGestorPersonas = <T,>(fn: (tx: Tx, s: Acceso) => Promise<T>) => comoCon('usuarios', fn)

async function responder<T extends object>(fn: () => Promise<T>): Promise<Respuesta<T>> {
  try {
    const r = await fn()
    revalidatePath('/ajustes')
    return { ok: true, ...r }
  } catch (e) {
    if (e instanceof NoAutorizado) return { ok: false, errores: ['Solo el dueño puede cambiar los ajustes'] }
    if (e instanceof ErrorPersonal || e instanceof ErrorMarca) return { ok: false, errores: [e.message] }
    // Índice único del código (0006): otro taller ya lo usa.
    if (e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002') return { ok: false, errores: ['Ese código ya lo usa otro taller: elige otro'] }
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
    seccion: z.literal('seguridad_login'),
    seguridad: z.object({
      maxFallosTaller: ent, ventanaMinutos: ent, bloqueoMinutos: ent, maxFallosUsuario: ent, bloqueoUsuarioMinutos: ent, sesionMinutos: ent, inactividadMinutos: ent,
    }),
  }),
  z.object({
    seccion: z.literal('horario'),
    franjas: z.array(z.object({ diaSemana: ent, desde: z.string().max(5), hasta: z.string().max(5) })).max(50),
    duracionHuecoMinutos: ent,
    puestos: ent,
  }),
  z.object({
    seccion: z.literal('agenda'),
    agenda: z.object({
      zonaHoraria: z.string().max(60),
      cierres: z.array(z.object({ fecha: z.string().max(10), motivo: z.string().max(200) })).max(400),
      maxCochesPorFranja: ent, ocupablePuntosBasicos: ent, margenEntreTrabajosMinutos: ent, antelacionMinimaHoras: ent,
      antelacionMaximaDias: ent, confirmacion: z.enum(['automatica', 'manual']), duracionDiagnosticoMinutos: ent, invitacionCaducaDias: ent,
    }),
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
    seccion: z.literal('retirada_fotos'),
    firmaObligatoria: z.boolean(),
    textoConformidad: z.string().max(4000),
    fotosRetencionDias: ent,
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

const Datos = z.object({
  razonSocial: txt, nombreComercial: txt, nif: z.string().max(20),
  direccion: z.object({ cp: z.string().max(5), provincia: z.string().max(100), municipio: z.string().max(100), via: z.string().max(200), numero: z.string().max(20) }),
})

export async function guardarDatosTaller(entrada: unknown): Promise<Respuesta> {
  const p = Datos.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  const d = { razonSocial: p.data.razonSocial.trim(), nombreComercial: p.data.nombreComercial.trim(), nif: p.data.nif.trim().toUpperCase() }
  if (!d.razonSocial || !d.nombreComercial) return { ok: false, errores: ['Faltan la razón social o el nombre comercial'] }
  // Dirección: CP → provincia → municipio → calle → número. Vacía = sin dirección; a medias, no se guarda.
  const dir = direccionOpcional(p.data.direccion)
  if (!dir.ok) return { ok: false, errores: dir.errores }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const antes = await tx.taller.findFirst({
        where: { id: s.tallerId }, select: { razonSocial: true, nombreComercial: true, nif: true, cp: true, provincia: true, municipio: true, via: true, numero: true },
      })
      // NIF vacío = no se sabe (NULL), nunca una cadena vacía que parezca un dato.
      const despues = {
        razonSocial: d.razonSocial, nombreComercial: d.nombreComercial, nif: d.nif || null,
        cp: dir.direccion?.cp ?? null, provincia: dir.direccion?.provincia ?? null, municipio: dir.direccion?.municipio ?? null,
        via: dir.direccion?.via ?? null, numero: dir.direccion?.numero ?? null,
        // Una dirección nueva invalida la referencia catastral de la anterior.
        ...(antes && (antes.via !== (dir.direccion?.via ?? null) || antes.numero !== (dir.direccion?.numero ?? null) || antes.cp !== (dir.direccion?.cp ?? null)) ? { referenciaCatastral: null } : {}),
      }
      await tx.taller.update({ where: { id: s.tallerId }, data: despues })
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'talleres', entidadId: s.tallerId, accion: 'ajustes:datos', antes, despues,
      })
      return {}
    }),
  )
}

// ── Marca (logo y colores): solo el dueño. El texto fijo «con Grupo ASegura» NO está aquí a propósito. ──
const Colores = z.object({ primario: z.string().max(9).nullable(), secundario: z.string().max(9).nullable() })

export async function guardarMarcaColores(entrada: unknown): Promise<Respuesta<{ avisos: string[] }>> {
  const p = Colores.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const ev = await guardarColores(tx as unknown as TxMarca, { tallerId: s.tallerId, usuarioId: s.usuarioId, ...p.data })
      revalidatePath('/', 'layout')
      return { avisos: ev.avisos }
    }),
  )
}

const MAX_LOGO = 1024 * 1024
export async function subirLogo(fd: FormData): Promise<Respuesta> {
  const f = fd.get('logo')
  if (!(f instanceof File) || f.size === 0) return { ok: false, errores: ['Elige un archivo de imagen'] }
  if (f.size > MAX_LOGO) return { ok: false, errores: ['El logo pesa más de 1 MB'] }
  const bytes = new Uint8Array(await f.arrayBuffer())
  const mime = mimeReal(bytes)
  if (!mime) return { ok: false, errores: ['El logo debe ser PNG, JPG o WebP'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const r = await almacenActivo().guardar({ tallerId: s.tallerId, carpeta: 'marca', nombre: 'logo', mime, bytes })
      await guardarLogoRuta(tx as unknown as TxMarca, { tallerId: s.tallerId, usuarioId: s.usuarioId, ruta: r.ruta })
      revalidatePath('/', 'layout')
      return {}
    }),
  )
}

export async function quitarLogo(): Promise<Respuesta> {
  return responder(() =>
    comoDueno(async (tx, s) => {
      await guardarLogoRuta(tx as unknown as TxMarca, { tallerId: s.tallerId, usuarioId: s.usuarioId, ruta: null })
      revalidatePath('/', 'layout')
      return {}
    }),
  )
}

const Rol = z.enum(ROLES)
const Cap = z.enum(CAPACIDADES)
// `rol` suelto se sigue aceptando (formularios viejos); lo nuevo es `roles` (uno o varios) + `capacidadesExtra`.
const Alta = z.object({ nombre: txt, rol: Rol.optional(), roles: z.array(Rol).max(ROLES.length).optional(), capacidadesExtra: z.array(Cap).max(CAPACIDADES.length).optional() })

export async function altaPersona(entrada: unknown): Promise<Respuesta<{ pin: string }>> {
  const p = Alta.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoGestorPersonas(async (tx, s) => {
      const r = await altaUsuario(tx as unknown as TxPersonal, s.tallerId, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: r.id, accion: 'alta',
        antes: null, despues: { nombre: p.data.nombre, roles: p.data.roles ?? [p.data.rol], capacidadesExtra: p.data.capacidadesExtra ?? [] },
      })
      return { pin: r.pin }
    }),
  )
}

const Id = z.string().uuid()

// ── Roles y capacidades (0014): solo quien tiene «usuarios» (el dueño). Nunca queda el taller sin dueño activo. ──
export async function guardarRolesPersona(entrada: unknown): Promise<Respuesta> {
  const p = z.object({ id: Id, roles: z.array(Rol).max(ROLES.length), capacidadesExtra: z.array(Cap).max(CAPACIDADES.length) }).safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoGestorPersonas(async (tx, s) => {
      const r = await guardarRolesUsuario(tx as unknown as TxPersonal, s.tallerId, p.data.id, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: p.data.id, accion: 'roles', antes: r.antes, despues: r.despues,
      })
      return {}
    }),
  )
}

/** Qué capacidades lleva cada rol en ESTE taller. `null` = volver a los valores por defecto. El dueño no se edita. */
export async function guardarCapacidadesPorRol(entrada: unknown): Promise<Respuesta> {
  const p = z.record(z.array(z.string().max(40)).max(CAPACIDADES.length)).nullable().safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  let valor: object | null = null
  if (p.data !== null) {
    const v = validarCapacidadesPorRol(p.data)
    if (!v.ok) return { ok: false, errores: v.errores }
    valor = v.valor
  }
  return responder(() =>
    comoGestorPersonas(async (tx, s) => {
      const antes = await tx.configuracion.findFirst({ where: { tallerId: s.tallerId }, select: { capacidadesPorRol: true } })
      if (!antes) throw { errores: ['El taller no tiene configuración de alta (0002 sin aplicar)'] }
      await tx.configuracion.update({
        where: { tallerId: s.tallerId },
        data: { capacidadesPorRol: valor === null ? Prisma.DbNull : (valor as Prisma.InputJsonValue), actualizadoEn: new Date() },
      })
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'configuracion', accion: 'ajustes:capacidades_por_rol',
        antes: antes.capacidadesPorRol ?? null, despues: valor,
      })
      return {}
    }),
  )
}

export async function bajaPersona(id: unknown): Promise<Respuesta> {
  const p = Id.safeParse(id)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoGestorPersonas(async (tx, s) => {
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
    comoGestorPersonas(async (tx, s) => {
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

const Prov = z.object({ id: Id.optional(), nombre: txt, correo: z.string().max(200), nif: z.string().max(20).nullable().optional(), activo: z.boolean().optional() })

export async function guardarProveedorAccion(entrada: unknown): Promise<Respuesta> {
  const p = Prov.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const id = await guardarProveedor(tx as unknown as TxPersonal, s.tallerId, p.data)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'proveedores', entidadId: id,
        accion: p.data.id ? 'editar' : 'alta', antes: null, despues: { nombre: p.data.nombre, correo: p.data.correo, nif: p.data.nif, activo: p.data.activo },
      })
      return {}
    }),
  )
}

// ── Vínculo con RR.HH. (fichaje): el taller solo ENVÍA el fichaje; aquí se guarda a quién corresponde ──
export async function guardarVinculoRrhhPersona(entrada: unknown): Promise<Respuesta<{ identificador: string | null }>> {
  const p = z.object({ id: Id, identificador: z.string().max(100) }).safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoGestorPersonas(async (tx, s) => {
      const identificador = await guardarIdentificadorRrhh(tx as unknown as TxVinculo, s.tallerId, p.data.id, p.data.identificador)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: p.data.id, accion: 'vinculo_rrhh',
        antes: null, despues: { vinculado: identificador !== null },
      })
      return { identificador }
    }),
  )
}

// ── Código del taller (paso 1 del login) y desbloqueo del tope por taller ──
export async function guardarCodigoTallerAccion(valor: unknown): Promise<Respuesta<{ codigo: string }>> {
  const p = z.string().max(40).nullable().safeParse(valor)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return responder(() =>
    comoDueno(async (tx, s) => {
      const codigo = await fijarCodigoTaller(tx as never, s.tallerId, p.data)
      // El código nuevo no se audita en claro con valor viejo: basta dejar constancia del cambio.
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'talleres', entidadId: s.tallerId, accion: 'codigo_acceso', antes: null, despues: { cambiado: true },
      })
      return { codigo }
    }),
  )
}

export async function desbloquearTallerAccion(): Promise<Respuesta> {
  return responder(() =>
    comoDueno(async (tx, s) => {
      await desbloquearTaller(tx as never, s.tallerId)
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'talleres', entidadId: s.tallerId, accion: 'desbloqueo_taller', antes: null, despues: { desbloqueado: true },
      })
      return {}
    }),
  )
}
