import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * Resuelve el email al que enviar facturas / avisos de facturación de un cliente.
 * Prioridad:
 *   1. email_facturacion (campo fiscal dedicado del cliente)
 *   2. email del contacto marcado como pagador (cliente_contactos.es_pagador)
 *   3. email del contacto principal (cliente_contactos.principal)
 *   4. notif_email (canal de notificaciones del cliente)
 *   5. contacto_email (campo legacy del cliente)
 *
 * `cliente` debe traer al menos: id, email_facturacion, notif_email, contacto_email.
 * Devuelve el email (trim) o '' si no hay ninguno.
 */
export async function emailFacturacionCliente(
  empresa_id: string,
  cliente: { id: string; email_facturacion?: string | null; notif_email?: string | null; contacto_email?: string | null }
): Promise<string> {
  if (cliente.email_facturacion?.trim()) return cliente.email_facturacion.trim()

  // Mejor contacto con email: primero el pagador, luego el principal
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT email FROM cliente_contactos
    WHERE cliente_id = ${cliente.id}::uuid AND empresa_id = ${empresa_id}::uuid
      AND email IS NOT NULL AND email <> ''
    ORDER BY es_pagador DESC, principal DESC, nombre NULLS LAST
    LIMIT 1
  `)
  if (rows[0]?.email?.trim()) return rows[0].email.trim()

  return (cliente.notif_email || cliente.contacto_email || '').trim()
}
