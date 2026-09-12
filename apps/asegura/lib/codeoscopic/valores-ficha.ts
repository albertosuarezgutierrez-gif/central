// Valores de la PERSONA que se pueden sacar de la ficha del cliente para
// reparar un 400 sin preguntar al corredor. Compartido por `/oferta` (ReRate)
// y `/emitir` (Submit): las dos llamadas piden campos que la cotización
// inicial no exigía, y las dos los reparan igual — ficha primero, nunca un
// dato inventado. Antes vivía duplicado (una copia solo para `nombreVia` en
// `oferta/route.ts`); esta es la única.

import { decryptField } from '@central/module-seguros-pii'
import { prisma } from '../tenant'
import { partirDireccion } from './direccion'
import type { CampoPersona } from './interprete-400'

const CAMPOS_SOPORTADOS: readonly CampoPersona[] = ['nombreVia', 'email']

/**
 * Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el cifrado (`v1:…`) tal
 * cual sin lanzar: eso no es un valor, y tampoco es «no tiene».
 */
function descifrado(cifrado: string | null): string | null {
  if (!cifrado) return null
  try {
    const claro = decryptField(cifrado)
    return claro && !claro.startsWith('v1:') ? claro : null
  } catch {
    return null
  }
}

export async function valoresPersonaDesdeFicha(
  t: { correduria_id: string; poliza_id: string | null; cliente_id: string | null },
  pedidos: CampoPersona[],
): Promise<Partial<Record<CampoPersona, string>>> {
  const pedidosSoportados = pedidos.filter((c) => CAMPOS_SOPORTADOS.includes(c))
  if (pedidosSoportados.length === 0) return {}
  if (!t.cliente_id && !t.poliza_id) return {}
  try {
    const filas = await prisma.$queryRaw<{ direccion: string | null; email: string | null }[]>`
      select c.direccion, c.email
      from clientes c
      where c.correduria_id = ${t.correduria_id}::uuid
        and c.id = coalesce(
          ${t.cliente_id}::uuid,
          (select p.cliente_id from polizas p where p.id = ${t.poliza_id}::uuid limit 1)
        )
      limit 1
    `
    const fila = filas[0]
    if (!fila) return {}
    const resultado: Partial<Record<CampoPersona, string>> = {}
    if (pedidosSoportados.includes('nombreVia')) {
      const direccion = descifrado(fila.direccion)
      const nombre = direccion ? partirDireccion(direccion).nombre : null
      if (nombre) resultado.nombreVia = nombre
    }
    if (pedidosSoportados.includes('email')) {
      const email = descifrado(fila.email)
      if (email) resultado.email = email
    }
    return resultado
  } catch {
    return {}
  }
}
