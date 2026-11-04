/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Presupuestos del taller: crear desde una OT (calcularPresupuesto con la CONFIGURACIÓN del taller), enlace público con
// token y aceptación. El token NUNCA se guarda (solo su SHA-256); lleva el taller delante para poder abrir la transacción
// RLS de ese taller sin sesión: `<tallerId sin guiones>.<32 bytes aleatorios en base64url>`.
import { createHash, randomBytes } from 'node:crypto'
import {
  calcularPresupuesto, formatearEur, transicionarOt, type ConfigTaller, type EntradaPresupuesto, type EstadoOt, type LineaSolicitada,
} from '@central/module-taller'
import { registrarConsentimientos, estadoConsentimientos, type CasillasMarcadas, type TxConsent } from './consentimientos.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxPresupuestos = TxConsent & {
  ordenTrabajo: Delegado
  recepcion: Delegado
  presupuesto: Delegado
  presupuestoLinea: Delegado
  otLinea: Delegado
  parteHoras: Delegado
  vehiculo: Delegado
}

export class ErrorPresupuesto extends Error {}

// ── Token ────────────────────────────────────────────────────────────────────
const UUID_SIN_GUIONES = /^[0-9a-f]{32}$/i
const SECRETO_B64URL = /^[A-Za-z0-9_-]{43}$/

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function nuevoToken(tallerId: string): string {
  return `${tallerId.replace(/-/g, '')}.${randomBytes(32).toString('base64url')}`
}

/** taller del token, o null si el formato no es válido (el llamante responde 404 sin tocar la BD). */
export function tallerDeToken(token: unknown): string | null {
  if (typeof token !== 'string') return null
  const [t, s, resto] = token.split('.')
  if (resto !== undefined || !t || !s || !UUID_SIN_GUIONES.test(t) || !SECRETO_B64URL.test(s)) return null
  const h = t.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Crear ────────────────────────────────────────────────────────────────────
export type EntradaCrear = {
  tallerId: string
  otId: string
  tipoVehiculo: string | null
  lineas: LineaSolicitada[]
  ahora: Date
}

export type ResultadoCrear = { ok: true; presupuestoId: string } | { ok: false; errores: string[] }

export async function crearPresupuestoDesdeOt(tx: TxPresupuestos, e: EntradaCrear, config: ConfigTaller): Promise<ResultadoCrear> {
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: e.tallerId, id: e.otId } })
  if (!ot) return { ok: false, errores: ['orden no encontrada'] }
  if (ot.presupuestoId) return { ok: false, errores: ['esta orden ya tiene presupuesto'] }
  if (ot.estado !== 'recepcion') return { ok: false, errores: [`no se presupuesta una orden en estado «${ot.estado}»`] }
  const rec = await tx.recepcion.findFirst({ where: { tallerId: e.tallerId, id: ot.recepcionId } })
  if (!rec) return { ok: false, errores: ['la orden no tiene recepción'] }
  // La transición exige recepción firmada: se comprueba ANTES de escribir nada.
  const t = transicionarOt(ot.estado as EstadoOt, 'presupuesto', { recepcionFirmada: rec.firmadoEn != null })
  if (!t.ok) return { ok: false, errores: [t.motivo] }

  const entrada: EntradaPresupuesto = { tipoVehiculo: e.tipoVehiculo, lineas: e.lineas }
  const c = calcularPresupuesto(config, entrada)
  if (!c.ok) return { ok: false, errores: c.errores }
  const p = c.presupuesto

  const pres = await tx.presupuesto.create({
    data: {
      tallerId: e.tallerId, vehiculoId: ot.vehiculoId, clienteId: rec.clienteId, origen: 'taller', estado: 'borrador',
      tipoVehiculoCodigo: e.tipoVehiculo, precioHoraCent: BigInt(config.precioHoraCent),
      baseCent: BigInt(p.baseCent), cuotaIvaCent: BigInt(p.cuotaIvaCent), totalCent: BigInt(p.totalCent),
      caducaEn: new Date(e.ahora.getTime() + config.validezPresupuestoDias * 86_400_000),
    },
  })
  for (const [i, l] of p.lineas.entries()) {
    await tx.presupuestoLinea.create({
      data: {
        tallerId: e.tallerId, presupuestoId: pres.id, orden: i + 1, tipo: l.tipo, descripcion: l.descripcion,
        paqueteCodigo: l.paqueteCodigo, referencia: l.referencia ?? null, cantidad: l.cantidad, unidad: l.unidad,
        baremoMinutos: l.baremoMinutos, precioCerrado: l.precioCerrado, baseCent: BigInt(l.baseCent), ivaCodigo: l.ivaCodigo,
        ivaPuntosBasicos: l.ivaPuntosBasicos, cuotaIvaCent: BigInt(l.cuotaIvaCent), totalCent: BigInt(l.totalCent),
      },
    })
  }
  await tx.ordenTrabajo.update({ where: { id: ot.id }, data: { presupuestoId: pres.id, estado: t.estado } })
  return { ok: true, presupuestoId: pres.id }
}

