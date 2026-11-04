/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Citas por enlace y agenda con capacidad (spec «Citas por enlace y agenda con capacidad»). Siempre dentro de `conTaller`.
//
//   · INVITACIÓN: la crea una persona del taller con un botón. Token de 256 bits (el mismo formato que los presupuestos:
//     `<taller sin guiones>.<32 bytes base64url>`); en BD SOLO su SHA-256; caduca a los N días de la config; un solo uso.
//   · RESERVA: el cliente escribe su matrícula y elige una franja del motor de `module-taller`. La reserva es ATÓMICA:
//     candado de transacción por taller (`pg_advisory_xact_lock`) → se vuelve a leer el estado → se vuelve a comprobar la franja
//     → se consume el token con un UPDATE condicionado → se inserta la cita. Dos clientes a la última plaza: uno recibe 409.
//   · Las casillas de consentimiento llegan SIN MARCAR; solo se escribe una fila por casilla marcada, canal `cita_enlace`, y solo
//     para quien ES el cliente de la invitación (nunca se atribuye un consentimiento al dueño de un vehículo ajeno).
import {
  caducidadInvitacion, comprobarReserva, ESTADOS_CITA_OCUPAN, esCorreo, estadoCitaAlPedir, estadoInvitacion, fechaLocal, huecosDisponibles,
  invitacionAbierta, minutosPendientesOt, normalizarMatricula, normalizarMovil, SERVICIO_DIAGNOSTICO, validarMatricula, ocupacionDia, sumarDias,
  instanteLocal, type ConfigTaller, type Existentes, type Hueco, type OcupacionDia,
} from '@central/module-taller'
import { registrarConsentimientos, type CasillasMarcadas, type TxConsent } from './consentimientos.ts'
import { casillasPendientes, hashToken, nuevoToken } from './presupuestos.ts'
import type { Notificador } from './notificador.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
  updateMany(a: any): Promise<{ count: number }>
}
export type TxCitas = TxConsent & {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  invitacionCita: Delegado
  cita: Delegado
  cliente: Delegado
  vehiculo: Delegado
  ordenTrabajo: Delegado
  otLinea: Delegado
  parteHoras: Delegado
}

const DIA_MS = 86_400_000
const ESTADOS_OT_ABIERTA = ['aceptado', 'en_curso', 'ampliacion_pendiente']

export type Respuesta<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; mensaje: string }

/** Candado de transacción por taller: serializa las reservas y los movimientos de la agenda de ESE taller. */
const bloquearAgenda = (tx: Pick<TxCitas, '$executeRaw'>, tallerId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cita:' + tallerId}))`

// ── Estado de la agenda ──────────────────────────────────────────────────────
/** Citas que ocupan (pedida/confirmada) desde `desde` y OT abiertas con su trabajo pendiente. */
export async function cargarExistentes(
  tx: Pick<TxCitas, 'cita' | 'ordenTrabajo' | 'otLinea' | 'parteHoras'>, o: { tallerId: string; desde: Date; ahora: Date; excepto?: string },
): Promise<Existentes> {
  const citas = (await tx.cita.findMany({
    where: { tallerId: o.tallerId, estado: { in: [...ESTADOS_CITA_OCUPAN] }, inicio: { gte: o.desde } },
  })).filter((c) => c.id !== o.excepto)
  const ots = await tx.ordenTrabajo.findMany({ where: { tallerId: o.tallerId, estado: { in: ESTADOS_OT_ABIERTA } } })
  const ids = ots.map((x) => x.id)
  const lineas = ids.length ? await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: { in: ids } } }) : []
  const partes = ids.length ? await tx.parteHoras.findMany({ where: { tallerId: o.tallerId, otId: { in: ids } } }) : []
  return {
    citas: citas.map((c) => ({ inicio: c.inicio as Date, duracionMinutos: c.duracionMinutos as number, estado: c.estado as string })),
    ots: ots.map((ot) => {
      const trabajados = partes
        .filter((p) => p.otId === ot.id)
        .reduce((s, p) => s + Math.max(0, Math.round((((p.fin as Date | null) ?? o.ahora).getTime() - (p.inicio as Date).getTime()) / 60_000)), 0)
      return { minutosPendientes: minutosPendientesOt(lineas.filter((l) => l.otId === ot.id).map((l) => l.baremoMinutos as number | null), trabajados) }
    }),
  }
}

