// Importación del HISTORIAL de Coexistence (Alberto elige «compartir 6 meses» al conectar; decisión 04/11/2026).
// Solo con WHATSAPP_IMPORTAR_HISTORIAL=1 y el canal activo. Sustituye al antiguo «guardar el crudo» (que guardaba en
// claro TODOS los chats, también los personales): ahora NUNCA se guarda el crudo.
//
//   · Un hilo se importa SOLO si su teléfono casa con UNA ficha viva (la misma regla que `procesar.ts`). Sin ficha,
//     teléfono compartido, opt-out (conversación o ficha) o conversación `descartada_personal` → se descarta y solo se
//     CUENTA (sin texto, sin número, sin crear conversación).
//   · Los mensajes entran CIFRADOS en `mensajes` con `metadata.origen = 'historial'` y deduplicados por wamid.
//   · NO se toca `ultimo_mensaje_at` ni `analizada_hasta`: importar NO dispara el análisis ni la respuesta. El
//     historial solo es CONTEXTO cuando llegue un mensaje en directo (y la respuesta automática nunca contesta a un
//     entrante `historial`: `puedeResponder` → `entrante_historial`).
//   · Idempotente: Meta reintenta el webhook si falla; un hilo ya importado no duplica nada.

import { aE164, formasHashTelefono, telefonoParaFicha } from '@central/module-seguros'
import { computeTelefonoLookupHash, encryptField } from '@central/module-seguros-pii'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { fichasPorHashes } from './procesar'
import { hilosDeHistorial } from './eventos'

/** Lo que Alberto comparte (6 meses) con holgura; lo anterior no se importa aunque llegue. */
export const DIAS_HISTORIAL = 186

export type ResumenImportacion = { hilosImportados: number; mensajesImportados: number; hilosDescartados: number; mensajesDescartados: number }

export async function importarHistorial(correduriaId: string, valor: unknown, ahora: Date = new Date()): Promise<ResumenImportacion> {
  const r: ResumenImportacion = { hilosImportados: 0, mensajesImportados: 0, hilosDescartados: 0, mensajesDescartados: 0 }
  const desde = new Date(ahora.getTime() - DIAS_HISTORIAL * 24 * 60 * 60 * 1000)
  const db = prismaAsegura()
  for (const hilo of hilosDeHistorial(valor, desde)) {
    const descartar = () => {
      r.hilosDescartados++
      r.mensajesDescartados += hilo.mensajes.length
    }
    const e164 = aE164(`+${hilo.waId}`)
    const hash = e164 ? computeTelefonoLookupHash(telefonoParaFicha(e164)) : null
    // Sin PII_LOOKUP_KEY no se puede casar: se lanza (Meta reintenta) en vez de descartar en silencio.
    if (e164 && hash === null) throw new Error('sin_clave_pii')
    if (!e164 || !hash) {
      descartar()
      continue
    }
    const hashes = formasHashTelefono(e164).map((x) => computeTelefonoLookupHash(x)).filter((x): x is string => x !== null)
    const fichas = await fichasPorHashes(correduriaId, hashes)
    if (fichas.length !== 1) {
      descartar()
      continue
    }
    const clienteId = fichas[0]
    const [ficha] = await db.$queryRaw<{ opt_out: boolean }[]>(Prisma.sql`
      select wa_opt_out_at is not null as opt_out from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (!ficha || ficha.opt_out) {
      descartar()
      continue
    }
    const telefonoCifrado = encryptField(e164)
    const filas = hilo.mensajes.map((m) => ({ ...m, cifrado: encryptField(m.texto) }))
    const n = await db.$transaction(async (tx) => {
      // Misma conversación que usaría `procesar.ts` (una por correduría + teléfono), SIN ultimo_mensaje_at.
      const [conv] = await tx.$queryRaw<{ id: string; estado: string; opt_out: boolean; cliente_id: string | null }[]>(Prisma.sql`
        insert into conversaciones
          (correduria_id, cliente_id, wa_thread_id, estado, lead_wa_phone, wa_telefono_hash, wa_telefono_cifrado, clientes_candidatos, updated_at)
        values (${correduriaId}::uuid, ${clienteId}::uuid, ${`wa:${hash}`}, 'abierta', null, ${hash}, ${telefonoCifrado}, 1, now())
        on conflict (correduria_id, wa_telefono_hash) where wa_telefono_hash is not null do update set
          clientes_candidatos = excluded.clientes_candidatos,
          cliente_id = coalesce(conversaciones.cliente_id, excluded.cliente_id),
          estado = case when conversaciones.cliente_id is null and conversaciones.estado = 'pendiente_clasificar' then 'abierta' else conversaciones.estado end,
          wa_telefono_cifrado = coalesce(conversaciones.wa_telefono_cifrado, excluded.wa_telefono_cifrado),
          updated_at = now()
        returning id::text as id, estado, wa_opt_out_at is not null as opt_out, cliente_id::text as cliente_id`)
      // Opt-out, personal o enlazada a OTRA ficha: no se guarda texto (y la conversación ya existía: no se crea nada nuevo).
      if (!conv || conv.opt_out || conv.estado !== 'abierta' || conv.cliente_id !== clienteId) return null
      const valores = filas.map((m) => Prisma.sql`(${conv.id}::uuid, ${m.direccion === 'entrante' ? 'cliente' : 'corredor'}, ${m.cifrado}, ${m.wamid},
        ${JSON.stringify({ canal: 'whatsapp', campo: 'history', origen: 'historial' })}::jsonb, ${m.direccion}, ${m.tipo}, ${m.fecha}, 'historial')`)
      return tx.$executeRaw(Prisma.sql`
        insert into mensajes (conversacion_id, rol, contenido, wa_message_id, metadata, direccion, tipo, enviado_at, estado)
        values ${Prisma.join(valores)}
        on conflict (conversacion_id, wa_message_id) where direccion is not null and wa_message_id is not null do nothing`)
    })
    if (n === null) {
      descartar()
      continue
    }
    r.hilosImportados++
    r.mensajesImportados += n
  }
  return r
}