/** Genera (o regenera) el enlace. Devuelve el token UNA vez: en BD solo queda su hash. */
export async function generarEnlace(
  tx: Pick<TxPresupuestos, 'presupuesto'>, o: { tallerId: string; presupuestoId: string; ahora: Date; config: ConfigTaller },
): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  const p = await tx.presupuesto.findFirst({ where: { tallerId: o.tallerId, id: o.presupuestoId } })
  if (!p) return { ok: false, motivo: 'presupuesto no encontrado' }
  if (p.estado !== 'borrador' && p.estado !== 'enviado') return { ok: false, motivo: `el presupuesto está «${p.estado}»` }
  const token = nuevoToken(o.tallerId)
  await tx.presupuesto.update({
    where: { id: p.id },
    data: {
      tokenHash: hashToken(token), estado: 'enviado',
      caducaEn: new Date(o.ahora.getTime() + o.config.validezPresupuestoDias * 86_400_000),
    },
  })
  return { ok: true, token }
}

// ── Vista pública por token ──────────────────────────────────────────────────
export type VistaPublica =
  | { ok: false; status: 404 }
  | { ok: true; estado: 'abierto' | 'aceptado' | 'rechazado' | 'caducado'; presupuesto: any; lineas: any[]; vehiculo: any }

/** Busca por token (hash). Formato inválido o desconocido → 404 sin pistas. */
export async function vistaPorToken(
  tx: Pick<TxPresupuestos, 'presupuesto' | 'presupuestoLinea' | 'vehiculo'>, tallerId: string, token: string, ahora: Date,
): Promise<VistaPublica> {
  const p = await tx.presupuesto.findFirst({ where: { tallerId, tokenHash: hashToken(token) } })
  if (!p) return { ok: false, status: 404 }
  const lineas = (await tx.presupuestoLinea.findMany({ where: { tallerId, presupuestoId: p.id }, orderBy: { orden: 'asc' } }))
  const vehiculo = await tx.vehiculo.findFirst({ where: { tallerId, id: p.vehiculoId } })
  const estado =
    p.estado === 'aceptado' ? 'aceptado'
    : p.estado === 'rechazado' ? 'rechazado'
    : p.estado !== 'enviado' || (p.caducaEn && p.caducaEn.getTime() < ahora.getTime()) ? 'caducado'
    : 'abierto'
  return { ok: true, estado, presupuesto: p, lineas, vehiculo }
}

/** Casillas que aún hay que ofrecer al cliente (las que NO tiene vigentes). */
export async function casillasPendientes(tx: TxConsent, tallerId: string, clienteId: string | null, hoy: Date) {
  if (!clienteId) return { asegura: false, taller: false }
  const e = await estadoConsentimientos(tx, tallerId, clienteId, hoy)
  return { asegura: !e.asegura.permitido, taller: !e.taller.permitido }
}