// ── Invitaciones ─────────────────────────────────────────────────────────────
export type EntradaInvitar = {
  tallerId: string; usuarioId: string; nombre: string; correo: string; matricula: string
  ahora: Date; config: ConfigTaller
  /** Origen público (https://…) para armar el enlace del correo. Sin él no se compone texto con enlace. */
  origen: string | null
}

/**
 * Crea la invitación. Devuelve el token UNA vez (en BD solo queda su hash). Si hay correo, lo pasa por el puerto `Notificador`:
 * hoy solo REGISTRA (no hay transporte), así que la pantalla enseña el enlace para copiarlo. `enviado` nunca es true sin transporte.
 */
export async function crearInvitacion(
  tx: Pick<TxCitas, 'invitacionCita'>, e: EntradaInvitar, notificador: Notificador,
): Promise<Respuesta<{ invitacionId: string; token: string; caducaEn: Date; correoRegistrado: boolean }>> {
  const nombre = e.nombre.trim()
  if (!nombre || nombre.length > 200) return { ok: false, status: 400, mensaje: 'Falta el nombre del cliente' }
  const correo = e.correo.trim()
  if (correo && !esCorreo(correo)) return { ok: false, status: 400, mensaje: 'Correo inválido' }
  let matricula: string | null = null
  if (e.matricula.trim()) {
    const m = validarMatricula(e.matricula)
    if (!m.ok) return { ok: false, status: 400, mensaje: 'Matrícula inválida' }
    matricula = m.normalizada
  }
  const token = nuevoToken(e.tallerId)
  const caducaEn = caducidadInvitacion(e.config, e.ahora)
  const inv = await tx.invitacionCita.create({
    data: {
      tallerId: e.tallerId, nombre, correo: correo || null, matricula, tokenHash: hashToken(token), creadaPor: e.usuarioId,
      creadaEn: e.ahora, caducaEn, envio: 'registrado',
    },
  })
  let correoRegistrado = false
  if (correo && e.origen) {
    await notificador.enviar({
      tallerId: e.tallerId, tipo: 'invitacion_cita', a: correo, asunto: 'Pide tu cita en el taller',
      texto: `Hola ${nombre}, elige día y hora para tu cita en este enlace (vale ${e.config.agenda.invitacionCaducaDias} días y se puede usar una vez): ${e.origen}/c/${token}`,
      referencia: inv.id,
    })
    correoRegistrado = true
  }
  return { ok: true, invitacionId: inv.id as string, token, caducaEn, correoRegistrado }
}

/** ¿Hay una invitación VIGENTE con este token? (formato válido, hash conocido, sin usar, sin revocar, sin caducar). */
export async function invitacionVigente(tx: Pick<TxCitas, 'invitacionCita'>, tallerId: string, token: string, ahora: Date): Promise<boolean> {
  const inv = await tx.invitacionCita.findFirst({ where: { tallerId, tokenHash: hashToken(token) } })
  return !!inv && invitacionAbierta(inv, ahora)
}

export async function revocarInvitacion(tx: Pick<TxCitas, 'invitacionCita'>, o: { tallerId: string; invitacionId: string; ahora: Date }): Promise<boolean> {
  const r = await tx.invitacionCita.updateMany({ where: { id: o.invitacionId, tallerId: o.tallerId, usadaEn: null, revocadaEn: null }, data: { revocadaEn: o.ahora } })
  return r.count === 1
}

export async function listarInvitaciones(tx: Pick<TxCitas, 'invitacionCita'>, tallerId: string, ahora: Date, tomar = 30) {
  const xs = await tx.invitacionCita.findMany({ where: { tallerId }, orderBy: { creadaEn: 'desc' }, take: tomar })
  return xs.map((i) => ({ id: i.id as string, nombre: i.nombre as string, correo: (i.correo ?? null) as string | null, matricula: (i.matricula ?? null) as string | null, creadaEn: i.creadaEn as Date, caducaEn: i.caducaEn as Date, estado: estadoInvitacion(i, ahora) }))
}

