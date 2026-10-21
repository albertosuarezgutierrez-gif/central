// Consulta + envío del aviso de la cola de Google Contactos. La decisión es pura (`aviso-cola-google-contactos.ts`).
// 🛡️ Prisma con BYPASSRLS: cada consulta lleva `correduriaId`. Solo cifras por Telegram.
import { tgSend } from '@central/core-telegram'
import { esCarteraEnVigor } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { avisoColaGoogle, HORA_AVISO_COLA, textoAvisoColaGoogle, type FilaPendienteCola } from './aviso-cola-google-contactos'
import { horaEnMadrid } from './tarificador-humo-reglas'

export type ResultadoAvisoCola = { estado: 'fuera_de_hora' | 'sin_aviso' | 'avisado' | 'telegram_no_enviado'; pendientes?: number }

export async function avisarColaGoogleContactos(
  correduriaId: string,
  ahora: Date = new Date(),
  enviar: (t: string) => Promise<number | null> = (t) => tgSend(t),
): Promise<ResultadoAvisoCola> {
  if (horaEnMadrid(ahora) !== HORA_AVISO_COLA) return { estado: 'fuera_de_hora' }
  const db = prismaAsegura()
  const pendientes = await db.googleContactosRevision.findMany({
    where: { correduriaId, estado: 'pendiente' }, select: { clienteId: true, creadoEn: true },
  })
  if (pendientes.length === 0) return { estado: 'sin_aviso', pendientes: 0 }
  const ids = [...new Set(pendientes.flatMap((p) => (p.clienteId ? [p.clienteId] : [])))]
  const polizas = ids.length
    ? await db.poliza.findMany({ where: { correduriaId, clienteId: { in: ids } }, select: { clienteId: true, estado: true, importRef: true, eiacXmlHash: true, sustituidaAt: true } })
    : []
  const vigor = new Set(
    polizas.filter((p) => esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: String(p.estado), sustituidaAt: p.sustituidaAt })).map((p) => p.clienteId),
  )
  // Sin ficha (`clienteId` null: propuestas de lead) = sabido que no es cliente en vigor. Con ficha, la consulta ya se hizo:
  // sin póliza viva = no en vigor. El `null` (no se sabe) queda para quien llame sin poder calcularlo.
  const filas: FilaPendienteCola[] = pendientes.map((p) => ({ creadoEn: p.creadoEn, enVigor: p.clienteId ? vigor.has(p.clienteId) : false }))
  const aviso = avisoColaGoogle(filas, ahora)
  if (!aviso) return { estado: 'sin_aviso', pendientes: pendientes.length }
  const id = await enviar(textoAvisoColaGoogle(aviso, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO))
  return { estado: id === null ? 'telegram_no_enviado' : 'avisado', pendientes: pendientes.length }
}
