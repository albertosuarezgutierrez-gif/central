/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Vínculo con rrhh que edita el DUEÑO en Ajustes > Personal. El taller NO lee rrhh: solo guarda a qué empleado
// (NIF o id) y a qué empresa de rrhh corresponde para ENVIAR el fichaje. Dentro de `conTaller`.
import { ErrorPersonal } from './personal.ts'

type Delegado = { findFirst(a: any): Promise<any>; update(a: any): Promise<any> }
export type TxVinculo = { usuarioTaller: Delegado; taller: Delegado }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDENT = /^[A-Za-z0-9\-]{3,64}$/

/** Vacío = sin vincular (NULL), nunca cadena vacía. NIF/id: letras, números y guiones. */
export function validarIdentificadorRrhh(v: string): string | null {
  const t = v.trim().replace(/[\s.]/g, '')
  if (!t) return null
  if (!IDENT.test(t)) throw new ErrorPersonal('Identificador de RR.HH. no válido (NIF o id de empleado: letras, números y guiones)')
  return UUID.test(t) ? t.toLowerCase() : t.toUpperCase()
}

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

export async function guardarEmpresaRrhh(tx: TxVinculo, tallerId: string, valor: string): Promise<string | null> {
  const empresaId = validarEmpresaRrhh(valor)
  await tx.taller.update({ where: { id: tallerId }, data: { rrhhEmpresaId: empresaId } })
  return empresaId
}