// ── Vista pública ────────────────────────────────────────────────────────────
export type VistaInvitacion = { nombre: string; correo: string | null; matricula: string | null }

export async function vistaInvitacion(tx: Pick<TxCitas, 'invitacionCita'>, tallerId: string, token: string, ahora: Date): Promise<VistaInvitacion | null> {
  const inv = await tx.invitacionCita.findFirst({ where: { tallerId, tokenHash: hashToken(token) } })
  if (!inv || !invitacionAbierta(inv, ahora)) return null
  return { nombre: inv.nombre, correo: inv.correo ?? null, matricula: inv.matricula ?? null }
}

/** Servicios que el cliente puede elegir: paquetes activos con baremo + «diagnóstico / no sé». */
export function serviciosOfrecidos(c: ConfigTaller): Array<{ codigo: string; nombre: string }> {
  return [
    ...c.paquetes.filter((p) => p.activo && p.baremoMinutos > 0).map((p) => ({ codigo: p.codigo, nombre: p.nombre })),
    { codigo: SERVICIO_DIAGNOSTICO, nombre: 'No sé qué le pasa / diagnóstico' },
  ]
}

/** Huecos que ve el cliente (pasan por el motor de module-taller; nunca pasado, fuera de horario ni sin capacidad). */
export async function huecosPublicos(
  tx: TxCitas, o: { tallerId: string; token: string; servicio: string; desde: Date; hasta: Date; ahora: Date; config: ConfigTaller },
): Promise<Respuesta<{ huecos: Hueco[] }>> {
  if (!(await vistaInvitacion(tx, o.tallerId, o.token, o.ahora))) return { ok: false, status: 404, mensaje: 'No encontrado' }
  const ex = await cargarExistentes(tx, { tallerId: o.tallerId, desde: new Date(o.ahora.getTime() - DIA_MS), ahora: o.ahora })
  return { ok: true, huecos: huecosDisponibles(o.config, ex, o.servicio, o.desde, o.hasta, o.ahora) }
}

// ── Reserva atómica ──────────────────────────────────────────────────────────
export type EntradaReserva = {
  tallerId: string; token: string; ahora: Date; config: ConfigTaller
  servicio: string; inicio: Date
  matricula: string; nombre: string; movil: string; correo: string
  casillas: CasillasMarcadas
  ip: string | null; userAgent: string | null
  textoTaller: { version: string; texto: string }
}

export type ResultadoReserva = Respuesta<{ citaId: string; estado: string; inicio: Date }>

