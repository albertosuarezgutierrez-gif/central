// Las felicitaciones de cumpleaños como CAMPAÑA (07/11/2026): el embudo felicitados → entregado → abierto → clic →
// entró al portal en los 7 días siguientes, partido por grupo (clientes en vigor / ex-clientes / posibles clientes)
// y por año. Misma forma que `embudoPresentacionApp` para que la pantalla Campañas lo pinte sin otra UI.
// La regla es pura (`campana-felicitacion-reglas.ts`); el estado del email de cada persona, `email-estado-bd.ts`.
//
// La felicitación se ata a su correo por `felicitacion.resend_message_id` y, si falta (anterior al 07/11/2026 o el
// guardado del id falló), por su `correo_envio` (tipo `felicitacion`, misma ficha y mismo día de Madrid).
//
// 🔒 Sin `seguros.` en el SQL: `prismaAsegura()` ya conecta con `?schema=seguros`.
import { etapaPersona } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import {
  CAMPANA_FELICITACION, DIAS_PORTAL_TRAS_FELICITAR, embudoFelicitacion, embudoFelicitacionPorGrupo, grupoFelicitacion,
  type FilaFelicitacion,
} from './campana-felicitacion-reglas.ts'
import { sondaEmailDe } from './email-estado-bd'
import type { EmbudoPresentacion, PersonaCampana } from './presentacion-app'

export { CAMPANA_FELICITACION }

const LIMITE_PERSONAS = 1000

