// El QR del VEHÍCULO (27/10/2026, F1) — lo que hace su DUEÑO: crear/reimprimir la etiqueta, anularla y decidir
// qué ve quien la escanee. Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §3, §5.
//
// 🚨 Las escrituras reciben una `GestionVehiculo` YA resuelta por `puedeGestionarVehiculo()` (la frontera,
// `lib/vehiculo-acceso.ts`), no un id suelto: no se pueden llamar sin pasar por ella. Y aun así:
//   - toda consulta lleva `bienId: g.bienId` (el bien resuelto) DENTRO del `where`;
//   - el dueño que se escribe en `portal_vehiculo_publico` sale de `g.ambito`, nunca del cuerpo;
//   - anular es un UPDATE (`anuladoEn`): el rol no tiene DELETE sobre estas tablas;
//   - el token se genera aquí, se guarda HASHEADO y en claro solo sale UNA vez, hacia el QR.
//
// «Reimprimir» = token nuevo, y la etiqueta anterior queda anulada en la MISMA transacción: el papel pegado deja
// de valer (la pantalla lo dice antes de pulsar). Hay UNA viva por vehículo (índice único parcial en la BD).
import { randomBytes } from 'node:crypto'

import {
  BYTES_TOKEN_HOJA,
  ambitoDeDefecto,
  claveVehiculo,
  esUuid,
  interruptoresEfectivos,
  type AmbitoDueno,
  type GestionVehiculo,
  type InterruptoresPublicos,
} from '@central/module-seguros-portal'
import { Prisma } from '@prisma/client'

import { hashCanal } from './auth'
import { prisma } from './db'
import { fechaEs } from './fechas'
import { accesosFlota } from './flota'
import { getIdentidad } from './session'

const INTERRUPTORES = { datosCarretera: true, estadoAlDia: true, recordatoriosPendientes: true } as const

async function esLaSesion(identidadId: string): Promise<boolean> {
  const sesion = await getIdentidad()
  return sesion !== null && sesion.id === identidadId
}

/** Las columnas de dueño de una fila de interruptores, copiadas del ámbito resuelto. Persona XOR empresa. */
function columnasDueno(a: AmbitoDueno): { duenoIdentidadId: string | null; clienteId: string | null } {
  return a.identidadId !== undefined ? { duenoIdentidadId: a.identidadId, clienteId: null } : { duenoIdentidadId: null, clienteId: a.clienteId }
}

function ambitoDe(g: GestionVehiculo): AmbitoDueno {
  return g.papel === 'dueno_particular' ? { identidadId: g.ambito.identidadId } : { clienteId: g.ambito.clienteId }
}

export type ResultadoQr = { ok: true; id: string; token: string } | { ok: false; error: 'concurrente' }

/**
 * Crea la etiqueta del vehículo (o la REIMPRIME: anula la viva y crea otra). Devuelve el token EN CLARO, la única
 * vez que existe fuera del QR. Quien llama lo mete en el enlace y no lo guarda.
 */
export async function crearQrVehiculo(identidadId: string, g: GestionVehiculo): Promise<ResultadoQr> {
  if (!(await esLaSesion(identidadId))) return { ok: false, error: 'concurrente' }
  const token = randomBytes(BYTES_TOKEN_HOJA).toString('hex')
  const ahora = new Date()
  try {
    const q = await prisma.$transaction(async (tx) => {
      await tx.portalVehiculoQr.updateMany({
        where: { bienId: g.bienId, anuladoEn: null },
        data: { anuladoEn: ahora, anuladoPorIdentidadId: identidadId },
      })
      return tx.portalVehiculoQr.create({
        // El token, HASHEADO. En claro solo viaja dentro del QR.
        data: { bienId: g.bienId, tokenHash: hashCanal(token), creadoPorIdentidadId: identidadId },
        select: { id: true },
      })
    })
    return { ok: true, id: q.id, token }
  } catch (e) {
    // Dos pestañas reimprimiendo a la vez: el índice «una viva por vehículo» decide. No quedan dos vivas.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: 'concurrente' }
    throw e
  }
}

/** Anular la etiqueta. Idempotente y con el bien DENTRO del where. `false` = no existe, no es de este bien o ya estaba anulada. */
export async function anularQrVehiculo(identidadId: string, g: GestionVehiculo, qrId: unknown): Promise<boolean> {
  // Un id que no es uuid no llega a la BD (Prisma lanzaría con `@db.Uuid` → 500): es «no encontrado» (404).
  if (!(await esLaSesion(identidadId)) || !esUuid(qrId)) return false
  const r = await prisma.portalVehiculoQr.updateMany({
    where: { id: qrId.trim(), bienId: g.bienId, anuladoEn: null },
    data: { anuladoEn: new Date(), anuladoPorIdentidadId: identidadId },
  })
  return r.count > 0
}

/** Guarda una fila de interruptores (defecto del dueño o excepción del vehículo). Sin DELETE: crear o cambiar. */
async function guardarInterruptores(
  identidadId: string,
  ambito: AmbitoDueno,
  bienId: string | null,
  valores: InterruptoresPublicos,
): Promise<void> {
  const dueno = columnasDueno(ambito)
  const data = { ...valores, actualizadoPorIdentidadId: identidadId, actualizadoEn: new Date() }
  const actualizar = () => prisma.portalVehiculoPublico.updateMany({ where: { ...dueno, bienId }, data })
  if ((await actualizar()).count > 0) return
  try {
    await prisma.portalVehiculoPublico.create({ data: { ...dueno, bienId, ...data } })
  } catch (e) {
    // La otra pestaña la creó entre medias: el índice único parcial decide; se actualiza.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await actualizar()
      return
    }
    throw e
  }
}