export async function reservarPorInvitacion(tx: TxCitas, e: EntradaReserva, notificador?: Notificador): Promise<ResultadoReserva> {
  // 0) Validaciones baratas, antes de tomar el candado.
  const m = validarMatricula(e.matricula)
  if (!m.ok) return { ok: false, status: 400, mensaje: 'Escribe la matrícula tal como figura en tu vehículo' }
  const nombre = e.nombre.trim()
  if (!nombre || nombre.length > 200) return { ok: false, status: 400, mensaje: 'Falta tu nombre' }
  const correo = e.correo.trim()
  if (correo && !esCorreo(correo)) return { ok: false, status: 400, mensaje: 'Correo inválido' }
  const movil = e.movil.trim() ? normalizarMovil(e.movil) : null
  if (e.movil.trim() && !movil) return { ok: false, status: 400, mensaje: 'Teléfono móvil inválido' }
  if (!movil && !correo) return { ok: false, status: 400, mensaje: 'Déjanos un móvil o un correo para confirmarte la cita' }

  // 1) Candado del taller y estado FRESCO: lo que se vio en pantalla no vale.
  await bloquearAgenda(tx, e.tallerId)
  const inv = await tx.invitacionCita.findFirst({ where: { tallerId: e.tallerId, tokenHash: hashToken(e.token) } })
  if (!inv || !invitacionAbierta(inv, e.ahora)) return { ok: false, status: 404, mensaje: 'No encontrado' }

  // 2) La franja sigue libre PARA ESTE servicio (recontando citas y OT ahora).
  const ex = await cargarExistentes(tx, { tallerId: e.tallerId, desde: new Date(e.ahora.getTime() - DIA_MS), ahora: e.ahora })
  const comp = comprobarReserva(e.config, ex, e.servicio, e.inicio, e.ahora)
  if (!comp.ok) {
    return comp.motivo === 'servicio_desconocido'
      ? { ok: false, status: 400, mensaje: 'Servicio no disponible' }
      : { ok: false, status: 409, mensaje: 'Esa franja acaba de ocuparse. Elige otra' }
  }

  // 3) Se consume el token con una sentencia condicionada: solo una petición lo gana.
  const gana = await tx.invitacionCita.updateMany({
    where: { id: inv.id, tallerId: e.tallerId, usadaEn: null, revocadaEn: null, caducaEn: { gt: e.ahora } },
    data: { usadaEn: e.ahora },
  })
  if (gana.count !== 1) return { ok: false, status: 404, mensaje: 'No encontrado' }

  // 4) Vehículo (clave: matrícula normalizada) y cliente.
  const norm = m.normalizada
  let veh = await tx.vehiculo.findFirst({ where: { tallerId: e.tallerId, matriculaNormalizada: norm } })
  const dueno = veh?.clienteId ? await tx.cliente.findFirst({ where: { tallerId: e.tallerId, id: veh.clienteId } }) : null
  // El vehículo es del invitado si la invitación ya traía esa matrícula o el correo coincide con el del titular.
  const mismoCliente = !!dueno && (inv.matricula === norm || (!!correo && !!dueno.correo && dueno.correo.trim().toLowerCase() === correo.toLowerCase()))
  let clienteId: string
  if (dueno && mismoCliente) {
    clienteId = dueno.id
  } else {
    clienteId = (await tx.cliente.create({ data: { tallerId: e.tallerId, nombre, movil, correo: correo || null } })).id
  }
  if (!veh) {
    veh = await tx.vehiculo.create({ data: { tallerId: e.tallerId, matricula: normalizarMatricula(e.matricula), clienteId } })
  } else if (!veh.clienteId) {
    await tx.vehiculo.update({ where: { id: veh.id }, data: { clienteId } })
  }

  // 5) La cita.
  const estado = estadoCitaAlPedir(e.config)
  const cita = await tx.cita.create({
    data: {
      tallerId: e.tallerId, clienteId, vehiculoId: veh.id, inicio: e.inicio, duracionMinutos: comp.duracionMinutos, puesto: 1,
      motivo: nombreServicio(e.config, e.servicio), estado, servicio: e.servicio, origen: 'enlace', invitacionId: inv.id,
    },
  })
  await tx.invitacionCita.update({ where: { id: inv.id }, data: { citaId: cita.id } })

  // 6) Consentimientos: solo lo MARCADO, solo lo que aún no tiene, y solo para quien es el cliente de la invitación.
  const esElInvitado = !dueno || mismoCliente || clienteId !== dueno.id
  if (esElInvitado && (e.casillas.asegura || e.casillas.taller)) {
    const pend = await casillasPendientes(tx, e.tallerId, clienteId, e.ahora)
    await registrarConsentimientos(tx, {
      tallerId: e.tallerId, clienteId, canal: 'cita_enlace', textoTaller: e.textoTaller,
      marcadas: { asegura: e.casillas.asegura && pend.asegura, taller: e.casillas.taller && pend.taller },
      ip: e.ip, userAgent: e.userAgent, ahora: e.ahora,
    })
  }

  if (notificador && correo) {
    await notificador.enviar({
      tallerId: e.tallerId, tipo: 'cita', a: correo, referencia: cita.id,
      asunto: estado === 'confirmada' ? 'Tu cita está confirmada' : 'Hemos recibido tu petición de cita',
      texto: estado === 'confirmada' ? 'Tu cita queda confirmada.' : 'El taller te confirmará la cita en cuanto la revise.',
    })
  }
  return { ok: true, citaId: cita.id as string, estado, inicio: e.inicio }
}

