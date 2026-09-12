// Código de un solo uso por Telegram para revelar el DNI COMPLETO de un
// cliente de la correduría. El resto de la ficha lo enseña enmascarado a
// propósito (`*****678Z`, puerto de asegura) — esto es el único camino que lo
// destapa, y solo con: (1) el corredor tiene sesión en plataforma, (2) pide un
// código, que llega SOLO al Telegram de Alberto, (3) lo teclea en 5 minutos.
//
// El código se guarda hasheado (nunca en claro) y de un solo uso. `cuentaId`
// scoping por si algún día hay más de una cuenta — hoy solo existe la de
// Alberto, pero la regla del repo es filtrar siempre por cuenta_id.

import { createHash, randomInt } from 'crypto'
import { prisma } from '@/lib/db'

const VIGENCIA_MIN = 5

function hashCodigo(codigo: string, cuentaId: string, clienteId: string): string {
  // La sal (cuenta+cliente) evita que un hash filtrado sirva para otra ficha.
  return createHash('sha256').update(`${cuentaId}:${clienteId}:${codigo}`).digest('hex')
}

function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Genera un código nuevo, invalida los anteriores sin usar de ese cliente y lo guarda hasheado. */
export async function crearCodigoDni(cuentaId: string, clienteId: string): Promise<string> {
  const codigo = generarCodigo()
  const hash = hashCodigo(codigo, cuentaId, clienteId)
  await prisma.$executeRaw`
    update correduria_dni_otp set usado_at = now()
    where cuenta_id = ${cuentaId}::uuid and cliente_id = ${clienteId} and usado_at is null`
  await prisma.$executeRaw`
    insert into correduria_dni_otp (cuenta_id, cliente_id, codigo_hash, expira_at)
    values (${cuentaId}::uuid, ${clienteId}, ${hash}, now() + make_interval(mins => ${VIGENCIA_MIN}::int))`
  return codigo
}

/** Verifica y CONSUME un código. `true` solo si estaba vigente, sin usar y coincidía. */
export async function verificarCodigoDni(cuentaId: string, clienteId: string, codigo: string): Promise<boolean> {
  if (!/^\d{6}$/.test(codigo)) return false
  const hash = hashCodigo(codigo, cuentaId, clienteId)
  const r = await prisma.$executeRaw`
    update correduria_dni_otp set usado_at = now()
    where cuenta_id = ${cuentaId}::uuid and cliente_id = ${clienteId}
      and codigo_hash = ${hash} and usado_at is null and expira_at > now()`
  return r > 0
}