/** La EXCEPCIÓN de este vehículo. El dueño de la fila sale del bien resuelto (`g`). */
export async function guardarPublicoVehiculo(identidadId: string, g: GestionVehiculo, valores: InterruptoresPublicos): Promise<boolean> {
  if (!(await esLaSesion(identidadId))) return false
  await guardarInterruptores(identidadId, ambitoDe(g), g.bienId, valores)
  return true
}

/** El DEFECTO del dueño (persona o sociedad), con el ámbito ya resuelto por `puedeGestionarDefecto`. */
export async function guardarPublicoDefecto(identidadId: string, ambito: AmbitoDueno, valores: InterruptoresPublicos): Promise<boolean> {
  if (!(await esLaSesion(identidadId))) return false
  await guardarInterruptores(identidadId, ambito, null, valores)
  return true
}

// ─── Lo que pinta la pantalla del dueño ──────────────────────────────────────

export type QrVivo = { id: string; creadoEn: Date; ultimoUsoEn: Date | null }
export type PublicoDeVehiculo = { valores: InterruptoresPublicos; excepcion: boolean; defecto: InterruptoresPublicos }
export type EstadoQrVehiculo = { bienId: string | null; matricula: string | null; qr: QrVivo | null; publico: PublicoDeVehiculo }

type FilaBien = {
  id: string
  matricula: string | null
  qrsVehiculo: { id: string; creadoEn: Date; ultimoUsoEn: Date | null }[]
  publicoVehiculo: InterruptoresPublicos[]
}

const SELECT_BIEN = {
  id: true,
  matricula: true,
  qrsVehiculo: { where: { anuladoEn: null }, select: { id: true, creadoEn: true, ultimoUsoEn: true }, take: 1 },
  publicoVehiculo: { select: INTERRUPTORES, take: 1 },
} as const

function estadoDe(b: FilaBien | null, defectoFila: unknown, matricula: string | null): EstadoQrVehiculo {
  const excepcion = b?.publicoVehiculo[0] ?? null
  return {
    bienId: b?.id ?? null,
    matricula: b?.matricula ?? matricula,
    qr: b?.qrsVehiculo[0] ?? null,
    publico: {
      valores: interruptoresEfectivos(excepcion, defectoFila),
      excepcion: excepcion !== null,
      defecto: interruptoresEfectivos(null, defectoFila),
    },
  }
}

/**
 * Estado del QR de cada vehículo de UNA sociedad, por matrícula normalizada. La empresa se busca dentro de
 * `accesosFlota` (papel para editar); si no está, `null` (la página no pinta nada de QR).
 */
export async function estadoQrEmpresa(
  identidadId: string,
  empresaPedida: unknown,
): Promise<{ porClave: Map<string, EstadoQrVehiculo>; defecto: InterruptoresPublicos } | null> {
  const ambito = ambitoDeDefecto({ ambito: 'empresa', empresaId: empresaPedida }, identidadId, await accesosFlota(identidadId))
  if (ambito === null || ambito.clienteId === undefined) return null
  const empresaId = ambito.clienteId
  const [bienes, defecto] = await Promise.all([
    prisma.portalBien.findMany({ where: { clienteId: empresaId, tipo: 'vehiculo' }, select: SELECT_BIEN }),
    prisma.portalVehiculoPublico.findFirst({ where: { clienteId: empresaId, bienId: null }, select: INTERRUPTORES }),
  ])
  const porClave = new Map<string, EstadoQrVehiculo>()
  for (const b of bienes) if (b.matricula) porClave.set(b.matricula, estadoDe(b, defecto, b.matricula))
  return { porClave, defecto: interruptoresEfectivos(null, defecto) }
}

/** Estado del QR de la ficha de vehículo de un PARTICULAR (`bienId` de `fichaDeVehiculoDePoliza`, o ninguno). */
export async function estadoQrParticular(
  identidadId: string,
  bienId: string | null,
  matriculaDePoliza: string | null,
): Promise<EstadoQrVehiculo | null> {
  if (!(await esLaSesion(identidadId))) return null
  const [b, defecto] = await Promise.all([
    bienId === null ? null : prisma.portalBien.findFirst({ where: { id: bienId, identidadId, tipo: 'vehiculo' }, select: SELECT_BIEN }),
    prisma.portalVehiculoPublico.findFirst({ where: { duenoIdentidadId: identidadId, bienId: null }, select: INTERRUPTORES }),
  ])
  return estadoDe(b, defecto, claveVehiculo(matriculaDePoliza))
}

/** Lo que viaja a la pantalla (componente de cliente): lo mismo, con las fechas ya en `dd/mm/aaaa`. */
export type EstadoQrVista = Omit<EstadoQrVehiculo, 'qr'> & {
  qr: { id: string; creadoEn: string | null; ultimoUsoEn: string | null } | null
}

export function estadoQrParaVista(e: EstadoQrVehiculo): EstadoQrVista {
  return { ...e, qr: e.qr === null ? null : { id: e.qr.id, creadoEn: fechaEs(e.qr.creadoEn), ultimoUsoEn: fechaEs(e.qr.ultimoUsoEn) } }
}
