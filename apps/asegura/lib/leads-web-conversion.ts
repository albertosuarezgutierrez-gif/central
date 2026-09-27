// Conversión de leads WEB (`clientes.fuente='web'`) a cartera VIVA.
//
// ─── Por qué hace falta ─────────────────────────────────────────────────────
// `apps/asegura-web` capta leads desde el 05/09/2026; el formulario los da de
// alta con `fuente:'web'` (`apps/plataforma/lib/leads-web.ts`). Hasta hoy nadie
// cruzaba esa lista contra la cartera viva: no hay pantalla que responda «de
// los que entraron por la web, ¿cuántos son clientes hoy?» — el dato que
// Alberto pidió como paso previo a gastar en Ads. Un lead y el cliente en que
// se convierte son la MISMA fila de `clientes` (no hay tabla de leads aparte),
// así que la conversión se define por si esa ficha —o la que la fusión dejó
// viva— tiene alguna póliza `esCarteraViva()`.
//
// ─── Fusiones: se sigue la cadena, no la ficha original ────────────────────
// Un lead puede acabar fusionado en otra ficha (`merged_into_cliente_id`,
// regla «Agrupar personas: por IDENTIDAD, nunca por la etiqueta» de
// CLAUDE.md). Si no se sigue la cadena, un lead que en realidad SÍ se convirtió
// —pero cuyas pólizas cuelgan del superviviente— contaría como «no convertido».
// Un solo nivel de coalesce: los lotes de fusión de este repo escriben el
// superviviente FINAL directamente (nunca A→B→C), así que no hace falta
// recursión — ver `docs/CONTEXTO-SESIONES.md` (lotes 1-10 de fusión).
//
// ─── Lo que NO se hace: fuzzy-matching por teléfono/email ──────────────────
// No hace falta: la conversión no es «¿otro cliente se parece a este lead?»,
// es «¿esta MISMA ficha (o su fusión) tiene ya una póliza viva?». El
// fuzzy-matching de personas es del CRM de origen, no de este cruce.

import { sqlCarteraViva } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export type LeadWebPendiente = {
  clienteId: string
  nombre: string
  createdAt: string
  diasDesdeAlta: number
  tieneTelefono: boolean
  tieneEmail: boolean
}

export type ConversionLeadsWeb = {
  /** Leads `fuente='web'` de esta correduría, sin seguir fusión. */
  total: number
  /** De esos, los que hoy (siguiendo la fusión) tienen ≥1 póliza de cartera viva. */
  convertidos: number
  /** `null` cuando `total === 0`: no hay ratio que calcular, no es 0%. */
  tasaConversion: number | null
  /** Los NO convertidos, más antiguos primero (los que más urge trabajar). */
  pendientes: LeadWebPendiente[]
  primerLeadAt: string | null
  ultimoLeadAt: string | null
}

type FilaSql = {
  cliente_id: string
  nombre: string
  created_at: string
  tiene_telefono: boolean
  tiene_email: boolean
  tiene_poliza_final: boolean
}

const LIMITE_PENDIENTES = 200

export async function conversionLeadsWeb(correduriaId: string): Promise<ConversionLeadsWeb | null> {
  if (!aseguraConfigurada()) return null
  const db = prismaAsegura()

  // Un lead sin fusionar apunta a sí mismo (`coalesce`); uno fusionado, al
  // superviviente. `tiene_poliza_final` mira las pólizas de ESE id final con
  // el criterio ÚNICO de `@central/module-seguros` (`sqlCarteraViva`), no una
  // copia a mano — el guardián `test/regression-cartera-viva.test.ts` lo exige.
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const filas = await db.$queryRaw<FilaSql[]>`
    select
      c.id::text as cliente_id,
      btrim(concat_ws(' ', c.nombre, c.apellidos)) as nombre,
      to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
      (
        nullif(btrim(c.telefono), '') is not null
        or exists (select 1 from cliente_telefonos t where t.cliente_id = c.id and nullif(btrim(t.telefono), '') is not null)
      ) as tiene_telefono,
      (
        nullif(btrim(c.email), '') is not null
        or exists (select 1 from cliente_emails e where e.cliente_id = c.id and nullif(btrim(e.email), '') is not null)
      ) as tiene_email,
      coalesce((
        select bool_or(${viva})
        from polizas p
        where p.cliente_id = coalesce(c.merged_into_cliente_id, c.id)
          and p.correduria_id = c.correduria_id
          and p.merged_into_poliza_id is null
      ), false) as tiene_poliza_final
    from clientes c
    where c.correduria_id = ${correduriaId}::uuid
      and c.fuente = 'web'::fuente_origen
    order by c.created_at asc
  `

  const total = filas.length
  const convertidos = filas.filter((f) => f.tiene_poliza_final === true).length
  const noConvertidas = filas.filter((f) => f.tiene_poliza_final !== true)
  const hoy = Date.now()

  const pendientes: LeadWebPendiente[] = noConvertidas
    .slice(0, LIMITE_PENDIENTES)
    .map((f) => ({
      clienteId: f.cliente_id,
      nombre: f.nombre,
      createdAt: f.created_at,
      diasDesdeAlta: Math.max(0, Math.floor((hoy - new Date(f.created_at).getTime()) / 86_400_000)),
      tieneTelefono: f.tiene_telefono === true,
      tieneEmail: f.tiene_email === true,
    }))

  return {
    total,
    convertidos,
    tasaConversion: total > 0 ? convertidos / total : null,
    pendientes,
    primerLeadAt: total > 0 ? filas[0].created_at : null,
    ultimoLeadAt: total > 0 ? filas[total - 1].created_at : null,
  }
}