export function nombreServicio(c: ConfigTaller, servicio: string): string {
  return servicio === SERVICIO_DIAGNOSTICO ? 'Diagnóstico' : (c.paquetes.find((p) => p.codigo === servicio)?.nombre ?? servicio)
}

// ── Agenda del taller (/citas) ───────────────────────────────────────────────
export type CitaVista = {
  id: string; inicio: Date; duracionMinutos: number; estado: string; origen: string; servicio: string | null; motivo: string | null
  matricula: string; clienteNombre: string | null; clienteMovil: string | null; recepcionId: string | null
}

async function vistas(tx: Pick<TxCitas, 'cliente' | 'vehiculo'>, tallerId: string, citas: any[]): Promise<CitaVista[]> {
  const vehs = citas.length ? await tx.vehiculo.findMany({ where: { tallerId, id: { in: [...new Set(citas.map((c) => c.vehiculoId))] } } }) : []
  const cids = [...new Set(citas.map((c) => c.clienteId).filter(Boolean))]
  const clis = cids.length ? await tx.cliente.findMany({ where: { tallerId, id: { in: cids } } }) : []
  return citas.map((c) => ({
    id: c.id, inicio: c.inicio, duracionMinutos: c.duracionMinutos, estado: c.estado, origen: c.origen, servicio: c.servicio ?? null, motivo: c.motivo ?? null,
    matricula: vehs.find((v) => v.id === c.vehiculoId)?.matricula ?? '—',
    clienteNombre: clis.find((x) => x.id === c.clienteId)?.nombre ?? null, clienteMovil: clis.find((x) => x.id === c.clienteId)?.movil ?? null,
    recepcionId: c.recepcionId ?? null,
  }))
}

export type DiaAgenda = { ocupacion: OcupacionDia; citas: CitaVista[] }

/** `dias` días seguidos desde `desde` (fecha local), con ocupación y citas (no canceladas) de cada uno. */
export async function agendaDias(
  tx: TxCitas, o: { tallerId: string; config: ConfigTaller; desde: string; dias: number; ahora: Date },
): Promise<DiaAgenda[]> {
  const zona = o.config.agenda.zonaHoraria
  const ini = instanteLocal(o.desde, '00:00', zona)
  const fin = instanteLocal(sumarDias(o.desde, o.dias), '00:00', zona)
  const ex = await cargarExistentes(tx, { tallerId: o.tallerId, desde: new Date(o.ahora.getTime() - DIA_MS), ahora: o.ahora })
  const todas = await tx.cita.findMany({
    where: { tallerId: o.tallerId, estado: { in: ['pedida', 'confirmada', 'realizada', 'no_presentado'] }, inicio: { gte: ini, lt: fin } }, orderBy: { inicio: 'asc' },
  })
  const vs = await vistas(tx, o.tallerId, todas)
  return Array.from({ length: o.dias }, (_, i) => {
    const fecha = sumarDias(o.desde, i)
    return { ocupacion: ocupacionDia(o.config, ex, fecha, o.ahora), citas: vs.filter((c) => fechaLocal(c.inicio, zona) === fecha) }
  })
}

/** Citas pedidas (pendientes de aceptar) desde hoy, las más próximas primero. */
export async function citasPendientes(tx: TxCitas, tallerId: string, ahora: Date): Promise<CitaVista[]> {
  const xs = await tx.cita.findMany({ where: { tallerId, estado: 'pedida', inicio: { gte: new Date(ahora.getTime() - DIA_MS) } }, orderBy: { inicio: 'asc' } })
  return vistas(tx, tallerId, xs)
}

/** Aceptar una cita pedida. Una sentencia condicionada: dos personas pulsando a la vez no la aceptan dos veces. */
export async function aceptarCita(tx: TxCitas, o: { tallerId: string; citaId: string }): Promise<Respuesta> {
  await bloquearAgenda(tx, o.tallerId)
  const r = await tx.cita.updateMany({ where: { id: o.citaId, tallerId: o.tallerId, estado: 'pedida' }, data: { estado: 'confirmada' } })
  return r.count === 1 ? { ok: true } : { ok: false, status: 409, mensaje: 'La cita ya no está pendiente' }
}

