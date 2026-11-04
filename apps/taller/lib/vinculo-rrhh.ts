/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Vínculo con rrhh. El DUEÑO solo edita aquí a qué EMPLEADO (NIF o id) corresponde cada persona. La EMPRESA de rrhh del taller
// (`talleres.rrhh_empresa_id`) la fija SOLO el operador (POST/PATCH /api/operador/talleres → `taller.fijar_rrhh_empresa`, 0006): si
// la editara el dueño podría fichar contra OTRA empresa de rrhh. El taller NO lee rrhh. Dentro de `conTaller`.
import { ErrorPersonal } from './personal.ts'

type Delegado = { findFirst(a: any): Promise<any>; update(a: any): Promise<any> }
export type TxVinculo = { usuarioTaller: Delegado }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDENT = /^[A-Za-z0-9\-]{3,64}$/

/** Vacío = sin vincular (NULL), nunca cadena vacía. NIF/id: letras, números y guiones. */
export function validarIdentificadorRrhh(v: string): string | null {
  const t = v.trim().replace(/[\s.]/g, '')
  if (!t) return null
  if (!IDENT.test(t)) throw new ErrorPersonal('Identificador de RR.HH. no válido (NIF o id de empleado: letras, números y guiones)')
  return UUID.test(t) ? t.toLowerCase() : t.toUpperCase()
}

/** Solo para el puerto de operador. */
export function validarEmpresaRrhh(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  if (!UUID.test(t)) throw new ErrorPersonal('El id de empresa en RR.HH. no es válido (es un código largo con guiones)')
  return t.toLowerCase()
}

export async function guardarIdentificadorRrhh(tx: TxVinculo, tallerId: string, usuarioId: string, valor: string): Promise<string | null> {
  const identificador = validarIdentificadorRrhh(valor)
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId, id: usuarioId } })
  if (!u) throw new ErrorPersonal('usuario no encontrado')
  await tx.usuarioTaller.update({ where: { id: usuarioId }, data: { rrhhIdentificador: identificador } })
  return identificador
}
