/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Personal (usuarios con PIN) y proveedores del taller. Dentro de `conTaller`. Reglas:
//   · El PIN nunca se guarda ni se elige a mano: alta y reset generan uno temporal que se enseña UNA vez (spec 3bis).
//   · PIN único dentro del taller (el login «solo PIN» identifica a la persona por él): se comprueba contra los hashes.
//   · Nunca queda el taller sin un dueño activo (si no, nadie podría volver a entrar en Ajustes).
import { esPinTrivial, hashPin, validarFormatoPin, verificarPin } from '@central/core-identity/pin'

export const ROLES = ['recepcion', 'mecanico', 'dueno', 'admin'] as const
export type Rol = (typeof ROLES)[number]

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a: any): Promise<any>
  update(a: any): Promise<any>
  create(a: any): Promise<any>
}
export type TxPersonal = { usuarioTaller: Delegado; proveedor: Delegado }

export class ErrorPersonal extends Error {}

/** 4 dígitos aleatorios, no triviales. `aleatorio` inyectable para tests. */
export function pinAleatorio(aleatorio: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  for (;;) {
    const pin = String(aleatorio() % 10000).padStart(4, '0')
    if (!esPinTrivial(pin)) return pin
  }
}

async function pinLibre(tx: TxPersonal, tallerId: string, aleatorio?: () => number): Promise<{ pin: string; hash: string }> {
  const hashes = (await tx.usuarioTaller.findMany({ where: { tallerId, activo: true }, select: { pinHash: true } }))
    .map((u) => u.pinHash as string)
  for (let i = 0; i < 20; i++) {
    const pin = pinAleatorio(aleatorio)
    let usado = false
    for (const h of hashes) if (await verificarPin(pin, h)) usado = true
    if (!usado) return { pin, hash: await hashPin(pin) }
  }
  throw new ErrorPersonal('no se encontró un PIN libre; inténtalo de nuevo')
}

export async function altaUsuario(
  tx: TxPersonal, tallerId: string, d: { nombre: string; rol: string }, aleatorio?: () => number,
): Promise<{ id: string; pin: string }> {
  const nombre = d.nombre.trim()
  if (!nombre) throw new ErrorPersonal('falta el nombre')
  if (!(ROLES as readonly string[]).includes(d.rol)) throw new ErrorPersonal('rol inválido')
  const { pin, hash } = await pinLibre(tx, tallerId, aleatorio)
  const u = await tx.usuarioTaller.create({ data: { tallerId, nombre, rol: d.rol, pinHash: hash, debeCambiarPin: true } })
  return { id: u.id, pin }
}

async function usuario(tx: TxPersonal, tallerId: string, id: string) {
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
  await tx.usuarioTaller.update({ where: { id }, data: { activo: false } })
}

export async function resetPinUsuario(
  tx: TxPersonal, tallerId: string, id: string, aleatorio?: () => number,
): Promise<{ pin: string }> {
  const u = await usuario(tx, tallerId, id)
  if (!u.activo) throw new ErrorPersonal('el usuario está de baja')
  const { pin, hash } = await pinLibre(tx, tallerId, aleatorio)
  await tx.usuarioTaller.update({ where: { id }, data: { pinHash: hash, debeCambiarPin: true } })
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

/** El PIN nuevo que elige la persona en su primer acceso: 4 dígitos, no trivial, distinto del actual y libre en el taller. */
export async function cambiarMiPin(
  tx: TxPersonal, o: { tallerId: string; usuarioId: string; pinNuevo: string },
): Promise<void> {
  const f = validarFormatoPin(o.pinNuevo, { rechazarTriviales: true })
  if (!f.ok) throw new ErrorPersonal(f.error === 'trivial' ? 'Ese PIN es demasiado fácil (1234, 0000…): elige otro' : 'El PIN son 4 dígitos')
  const yo = await usuario(tx, o.tallerId, o.usuarioId)
  if (!yo.activo) throw new ErrorPersonal('el usuario está de baja')
  const otros = await tx.usuarioTaller.findMany({ where: { tallerId: o.tallerId, activo: true } })
  for (const u of otros) {
    if (!(await verificarPin(o.pinNuevo, u.pinHash))) continue
    throw new ErrorPersonal(u.id === yo.id ? 'Elige un PIN distinto del temporal' : 'Ese PIN ya está en uso: elige otro')
  }
  await tx.usuarioTaller.update({ where: { id: yo.id }, data: { pinHash: await hashPin(o.pinNuevo), debeCambiarPin: false } })
}
