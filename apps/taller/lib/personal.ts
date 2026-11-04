/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Personal (usuarios con PIN) y proveedores del taller. Dentro de `conTaller`. Reglas:
//   · El PIN nunca se guarda ni se elige a mano: alta y reset generan uno temporal que se enseña UNA vez (spec 3bis).
//   · El PIN YA NO es único en el taller: el login es taller → usuario → PIN y el PIN solo se verifica contra el hash de la persona
//     elegida. Por eso no hay «ya está en uso» (era un oráculo: decía qué PIN tenía un compañero) ni búsqueda de PIN libre.
//   · Cambiar/resetear el PIN o dar de baja sube `sesion_version`: la cookie anterior deja de valer.
//   · Nunca queda el taller sin un dueño activo (si no, nadie podría volver a entrar en Ajustes).
import { esPinTrivial, hashPin, validarFormatoPin, verificarPin } from '@central/core-identity/pin'
import {
  anotarFalloUsuario, leerBloqueoUsuario, limpiarBloqueoUsuario, politicaUsuario, usuarioBloqueado,
  type TxBloqueoUsuario, type TxConfigUsuario,
} from './bloqueo-usuario.ts'

export const ROLES = ['recepcion', 'mecanico', 'dueno', 'admin'] as const
export type Rol = (typeof ROLES)[number]

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a: any): Promise<any>
  update(a: any): Promise<any>
  create(a: any): Promise<any>
}
export type TxPersonal = { usuarioTaller: Delegado; proveedor: Delegado; bloqueoPin: { deleteMany(a: any): Promise<any> } }

export class ErrorPersonal extends Error {}

/** 4 dígitos aleatorios, no triviales. `aleatorio` inyectable para tests. */
export function pinAleatorio(aleatorio: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  for (;;) {
    const pin = String(aleatorio() % 10000).padStart(4, '0')
    if (!esPinTrivial(pin)) return pin
  }
}

export async function altaUsuario(
  tx: TxPersonal, tallerId: string, d: { nombre: string; rol: string }, aleatorio?: () => number,
): Promise<{ id: string; pin: string }> {
  const nombre = d.nombre.trim()
  if (!nombre) throw new ErrorPersonal('falta el nombre')
  if (!(ROLES as readonly string[]).includes(d.rol)) throw new ErrorPersonal('rol inválido')
  const pin = pinAleatorio(aleatorio)
  const hash = await hashPin(pin)
  const u = await tx.usuarioTaller.create({ data: { tallerId, nombre, rol: d.rol, pinHash: hash, debeCambiarPin: true } })
  return { id: u.id, pin }
}

async function usuario(tx: { usuarioTaller: Delegado }, tallerId: string, id: string) {
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId, id } })
  if (!u) throw new ErrorPersonal('usuario no encontrado')
  return u
}

export async function bajaUsuario(tx: TxPersonal, tallerId: string, id: string): Promise<void> {
  const u = await usuario(tx, tallerId, id)
  if (u.rol === 'dueno' && u.activo) {
    const duenos = await tx.usuarioTaller.findMany({ where: { tallerId, rol: 'dueno', activo: true } })
    if (duenos.length <= 1) throw new ErrorPersonal('no se puede dar de baja al único dueño')
  }
  await tx.usuarioTaller.update({ where: { id }, data: { activo: false, sesionVersion: (u.sesionVersion ?? 0) + 1 } })
}

