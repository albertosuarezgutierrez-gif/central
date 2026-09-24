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
