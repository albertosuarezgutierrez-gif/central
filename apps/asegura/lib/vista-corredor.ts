// La «vista de corredor»: el enlace de un solo uso con el que Alberto abre el
// portal COMO lo ve un cliente. Aquí se CREA; lo consume `apps/asegura-portal`
// (`/corredor/[token]`). Reglas y constantes compartidas en
// `@central/module-seguros-portal/vista-corredor` — léelo antes de tocar esto.
import { enlaceVistaCorredor, generarTokenVista, hashTokenVista } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { enlacePortal } from './correo-invitacion-portal'

export type ResultadoVista =
  | { ok: true; url: string }
  | { ok: false; estado: 'no_encontrado' | 'sin_portal'; motivo: string; status: 404 | 503 }

/**
 * «Ver como el cliente» un presupuesto (18/10/2026), también un BORRADOR sin enviar. Es la MISMA vista de corredor
 * (token de un uso, 10 min, sesión `corredor` que el middleware del portal no deja escribir, sin sello `visto_at`)
 * abierta sobre la ficha del presupuesto y aterrizando en su página (`?presupuesto=<uuid>`). El presupuesto se busca
 * por `correduria_id` y sin retirar; la ficha sale de ÉL, nunca de la petición. El portal vuelve a autorizar la página
 * por el vínculo temporal de esa ficha: un `?presupuesto=` cambiado a mano solo abre presupuestos de esa misma ficha.
 */
export async function crearVistaPresupuesto(
  correduriaId: string,
  entrada: { presupuestoId: string; actor: string },
): Promise<ResultadoVista> {
  if (!UUID.test(entrada.presupuestoId)) {
    return { ok: false, estado: 'no_encontrado', motivo: 'Ese presupuesto no existe en esta correduría.', status: 404 }
  }
  const p = await prismaAsegura().presupuesto.findFirst({
    where: { id: entrada.presupuestoId, correduriaId, retiradoAt: null },
    select: { id: true, clienteId: true },
  })
  if (!p) return { ok: false, estado: 'no_encontrado', motivo: 'Ese presupuesto no existe en esta correduría o está retirado.', status: 404 }
  const r = await crearVistaCorredor(correduriaId, { clienteId: p.clienteId, actor: entrada.actor })
  if (!r.ok) return r
  return { ok: true, url: enlaceConPresupuesto(r.url, p.id) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El enlace de la vista con el presupuesto en el que aterrizar. PURA (el portal solo acepta un uuid). */
export function enlaceConPresupuesto(url: string, presupuestoId: string): string {
  const u = new URL(url)
  u.searchParams.set('presupuesto', presupuestoId)
  return u.toString()
}

export async function crearVistaCorredor(
  correduriaId: string,
  entrada: { clienteId: string; actor: string },
): Promise<ResultadoVista> {
  const db = prismaAsegura()
  // La ficha tiene que ser de ESTA correduría y estar viva: una fusionada ya no
  // es una bóveda, es una lápida, y el portal enseñaría la del destino.
  const ficha = await db.cliente.findFirst({
    where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { id: true },
  })
  if (!ficha) {
    return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no existe en esta correduría.', status: 404 }
  }

  // El enlace se compone con la MISMA base que el correo de invitación: una
  // segunda fuente del destino es la forma de que el correo vaya a un dominio y
  // el botón a otro, los dos con un 200.
  const base = enlacePortal()
  if (!base) {
    return {
      ok: false,
      estado: 'sin_portal',
      motivo: 'No hay una dirección de portal configurada (ASEGURA_PORTAL_URL): no hay a dónde abrir.',
      status: 503,
    }
  }

  const token = generarTokenVista()
  await db.portalVistaCorredor.create({
    data: {
      correduriaId,
      clienteId: ficha.id,
      tokenHash: await hashTokenVista(token),
      actor: entrada.actor,
    },
  })
  const url = enlaceVistaCorredor(base, token)
  // `enlaceVistaCorredor` solo devuelve null sin base, y la base ya se comprobó.
  if (!url) return { ok: false, estado: 'sin_portal', motivo: 'No se pudo componer el enlace del portal.', status: 503 }
  return { ok: true, url }
}
