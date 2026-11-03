// El QR del VEHÍCULO (27/10/2026, F1) — LA ÚNICA LECTURA SIN IDENTIDAD.
//
// 🚨 Este fichero está en EXENTOS de `test/regression-portal-aislamiento.test.ts`, y es una decisión, no un
// trámite (spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §7-6): la página `/v/<token>` es
// pública, se abre desde una pegatina en una guantera y no hay cookie de la que sacar una identidad. El filtro es
// el TOKEN (256 bits, no se adivina), y por eso:
//
//  1. Se NORMALIZA antes de tocar la BD (`normalizarTokenHoja`: 64 hex exactos). Una URL manipulada no gasta ni
//     una consulta.
//  2. Se busca por su HASH (`hashCanal`), nunca en claro: una tabla de etiquetas con sus enlaces legibles es una
//     tabla de llaves.
//  3. Anulado, inexistente, bien que no es un vehículo → `null`, y la página da el MISMO 404. La consulta es la
//     misma en los tres casos (una, por el hash): ni el cuerpo ni el tiempo distinguen «no existe» de «anulado».
//  4. Aquí NO se lee la cartera ni nada de la persona: solo la etiqueta, el bien y sus interruptores. Lo que se
//     enseña lo arma `lib/vehiculo-publico.ts` con la allow-list pura (`vistaPublicaVehiculo`).
//
// Nada más puede vivir en este fichero: una consulta nueva aquí estaría fuera del cepo de aislamiento.

import { normalizarTokenHoja } from '@central/module-seguros-portal'

import { hashCanal } from './auth'
import { prisma } from './db'

export type VehiculoAbierto = {
  qrId: string
  bien: {
    id: string
    /** Dueño persona. Exactamente uno de los dos (CHECK `portal_bien_un_dueno`). */
    identidadId: string | null
    /** Dueño empresa. */
    clienteId: string | null
    matricula: string | null
    fechaMatriculacion: Date | null
  }
  /** Fila de excepción del vehículo, tal cual (la valida `interruptoresEfectivos`). `null` = no hay. */
  publicoVehiculo: unknown
  /** Fila de defecto de su dueño, tal cual. `null` = no hay. */
  publicoDueno: unknown
}

const INTERRUPTORES = { datosCarretera: true, estadoAlDia: true, recordatoriosPendientes: true } as const

/**
 * 🚨 Sin identidad, a propósito (ver la cabecera). Devuelve `null` para «no existe», «anulado» y «no es un
 * vehículo» sin distinguirlos.
 */
export async function vehiculoPorToken(tokenCrudo: unknown): Promise<VehiculoAbierto | null> {
  const token = normalizarTokenHoja(tokenCrudo)
  if (token === null) return null
  const q = await prisma.portalVehiculoQr.findFirst({
    where: { tokenHash: hashCanal(token) },
    select: {
      id: true,
      anuladoEn: true,
      bien: {
        select: {
          id: true,
          identidadId: true,
          clienteId: true,
          tipo: true,
          matricula: true,
          fechaMatriculacion: true,
          publicoVehiculo: { select: INTERRUPTORES, take: 1 },
        },
      },
    },
  })
  if (!q || q.anuladoEn !== null || q.bien.tipo !== 'vehiculo') return null
  const b = q.bien
  // El defecto de SU dueño: el del bien, nunca otro. Persona XOR empresa.
  const publicoDueno =
    b.identidadId !== null
      ? await prisma.portalVehiculoPublico.findFirst({ where: { duenoIdentidadId: b.identidadId, bienId: null }, select: INTERRUPTORES })
      : b.clienteId !== null
        ? await prisma.portalVehiculoPublico.findFirst({ where: { clienteId: b.clienteId, bienId: null }, select: INTERRUPTORES })
        : null
  return {
    qrId: q.id,
    bien: { id: b.id, identidadId: b.identidadId, clienteId: b.clienteId, matricula: b.matricula, fechaMatriculacion: b.fechaMatriculacion },
    publicoVehiculo: b.publicoVehiculo[0] ?? null,
    publicoDueno,
  }
}

/**
 * Sella que alguien la ha escaneado. No se deja fallar hacia arriba (mismo criterio que la hoja: que no se pueda
 * anotar la visita no deja a nadie sin los teléfonos en el arcén). Solo sella las vivas.
 */
export async function sellarUsoVehiculo(qrId: string): Promise<void> {
  try {
    await prisma.portalVehiculoQr.updateMany({ where: { id: qrId, anuladoEn: null }, data: { ultimoUsoEn: new Date() } })
  } catch {
    // Silencio deliberado (ver arriba).
  }
}