/** Rechazar (pedida) o cancelar (confirmada) una cita: libera hueco y capacidad. */
export async function rechazarCita(tx: TxCitas, o: { tallerId: string; citaId: string; motivo: string }): Promise<Respuesta> {
  await bloquearAgenda(tx, o.tallerId)
  const motivo = o.motivo.trim().slice(0, 500)
  const r = await tx.cita.updateMany({
    where: { id: o.citaId, tallerId: o.tallerId, estado: { in: ['pedida', 'confirmada'] } },
    data: { estado: 'cancelada', motivoCancelacion: motivo || null },
  })
  return r.count === 1 ? { ok: true } : { ok: false, status: 409, mensaje: 'La cita ya no se puede cancelar' }
}

/** Mover una cita a otra franja libre (con las mismas reglas del motor, pero sin antelación mínima/máxima: lo hace el taller). */
export async function moverCita(
  tx: TxCitas, o: { tallerId: string; citaId: string; nuevoInicio: Date; ahora: Date; config: ConfigTaller },
): Promise<Respuesta<{ inicio: Date }>> {
  await bloquearAgenda(tx, o.tallerId)
  const cita = await tx.cita.findFirst({ where: { tallerId: o.tallerId, id: o.citaId } })
  if (!cita || !ESTADOS_CITA_OCUPAN.includes(cita.estado)) return { ok: false, status: 409, mensaje: 'La cita ya no se puede mover' }
  if (!cita.servicio) return { ok: false, status: 400, mensaje: 'Esta cita no tiene servicio: cancélala y crea otra' }
  const ex = await cargarExistentes(tx, { tallerId: o.tallerId, desde: new Date(o.ahora.getTime() - DIA_MS), ahora: o.ahora, excepto: cita.id })
  const comp = comprobarReserva(o.config, ex, cita.servicio, o.nuevoInicio, o.ahora, { comoTaller: true })
  if (!comp.ok) return { ok: false, status: 409, mensaje: 'Esa franja no está libre (horario, coches o capacidad del día)' }
  await tx.cita.update({ where: { id: cita.id }, data: { inicio: o.nuevoInicio, duracionMinutos: comp.duracionMinutos } })
  return { ok: true, inicio: o.nuevoInicio }
}

/** Datos para precargar la recepción de un coche que llega con cita. Solo citas vivas y sin recepción ya hecha. */
export async function citaParaRecepcion(tx: TxCitas, tallerId: string, citaId: string) {
  const cita = await tx.cita.findFirst({ where: { tallerId, id: citaId } })
  if (!cita || !ESTADOS_CITA_OCUPAN.includes(cita.estado) || cita.recepcionId) return null
  const [v] = await vistas(tx, tallerId, [cita])
  const cli = cita.clienteId ? await tx.cliente.findFirst({ where: { tallerId, id: cita.clienteId } }) : null
  return { cita: v, cliente: cli ? { id: cli.id as string, nombre: cli.nombre as string, movil: (cli.movil ?? '') as string, correo: (cli.correo ?? '') as string } : null }
}

/** Al llegar el coche: la cita pasa a `realizada` y queda enlazada a la recepción. Una sentencia condicionada. */
export async function vincularCitaARecepcion(tx: TxCitas, o: { tallerId: string; citaId: string; recepcionId: string; ahora: Date }): Promise<boolean> {
  const r = await tx.cita.updateMany({
    where: { id: o.citaId, tallerId: o.tallerId, estado: { in: ['pedida', 'confirmada'] }, recepcionId: null },
    data: { estado: 'realizada', recepcionId: o.recepcionId, llegadaEn: o.ahora },
  })
  return r.count === 1
}

/** El cliente no se presentó. */
export async function marcarNoPresentado(tx: TxCitas, o: { tallerId: string; citaId: string }): Promise<Respuesta> {
  const r = await tx.cita.updateMany({ where: { id: o.citaId, tallerId: o.tallerId, estado: { in: ['pedida', 'confirmada'] } }, data: { estado: 'no_presentado' } })
  return r.count === 1 ? { ok: true } : { ok: false, status: 409, mensaje: 'La cita ya no está viva' }
}
