// Valores de la PERSONA que se pueden sacar de la ficha del cliente para
// reparar un 400 sin preguntar al corredor. Compartido por `/oferta` (ReRate)
// y `/emitir` (Submit): las dos llamadas piden campos que la cotización
// inicial no exigía, y las dos los reparan igual — ficha primero, nunca un
// dato inventado. Antes vivía duplicado (una copia solo para `nombreVia` en
// `oferta/route.ts`); esta es la única.

import { decryptField } from '@central/module-seguros-pii'
import { prisma } from '../tenant'
import { emailDeFicha } from '../email-ficha'
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
    // 🚨 SIEMPRE por el cliente vivo, nunca por una lápida: `merged_into_cliente_id
    // is null` en las dos consultas de abajo. Sin esto, una ficha fusionada (50+
    // en esta cartera) devolvería la dirección/correo de la lápida — que puede
    // llevar meses sin actualizarse — en vez de los de la ficha superviviente.
    const filas = await prisma.$queryRaw<{ cliente_id: string; direccion: string | null }[]>`
      select c.id::text as cliente_id, c.direccion
      from clientes c
      where c.correduria_id = ${t.correduria_id}::uuid
        and c.merged_into_cliente_id is null
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
      // 🚨 Reutiliza `emailDeFicha` (email-ficha.ts) en vez de leer
      // `clientes.email` a pelo: esa columna es el ESPEJO, no la fuente — el
      // email principal puede vivir solo en `cliente_emails` (57 fichas de la
      // cartera, 5 de las 80 vivas), y una segunda implementación de «cuál es
      // el correo de este cliente» es justo la divergencia silenciosa que ese
      // fichero se extrajo para evitar (respeta además la baja de correo y el
      // ilegible≠inexistente que `descifrado()` de aquí no distingue).
      const email = await emailDeFicha(t.correduria_id, fila.cliente_id)
      if (email) resultado.email = email
    }
    return resultado
  } catch {
    return {}
  }
}
