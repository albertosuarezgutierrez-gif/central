/**
 * MOTE de una ficha (05/10/2026, decisión de Alberto): cómo la llama él en SU agenda de Google
 * («mamá», «Benito Pintor»). La sync de Google Contacts escribe «<emoji> <mote>» y deja el nombre de
 * la ficha en la nota («Ficha: …»).
 *
 * 🚨 AISLADO: tabla `seguros.cliente_mote`, sin relación Prisma con `Cliente`, y solo la leen la sync
 * de Google, esta edición y la cola de revisión. NUNCA en un correo, el portal, un PDF o un envío a
 * una compañía («Estimada Burra»). Guardián: `test/regression-mote-aislado.test.ts`.
 *
 * 🛡️ La tabla no lleva correduría: cada lectura/escritura comprueba antes que la ficha es de ESTA.
 */
import { MAX_MOTE } from '@central/module-seguros/google-contactos'

import { prismaAsegura } from './asegura-db'

export type ResultadoMote =
  | { ok: true; mote: string | null }
  | { ok: false; estado: 'no_encontrado' | 'invalido'; motivo: string; status: number }

async function fichaDeCorreduria(correduriaId: string, clienteId: string): Promise<boolean> {
  const f = await prismaAsegura().cliente.findFirst({ where: { correduriaId, id: clienteId }, select: { id: true } })
  return f !== null
}

export async function leerMote(correduriaId: string, clienteId: string): Promise<ResultadoMote> {
  if (!(await fichaDeCorreduria(correduriaId, clienteId))) return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no existe.', status: 404 }
  const m = await prismaAsegura().clienteMote.findUnique({ where: { clienteId }, select: { mote: true } })
  return { ok: true, mote: m?.mote ?? null }
}

/** `mote` vacío o `null` = quitarlo (el contacto vuelve a llamarse como la ficha). */
export async function guardarMote(correduriaId: string, clienteId: string, mote: string | null, actor: string): Promise<ResultadoMote> {
  const limpio = (mote ?? '').replace(/\s+/g, ' ').trim()
  if ([...limpio].length > MAX_MOTE) return { ok: false, estado: 'invalido', motivo: `El mote admite como mucho ${MAX_MOTE} caracteres.`, status: 422 }
  if (!(await fichaDeCorreduria(correduriaId, clienteId))) return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no existe.', status: 404 }
  const db = prismaAsegura()
  if (limpio === '') {
    await db.clienteMote.deleteMany({ where: { clienteId } })
    return { ok: true, mote: null }
  }
  const ahora = new Date()
  await db.clienteMote.upsert({
    where: { clienteId },
    create: { clienteId, mote: limpio, actualizadoPor: actor, actualizadoEn: ahora },
    update: { mote: limpio, actualizadoPor: actor, actualizadoEn: ahora },
  })
  return { ok: true, mote: limpio }
}
