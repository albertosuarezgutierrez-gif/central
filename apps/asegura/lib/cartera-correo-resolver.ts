/**
 * ¿De qué cliente(s) es este correo de aseguradora? — la mitad con BD del
 * puente entre el triaje de correo de `apps/plataforma` y la ficha del cliente
 * (20/09/2026). La extracción de candidatos y la decisión de match EXACTO son
 * puras y viven en `@central/module-seguros-portal`; aquí solo se lee la
 * cartera y se filtra a lo que puede tener sentido resolver.
 *
 * 🚨 Solo la CARTERA VIVA y EN VIGOR: un correo de aseguradora sobre una póliza
 * del volcado histórico —o cancelada— no cuelga nota en ninguna ficha. Mismo
 * filtro que `avisos-vencimiento.ts` (`WHERE_CARTERA_VIVA` + estados vigentes +
 * ficha activa), y por el mismo motivo: no se avisa/anota sobre algo que ya no
 * gestiona la casa.
 *
 * 🚨 Devuelve TODOS los clientes que casan, no el primero: una liquidación de
 * comisiones nombra pólizas de varios clientes a la vez, y quedarse con uno
 * solo perdería en silencio la nota de los demás.
 */
import { candidatosNumeroPoliza, elegirPolizasResueltas, normalizarNumeroPoliza, type ResolucionPoliza } from '@central/module-seguros-portal'
import { POLIZA_ESTADOS_VIGENTES, WHERE_CARTERA_VIVA } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'

export async function resolverPolizasDeCorreo(correduriaId: string, texto: string): Promise<ResolucionPoliza[]> {
  const candidatos = candidatosNumeroPoliza(texto)
    .map(normalizarNumeroPoliza)
    .filter((n): n is string => n !== null)
  if (candidatos.length === 0) return []

  const db = prismaAsegura()
  const polizas = await db.poliza.findMany({
    where: {
      correduriaId,
      ...WHERE_CARTERA_VIVA,
      mergedIntoPolizaId: null,
      estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
      numeroPoliza: { not: null },
      cliente: { activo: true },
    },
    // Orden estable: aunque ahora se devuelven TODOS los matches, un orden fijo
    // hace reproducible qué póliza gana cuando un mismo cliente tiene varias.
    orderBy: { id: 'asc' },
    select: { id: true, clienteId: true, numeroPoliza: true },
  })
  const resolubles = polizas
    .filter((p): p is typeof p & { numeroPoliza: string } => p.numeroPoliza !== null)
    .map((p) => ({ id: p.id, clienteId: p.clienteId, numeroPoliza: p.numeroPoliza }))

  return elegirPolizasResueltas(candidatos, resolubles)
}