export async function resetPinUsuario(
  tx: TxPersonal, tallerId: string, id: string, aleatorio?: () => number,
): Promise<{ pin: string }> {
  const u = await usuario(tx, tallerId, id)
  if (!u.activo) throw new ErrorPersonal('el usuario está de baja')
  const pin = pinAleatorio(aleatorio)
  await tx.usuarioTaller.update({
    where: { id }, data: { pinHash: await hashPin(pin), debeCambiarPin: true, sesionVersion: (u.sesionVersion ?? 0) + 1 },
  })
  // Un PIN nuevo también levanta el bloqueo de esa persona (si no, el dueño le daría un PIN que no puede usar).
  await limpiarBloqueoUsuario(tx, tallerId, id)
  return { pin }
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarProveedor(d: { nombre: string; correo: string }): { nombre: string; correo: string | null } {
  const nombre = d.nombre.trim()
  const correo = d.correo.trim()
  if (!nombre) throw new ErrorPersonal('falta el nombre del proveedor')
  if (correo && !CORREO.test(correo)) throw new ErrorPersonal('correo de pedidos inválido')
  // Sin correo = no se sabe todavía (no se le podrá enviar un pedido hasta tenerlo).
  return { nombre, correo: correo || null }
}

export async function guardarProveedor(
  tx: TxPersonal, tallerId: string, d: { id?: string; nombre: string; correo: string; activo?: boolean },
): Promise<string> {
  const v = validarProveedor(d)
  if (d.id) {
    const p = await tx.proveedor.findFirst({ where: { tallerId, id: d.id } })
    if (!p) throw new ErrorPersonal('proveedor no encontrado')
    await tx.proveedor.update({
      where: { id: d.id },
      data: { nombre: v.nombre, correoPedidos: v.correo, ...(d.activo === undefined ? {} : { activo: d.activo }) },
    })
    return d.id
  }
  const p = await tx.proveedor.create({ data: { tallerId, nombre: v.nombre, correoPedidos: v.correo } })
  return p.id
}

export type TxCambioPin = { usuarioTaller: Delegado } & TxBloqueoUsuario & TxConfigUsuario

export type ResultadoCambioPin = { ok: true; sesionVersion: number } | { ok: false; error: string }

/**
 * El PIN nuevo que elige la persona: 4 dígitos, no trivial, distinto del actual. Si NO es el primer acceso (`debeCambiarPin` falso) exige
 * el PIN ACTUAL, y cada fallo cuenta en el bloqueo de ESA persona (misma política que el login: 5 fallos → 5 h). Sube `sesion_version`.
 * Los errores de validación lanzan `ErrorPersonal` ANTES de escribir; el PIN actual erróneo se DEVUELVE (`ok:false`) para que la
 * transacción confirme el contador de fallos (un `throw` lo desharía y daría intentos gratis).
 */
export async function cambiarMiPin(
  tx: TxCambioPin, o: { tallerId: string; usuarioId: string; pinNuevo: string; pinActual?: unknown; ahora?: Date },
): Promise<ResultadoCambioPin> {
  const f = validarFormatoPin(o.pinNuevo, { rechazarTriviales: true })
  if (!f.ok) throw new ErrorPersonal(f.error === 'trivial' ? 'Ese PIN es demasiado fácil (1234, 0000…): elige otro' : 'El PIN son 4 dígitos')
  const yo = await usuario(tx, o.tallerId, o.usuarioId)
  if (!yo.activo) throw new ErrorPersonal('el usuario está de baja')
  const ahora = o.ahora ?? new Date()

  if (!yo.debeCambiarPin) {
    const fa = validarFormatoPin(o.pinActual)
    if (!fa.ok) throw new ErrorPersonal('Escribe tu PIN actual (4 dígitos)')
    const previo = await leerBloqueoUsuario(tx, o.tallerId, o.usuarioId)
    const b = usuarioBloqueado(previo, ahora)
    if (b.bloqueado) return { ok: false, error: `Demasiados intentos. Prueba en ${b.minutos} min` }
    if (!(await verificarPin(o.pinActual as string, yo.pinHash))) {
      const n = await anotarFalloUsuario(tx, o.tallerId, o.usuarioId, previo, ahora, await politicaUsuario(tx, o.tallerId))
      const bn = usuarioBloqueado(n, ahora)
      return { ok: false, error: bn.bloqueado ? `Demasiados intentos. Prueba en ${bn.minutos} min` : 'El PIN actual no es correcto' }
    }
    if (previo.intentos > 0 || previo.bloqueadoHasta) await limpiarBloqueoUsuario(tx, o.tallerId, o.usuarioId)
  }
  if (await verificarPin(o.pinNuevo, yo.pinHash)) {
    throw new ErrorPersonal(yo.debeCambiarPin ? 'Elige un PIN distinto del temporal' : 'Elige un PIN distinto del actual')
  }
  const sesionVersion = (yo.sesionVersion ?? 0) + 1
  await tx.usuarioTaller.update({ where: { id: yo.id }, data: { pinHash: await hashPin(o.pinNuevo), debeCambiarPin: false, sesionVersion } })
  return { ok: true, sesionVersion }
}