/** `false` = falta `prisma/sql/2026-11-07_email_rebotado.sql` (columna `felicitacion.resend_message_id`). */
export async function felicitacionMigrada(): Promise<boolean> {
  const filas = await prismaAsegura().$queryRaw<{ ok: boolean }[]>(Prisma.sql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'seguros' and table_name = 'felicitacion' and column_name = 'resend_message_id') as ok`)
  return filas[0]?.ok === true
}

type FilaBD = {
  clienteId: string; nombre: string | null; apellidos: string | null; email: string | null
  anio: number; dia: string; variante: string | null; canal: string
  estadoEnvio: string | null; resendId: string | null; enviadoEn: Date | null
  eventos: string[] | null; entregadoEn: Date | null; abiertoEn: Date | null; clicEn: Date | null; rebotadoEn: Date | null
  portalEn: Date | null; optOutAt: Date | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** Lanza si no puede leer (la ruta responde 500): un fallo nunca se sirve como «sin felicitaciones». */
export async function embudoFelicitaciones(correduriaId: string): Promise<EmbudoPresentacion> {
  if (!(await felicitacionMigrada())) return { estado: 'sin_migracion' }
  const filas = await prismaAsegura().$queryRaw<FilaBD[]>(Prisma.sql`
    select f.cliente_id as "clienteId", c.nombre, c.apellidos, c.email, f.anio::int as anio, to_char(f.dia, 'YYYY-MM-DD') as dia,
      f.variante, f.canal,
      ce.estado as "estadoEnvio", coalesce(ce.resend_id, f.resend_message_id) as "resendId", ce.creado_en as "enviadoEn",
      ev.tipos as eventos, ev.entregado as "entregadoEn", ev.abierto as "abiertoEn", ev.clic as "clicEn", ev.rebote as "rebotadoEn",
      pa.primero as "portalEn", c.email_opt_out_at as "optOutAt"
    from felicitacion f
    join clientes c on c.id = f.cliente_id and c.correduria_id = f.correduria_id
    left join lateral (
      select e.estado, e.resend_id, e.creado_en from correo_envio e
      where e.correduria_id = f.correduria_id and e.cliente_id = f.cliente_id and e.tipo = 'felicitacion'
        and (e.resend_id = f.resend_message_id
          or (f.resend_message_id is null and (e.creado_en at time zone 'Europe/Madrid')::date = f.dia))
      order by (e.resend_id is not distinct from f.resend_message_id) desc, (e.estado = 'enviado') desc, e.creado_en desc
      limit 1
    ) ce on true
    left join lateral (
      select array_agg(distinct x.tipo) as tipos,
        min(x.ocurrido_en) filter (where x.tipo = 'email.delivered') as entregado,
        min(x.ocurrido_en) filter (where x.tipo = 'email.opened') as abierto,
        min(x.ocurrido_en) filter (where x.tipo = 'email.clicked') as clic,
        min(x.ocurrido_en) filter (where x.tipo in ('email.bounced', 'email.complained', 'email.suppressed')) as rebote
      from correo_evento x where x.resend_id = coalesce(ce.resend_id, f.resend_message_id)
    ) ev on true
    -- Entró al portal en los 7 días siguientes al correo, con un vínculo PROPIO (no el temporal del corredor).
    left join lateral (
      select min(a.creado_en) as primero
      from portal_vinculo pv join portal_acceso a on a.identidad_id = pv.identidad_id
      where pv.correduria_id = f.correduria_id and pv.cliente_id = f.cliente_id and pv.origen <> 'corredor'
        and a.creado_en >= ce.creado_en
        and a.creado_en < ce.creado_en + make_interval(days => ${DIAS_PORTAL_TRAS_FELICITAR}::int)
    ) pa on true
    where f.correduria_id = ${correduriaId}::uuid
      -- Felicitado POR CORREO = hubo intento de envío. Las de «solo en la app» sin correo, las propuestas sin
      -- pulsar y las descartadas no son de este embudo.
      and (ce.estado is not null or f.canal = 'correo')
    order by f.dia desc, f.creado_en desc`)

  const conEmbudo = filas.map((f) => {
    const enviado = f.estadoEnvio === null ? f.canal === 'correo' : f.estadoEnvio === 'enviado'
    const fila: FilaFelicitacion = {
      enviado,
      // Sin id de Resend no puede haber eventos (SMTP): «no se sabe». Con id y sin filas: aún no llegó ninguno.
      eventos: f.resendId === null ? null : (f.eventos ?? []),
      visita: false,
      registrado: false,
      // Baja posterior a la felicitación (quien la pidió contestando o se quejó de spam).
      baja: f.optOutAt !== null && f.enviadoEn !== null && f.optOutAt.getTime() >= f.enviadoEn.getTime() - 60_000,
      portal: f.portalEn !== null,
    }
    return { ...fila, f, grupo: grupoFelicitacion(f.variante), anio: String(f.anio) }
  })

  const visibles = conEmbudo.slice(0, LIMITE_PERSONAS)
  const sonda = await sondaEmailDe(correduriaId, visibles.map((x) => x.f.clienteId))
  const personas: PersonaCampana[] = visibles.map(({ f, grupo, ...fila }) => {
    const s = sonda.get(f.clienteId) ?? null
    return {
      clienteId: f.clienteId,
      nombre: [f.nombre, f.apellidos].filter(Boolean).join(' ').trim(),
      email: descifrarCampo(f.email),
      lote: f.anio,
      loteFecha: f.dia,
      variante: grupo,
      etapa: etapaPersona(fila),
      enviadoEn: (f.enviadoEn ?? new Date(`${f.dia}T12:00:00Z`)).toISOString(),
      entregadoEn: iso(f.entregadoEn),
      abiertoEn: iso(f.abiertoEn),
      clicEn: iso(f.clicEn),
      visitaEn: iso(f.portalEn),
      registradoEn: null,
      bajaEn: fila.baja ? iso(f.optOutAt) : null,
      rebotadoEn: iso(f.rebotadoEn),
      estadoEmail: s?.estadoEmail ?? null,
      contactabilidad: s?.contactabilidad ?? null,
    }
  })
  // Ilocalizables = de los felicitados, cuántos tienen el email malo y ningún teléfono utilizable. Solo de la lista
  // leída (máx. LIMITE_PERSONAS); `null` si la lista está recortada, para no dar una cifra parcial como total.
  const ilocalizables = conEmbudo.length > LIMITE_PERSONAS ? null : personas.filter((p) => p.contactabilidad === 'ilocalizable').length

  return {
    estado: 'ok',
    campana: CAMPANA_FELICITACION,
    total: { ...embudoFelicitacion(conEmbudo), ilocalizables },
    porLote: embudoFelicitacionPorGrupo(conEmbudo, (x) => x.anio),
    porVariante: embudoFelicitacionPorGrupo(conEmbudo, (x) => x.grupo),
    personas,
  }
}
