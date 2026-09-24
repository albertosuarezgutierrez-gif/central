// apps/asegura/lib/cartera-renovaciones-contacto.ts
//
// Historial de contactos de RENOVACIÓN — un cliente VIVO cuya póliza vence
// pronto (lista `vencimientosProximos()` de `cartera.ts`). Distinto de
// `cartera-recaptacion.ts`, que trabaja leads del volcado ya sin cliente
// activo: aquí SIEMPRE hay una ficha con póliza viva de por medio.
//
// No hay tabla de "cola": la lista se sigue calculando en cada GET, igual que
// `recaptacion_envios`. `renovacion_contactos` es solo el HISTORIAL que
// alimenta el cooldown de 14 días y el "contactado hace N días" de la
// pantalla — para que Alberto no repita el mismo aviso de renovación varias
// veces en la misma semana sin saberlo.
//
// 🔒 Igual que el resto de `lib/cartera-*.ts`: `prismaAsegura()` conecta con
// `?schema=seguros` ya en la URL, así que el SQL crudo NO prefija `seguros.`
// (evita el guardián de aislamiento de `test/regression-asegura-aislamiento.test.ts`,
// que solo mira SQL que nombre el schema explícitamente).

import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

/** Último contacto (si lo hay) por póliza, para el cooldown y el badge de la
 *  pantalla. `Map` vacío si ninguna de las pólizas pedidas tiene historial —
 *  eso NO se distingue de "no se pudo consultar": quien llama decide qué
 *  hacer con un `null` general si la consulta entera falla (ver `cartera.ts`). */
export async function ultimosContactosRenovacion(
  correduriaId: string,
  polizaIds: string[],
): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>()
  if (polizaIds.length === 0) return mapa
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ polizaId: string; ultimo: Date }[]>(Prisma.sql`
    select poliza_id as "polizaId", max(created_at) as ultimo
    from renovacion_contactos
    where correduria_id = ${correduriaId}::uuid
      and poliza_id in (${Prisma.join(polizaIds.map(id => Prisma.sql`${id}::uuid`))})
    group by poliza_id
  `)
  for (const f of filas) mapa.set(f.polizaId, f.ultimo)
  return mapa
}

/** Registra que Alberto abrió WhatsApp con el aviso de renovación ya escrito
 *  (mismo criterio que `registrarEnvioWhatsapp` de `cartera-recaptacion.ts`:
 *  el envío en sí lo hace su propio WhatsApp, esto solo deja constancia). */
export async function registrarContactoRenovacion(
  correduriaId: string,
  entrada: { clienteId: string; polizaId: string; mensaje: string; actor: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({
    where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { id: true },
  })
  if (!cliente) return { ok: false, motivo: 'Esa ficha no es de esta correduría.' }
  await db.$executeRaw(Prisma.sql`
    insert into renovacion_contactos (correduria_id, cliente_id, poliza_id, canal, mensaje, creado_por)
    values (${correduriaId}::uuid, ${entrada.clienteId}::uuid, ${entrada.polizaId}::uuid, 'whatsapp', ${entrada.mensaje}, ${entrada.actor})
  `)
  await anotar(correduriaId, entrada.clienteId, `Renovación: se abrió el enlace de WhatsApp (mensaje ya escrito) por ${entrada.actor}`)
  return { ok: true }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[cartera-renovaciones-contacto] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
