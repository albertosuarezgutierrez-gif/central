// El QR del VEHÍCULO (27/10/2026, F1) — LA frontera de quién gestiona un vehículo, con BD.
//
// Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §3.5. La regla vive pura en
// `vehiculo-acceso.ts` de `@central/module-seguros-portal` (con su test); aquí se leen las filas, y la frontera es:
//
// 🚨 `puedeGestionarVehiculo(identidadId, bienId)`:
//   1. La sesión TIENE que ser la de `identidadId` (como `accesosFlota`): un id suelto no gestiona nada.
//   2. El bien se busca DENTRO de lo que esa identidad puede ver: el `where` lleva el id de la URL Y el dueño
//      (`identidadId` propio, o `clienteId` ∈ las empresas de su flota con papel para editar). El id de la URL
//      nunca consulta solo.
//   3. Lo que no resuelve es `null` → la ruta contesta 404 (nunca 403: no se confirma que exista).
//
// Toda ruta de `/api/vehiculos/*` pasa por aquí (cepo `test/regression-portal-vehiculo-qr.test.ts`), y lo que las
// rutas copian a filas nuevas es el `ambito` que devuelve, nunca un dueño del cuerpo.
//
// `asegurarVehiculoDePoliza` crea la FICHA del vehículo de un PARTICULAR bajo demanda (hoy el particular no tiene
// `portal_bien` de su coche: ve pólizas). Solo desde una póliza PROPIA de auto/moto de la cartera viva; nunca desde
// una ajena, una añadida a mano (no verificada: misma regla que la hoja desde el 26/10/2026) ni un id del cuerpo.
import {
  ambitoDeDefecto,
  claveVehiculo,
  empresasGestionables,
  esRamoFlota,
  esUuid,
  fechaMatriculacionValida,
  resolverGestionVehiculo,
  type AmbitoDueno,
  type GestionVehiculo,
} from '@central/module-seguros-portal'
import { Prisma } from '@prisma/client'

import { carteraDeIdentidad, type PolizaPortal } from './cartera-lectura'
import { prisma } from './db'
import { accesosFlota } from './flota'
import { getIdentidad } from './session'

async function esLaSesion(identidadId: string): Promise<boolean> {
  const sesion = await getIdentidad()
  return sesion !== null && sesion.id === identidadId
}

/** Quién gestiona este vehículo desde esta sesión. `null` = 404. Ver la cabecera. */
export async function puedeGestionarVehiculo(identidadId: string, bienId: unknown): Promise<GestionVehiculo | null> {
  if (!(await esLaSesion(identidadId))) return null
  if (!esUuid(bienId)) return null
  const accesos = await accesosFlota(identidadId)
  const empresas = empresasGestionables(accesos)
  const bien = await prisma.portalBien.findFirst({
    where: {
      id: bienId.trim(),
      tipo: 'vehiculo',
      // 🚨 El dueño va DENTRO del where: el bien de otro no se lee, no se «comprueba después».
      OR: [{ identidadId }, ...(empresas.length > 0 ? [{ clienteId: { in: empresas } }] : [])],
    },
    select: { id: true, identidadId: true, clienteId: true, tipo: true },
  })
  return resolverGestionVehiculo({ identidadId, bien: bien ? { ...bien, tipo: String(bien.tipo) } : null, accesosFlota: accesos })
}

/**
 * La misma frontera para VARIOS bienes a la vez (impresión en lote): una sola lectura de accesos y de bienes. Lo
 * que no resuelve no está en el mapa (y no se imprime).
 */
export async function puedeGestionarVehiculos(identidadId: string, bienIds: readonly unknown[]): Promise<Map<string, GestionVehiculo>> {
  const out = new Map<string, GestionVehiculo>()
  if (!(await esLaSesion(identidadId))) return out
  const ids = [...new Set(bienIds.filter(esUuid).map((x) => x.trim()))]
  if (ids.length === 0) return out
  const accesos = await accesosFlota(identidadId)
  const empresas = empresasGestionables(accesos)
  const bienes = await prisma.portalBien.findMany({
    where: {
      id: { in: ids },
      tipo: 'vehiculo',
      OR: [{ identidadId }, ...(empresas.length > 0 ? [{ clienteId: { in: empresas } }] : [])],
    },
    select: { id: true, identidadId: true, clienteId: true, tipo: true },
  })
  for (const b of bienes) {
    const g = resolverGestionVehiculo({ identidadId, bien: { ...b, tipo: String(b.tipo) }, accesosFlota: accesos })
    if (g !== null) out.set(b.id, g)
  }
  return out
}

/**
 * El ámbito del DEFECTO de interruptores (`PUT /api/vehiculos/publico-defecto`): la propia persona, o una sociedad
 * buscada dentro de `accesosFlota` con papel para editar. `null` = 404.
 */
export async function puedeGestionarDefecto(identidadId: string, pedido: unknown): Promise<AmbitoDueno | null> {
  if (!(await esLaSesion(identidadId))) return null
  const quiereEmpresa = typeof pedido === 'object' && pedido !== null && (pedido as Record<string, unknown>).ambito === 'empresa'
  return ambitoDeDefecto(pedido, identidadId, quiereEmpresa ? await accesosFlota(identidadId) : new Map())
}

export type ErrorFicha = 'no_encontrada' | 'no_es_vehiculo' | 'es_de_empresa' | 'sin_matricula' | 'datos_invalidos'
export type ResultadoFicha = { ok: true; bienId: string } | { ok: false; error: ErrorFicha; mensaje: string }