export type EntradaAceptar = {
  tallerId: string; token: string; ip: string | null; userAgent: string | null; ahora: Date
  casillas: CasillasMarcadas
}

export type ResultadoAceptar = { ok: true; otId: string | null } | { ok: false; status: 404 | 409; motivo: string }

/** El cliente acepta por el enlace. Registra fecha, IP y TEXTO; copia las líneas a la OT y la pasa a «aceptado». */
export async function aceptarPorToken(
  tx: TxPresupuestos, e: EntradaAceptar, deps: { textoTaller: { version: string; texto: string } },
): Promise<ResultadoAceptar> {
  const v = await vistaPorToken(tx, e.tallerId, e.token, e.ahora)
  if (!v.ok) return { ok: false, status: 404, motivo: 'no encontrado' }
  if (v.estado !== 'abierto') return { ok: false, status: 409, motivo: `el presupuesto está ${v.estado}` }
  const p = v.presupuesto
  const matricula = v.vehiculo?.matricula ?? ''
  const texto = `Acepto el presupuesto de ${formatearEur(Number(p.totalCent))} (IVA incluido) para el vehículo ${matricula}.`

  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: e.tallerId, presupuestoId: p.id } })
  let otId: string | null = null
  if (ot) {
    const rec = await tx.recepcion.findFirst({ where: { tallerId: e.tallerId, id: ot.recepcionId } })
    const t = transicionarOt(ot.estado as EstadoOt, 'aceptado', { presupuestoAceptado: true, recepcionFirmada: !!rec && rec.firmadoEn != null })
    if (!t.ok) return { ok: false, status: 409, motivo: t.motivo }
    await tx.presupuesto.update({
      where: { id: p.id },
      data: { estado: 'aceptado', aceptadoEn: e.ahora, aceptadoIp: e.ip, aceptadoTexto: texto },
    })
    await tx.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: t.estado } })
    otId = ot.id
    for (const l of v.lineas) {
      await tx.otLinea.create({
        data: {
          tallerId: e.tallerId, otId: ot.id, tipo: l.tipo, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad,
          baseCent: l.baseCent, ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: l.ivaPuntosBasicos, cuotaIvaCent: l.cuotaIvaCent,
          totalCent: l.totalCent, baremoMinutos: l.baremoMinutos ?? null, minutosReales: null,
          origen: l.paqueteCodigo ? 'paquete' : 'manual', aceptadaEn: e.ahora,
        },
      })
    }
  } else {
    await tx.presupuesto.update({
      where: { id: p.id },
      data: { estado: 'aceptado', aceptadoEn: e.ahora, aceptadoIp: e.ip, aceptadoTexto: texto },
    })
  }

  // Casillas: solo si el cliente las marca y aún no las tenía; el servicio ya está aceptado pase lo que pase.
  if (p.clienteId && (e.casillas.asegura || e.casillas.taller)) {
    const pend = await casillasPendientes(tx, e.tallerId, p.clienteId, e.ahora)
    await registrarConsentimientos(tx, {
      tallerId: e.tallerId, clienteId: p.clienteId, canal: 'presupuesto_casa', textoTaller: deps.textoTaller,
      marcadas: { asegura: e.casillas.asegura && pend.asegura, taller: e.casillas.taller && pend.taller },
      ip: e.ip, userAgent: e.userAgent, ahora: e.ahora,
    })
  }
  return { ok: true, otId }
}

export async function rechazarPorToken(
  tx: TxPresupuestos, e: { tallerId: string; token: string; ahora: Date },
): Promise<ResultadoAceptar> {
  const v = await vistaPorToken(tx, e.tallerId, e.token, e.ahora)
  if (!v.ok) return { ok: false, status: 404, motivo: 'no encontrado' }
  if (v.estado !== 'abierto') return { ok: false, status: 409, motivo: `el presupuesto está ${v.estado}` }
  await tx.presupuesto.update({ where: { id: v.presupuesto.id }, data: { estado: 'rechazado' } })
  return { ok: true, otId: null }
}
