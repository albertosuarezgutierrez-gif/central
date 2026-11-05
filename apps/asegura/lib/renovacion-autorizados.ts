// RENOVACIÓN CON ALTERNATIVAS (05/11/2026): las autorizaciones del TOMADOR vistas desde cada identidad del portal, para
// decidir quién ve la renovación y la ELIGE además del tomador (regla PURA `identidadesQueEligenRenovacion` de
// `@central/module-seguros-portal`, la misma que usa el portal). Solo LEE. Fichero aparte para que el cron de avisos
// (`avisos-intranet.ts`) no cargue el Catastro ni Telegram de `renovacion-alternativas.ts`.
//
// 🛡️ Todo por `correduria_id`. Las dos vías por las que una autorización llega a alguien: a su IDENTIDAD del portal
// (`autorizado_identidad_id`) o a su FICHA (`autorizado_cliente_id`) y de ahí a las identidades vinculadas a ella (con el
// nivel de ese vínculo: sin nivel de operar no actúa). Las revocadas ni se leen; la vigencia la decide la regla pura.
import type { FilaAutorizacionRenovacion } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'

export type FilaAutorizacionRenovacionBD = FilaAutorizacionRenovacion & {
  /** La ficha autorizada cuando la autorización es a una FICHA (a ella va el correo de aviso). `null` = a una identidad. */
  autorizadoClienteId: string | null
}

/**
 * Las filas (no revocadas) del tomador `tomadorId`. `identidadId` = solo las que llegan a esa identidad. Un fallo LANZA:
 * quien llama decide (nunca «no hay autorizados» por un error).
 */
export async function filasAutorizacionRenovacion(correduriaId: string, tomadorId: string, identidadId: string | null): Promise<FilaAutorizacionRenovacionBD[]> {
  const filas = await prismaAsegura().$queryRaw<(Omit<FilaAutorizacionRenovacionBD, 'identidadId'> & { identidadId: string | null })[]>`
    select a.id::text as "autorizacionId", a.alcance, a.aceptado_en as "aceptadoEn", a.caduca_en as "caducaEn", a.revocado_en as "revocadoEn",
           a.poliza_id::text as "polizaId", pf.merged_into_poliza_id::text as "polizaFusionadaEn",
           a.autorizado_identidad_id::text as "identidadId", null::text as "nivelVinculo", false as "vinculoDeCorredor", pi.nombre as nombre,
           null::text as "autorizadoClienteId"
    from portal_autorizacion a
    left join polizas pf on pf.id = a.poliza_id and pf.correduria_id = a.correduria_id
    left join portal_identidad pi on pi.id = a.autorizado_identidad_id
    where a.correduria_id = ${correduriaId}::uuid and a.otorgante_cliente_id = ${tomadorId}::uuid and a.revocado_en is null
      and a.autorizado_identidad_id is not null
      and (${identidadId}::uuid is null or a.autorizado_identidad_id = ${identidadId}::uuid)
    union all
    select a.id::text, a.alcance, a.aceptado_en, a.caduca_en, a.revocado_en,
           a.poliza_id::text, pf.merged_into_poliza_id::text,
           v.identidad_id::text, v.nivel::text, (v.origen::text = 'corredor'), c.nombre,
           a.autorizado_cliente_id::text
    from portal_autorizacion a
    join portal_vinculo v on v.cliente_id = a.autorizado_cliente_id and v.correduria_id = a.correduria_id
    left join clientes c on c.id = a.autorizado_cliente_id and c.correduria_id = a.correduria_id
    left join polizas pf on pf.id = a.poliza_id and pf.correduria_id = a.correduria_id
    where a.correduria_id = ${correduriaId}::uuid and a.otorgante_cliente_id = ${tomadorId}::uuid and a.revocado_en is null
      and a.autorizado_cliente_id is not null
      and (${identidadId}::uuid is null or v.identidad_id = ${identidadId}::uuid)`
  return filas.filter((f): f is FilaAutorizacionRenovacionBD => typeof f.identidadId === 'string' && f.identidadId !== '')
}