/** La póliza PROPIA (no de una sociedad) con ese id, buscada dentro de la cartera ya leída. */
function polizaPropiaDePersona(
  cartera: Awaited<ReturnType<typeof carteraDeIdentidad>>,
  polizaId: string,
): { poliza: PolizaPortal; deEmpresa: boolean } | null {
  for (const t of cartera.propias) {
    const p = t.polizas.find((x) => x.id === polizaId)
    if (p) return { poliza: p, deEmpresa: t.tipoPersona === 'juridica' }
  }
  return null
}

/** Clave de la ficha creada desde una póliza SIN matrícula informada (para volver a encontrarla). */
const ORIGEN_POLIZA = 'origenPolizaId'

/**
 * Crea (o devuelve, idempotente por `(identidad_id, matricula)`) la ficha del vehículo de un PARTICULAR desde una
 * póliza PROPIA de auto/moto. La matrícula sale de la póliza; solo si la compañía no la informa vale la que teclea
 * la persona (normalizada; no se inventa: sin ninguna → `sin_matricula`). La fecha de matriculación que se guarda
 * es la DECLARADA (la de la compañía se lee en vivo de la póliza y gana, como en la flota).
 */
export async function asegurarVehiculoDePoliza(
  identidadId: string,
  datos: { polizaId: unknown; matricula?: unknown; fechaMatriculacion?: unknown },
): Promise<ResultadoFicha> {
  if (!(await esLaSesion(identidadId))) return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa póliza.' }
  if (typeof datos.polizaId !== 'string') return { ok: false, error: 'datos_invalidos', mensaje: 'Falta la póliza.' }
  const hoy = new Date()
  const fechaPedida = datos.fechaMatriculacion ?? null
  const fecha = fechaPedida === null || fechaPedida === '' ? null : fechaMatriculacionValida(fechaPedida, hoy)
  if (fechaPedida !== null && fechaPedida !== '' && fecha === null) {
    return { ok: false, error: 'datos_invalidos', mensaje: 'Esa fecha de matriculación no es válida (ni futura ni anterior a 1950).' }
  }

  // 🚨 Se parte de lo que esta identidad VE hoy, y el id del cuerpo solo filtra. Solo las PROPIAS.
  const encontrada = polizaPropiaDePersona(await carteraDeIdentidad(identidadId), datos.polizaId)
  if (encontrada === null) return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa póliza entre las tuyas.' }
  const { poliza: p, deEmpresa } = encontrada
  if (deEmpresa) {
    return { ok: false, error: 'es_de_empresa', mensaje: 'Este vehículo es de una sociedad: su QR se crea desde «Flota».' }
  }
  if (!esRamoFlota(p.ramo)) return { ok: false, error: 'no_es_vehiculo', mensaje: 'Esta póliza no es de un coche ni de una moto.' }

  const deLaPoliza = claveVehiculo(p.bien.matricula)
  const clave = deLaPoliza ?? claveVehiculo(typeof datos.matricula === 'string' ? datos.matricula : null)
  if (clave === null) {
    return { ok: false, error: 'sin_matricula', mensaje: 'No conocemos la matrícula de este vehículo: escríbela tal y como aparece en el permiso de circulación.' }
  }

  const leer = () =>
    prisma.portalBien.findFirst({
      where: { identidadId, tipo: 'vehiculo', matricula: clave },
      select: { id: true, fechaMatriculacion: true },
    })
  const existente = await leer()
  if (existente) {
    // Solo se RELLENA un hueco: una fecha ya anotada no se pisa desde aquí.
    if (existente.fechaMatriculacion === null && fecha !== null) {
      await prisma.portalBien.updateMany({
        where: { id: existente.id, identidadId },
        data: { fechaMatriculacion: new Date(`${fecha}T00:00:00Z`), actualizadoPorIdentidadId: identidadId, actualizadoEn: hoy },
      })
    }
    return { ok: true, bienId: existente.id }
  }
  try {
    const b = await prisma.portalBien.create({
      data: {
        identidadId,
        tipo: 'vehiculo',
        nombre: p.bien.cosa?.trim() || clave,
        matricula: clave,
        // Sin matrícula en la póliza, la ficha recuerda de qué póliza salió para volver a encontrarla.
        datos: deLaPoliza === null ? { [ORIGEN_POLIZA]: p.id } : {},
        fechaMatriculacion: fecha === null ? null : new Date(`${fecha}T00:00:00Z`),
        creadoPorIdentidadId: identidadId,
        actualizadoPorIdentidadId: identidadId,
        actualizadoEn: hoy,
      },
      select: { id: true },
    })
    return { ok: true, bienId: b.id }
  } catch (e) {
    // Dos pestañas a la vez: el índice único `(identidad_id, matricula)` decide; se relee.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const otra = await leer()
      if (otra) return { ok: true, bienId: otra.id }
    }
    throw e
  }
}

/**
 * La ficha del vehículo de una póliza PROPIA, si ya existe: por la matrícula de la póliza o, si la compañía no la
 * informa, por la póliza de la que se creó. Recibe la póliza YA encontrada en la cartera de la sesión por quien
 * pinta (`/boveda/poliza/[id]`). `null` = aún no hay ficha (la pantalla ofrece crearla).
 */
export async function fichaDeVehiculoDePoliza(
  identidadId: string,
  p: Pick<PolizaPortal, 'id' | 'bien'>,
): Promise<{ id: string; matricula: string | null } | null> {
  if (!(await esLaSesion(identidadId))) return null
  const clave = claveVehiculo(p.bien.matricula)
  return prisma.portalBien.findFirst({
    where: {
      identidadId,
      tipo: 'vehiculo',
      ...(clave !== null ? { matricula: clave } : { datos: { path: [ORIGEN_POLIZA], equals: p.id } }),
    },
    select: { id: true, matricula: true },
  })
}
