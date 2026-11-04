// Resumen diario del canal WhatsApp por Telegram — LECTURA (BD) + envío. Reglas y texto: `resumen-diario-reglas.ts`.
// Apagado por defecto (`ASEGURA_WHATSAPP_RESUMEN_ACTIVO='1'`). Solo lee; nunca escribe en la cartera ni habla con Meta.
// Solo conversaciones CON ficha y sin baja: las que no tienen ficha pueden ser personales (familia, amigos) y no se nombran.
// 🛡️ Todo filtra `correduria_id`. SQL sin prefijo de schema (la conexión trae `?schema=seguros`).

import { tgSend } from '@central/core-telegram'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { whatsappActivo } from './config'
import {
  DIAS_MAX_SIN_CONTESTAR,
  diaMadrid,
  resumenActivo,
  textoResumenDiario,
  type ConversacionDia,
  type PropuestaPendiente,
} from './resumen-diario-reglas'

type Fila = {
  nombre: string | null; entrantes: number; salientes_ia: number; ult_dir: string | null; ult_at: Date | null
  intencion: string | null; riesgo: string | null; resumen: string | null; acciones: number
}

const aVista = (f: Fila): ConversacionDia => ({
  nombre: f.nombre,
  entrantes: f.entrantes,
  salientesIa: f.salientes_ia,
  ultimaDireccion: f.ult_dir === 'entrante' || f.ult_dir === 'saliente' ? f.ult_dir : null,
  ultimoAt: f.ult_at,
  intencion: f.intencion,
  riesgoAbandono: f.riesgo,
  resumen: f.resumen,
  accionesAplicadas: f.acciones,
})

// Las conversaciones con ficha viva (no fusionada), sin baja y que no son personales.
const BASE = Prisma.sql`
  from conversaciones cv
  join clientes c on c.id = cv.cliente_id and c.correduria_id = cv.correduria_id
 where cv.wa_telefono_hash is not null and cv.estado <> 'descartada_personal'
   and cv.wa_opt_out_at is null and c.wa_opt_out_at is null and c.merged_into_cliente_id is null`

const CAMPOS = Prisma.sql`
  nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as nombre,
  cv.analisis->>'intencion' as intencion, cv.analisis->>'riesgo_abandono' as riesgo, cv.analisis->>'resumen' as resumen,
  (select count(*)::int from jsonb_array_elements(case when jsonb_typeof(cv.analisis->'acciones') = 'array' then cv.analisis->'acciones' else '[]'::jsonb end) a
    where a->>'resultado' = 'hecho') as acciones,
  (select m.direccion from mensajes m where m.conversacion_id = cv.id and m.direccion is not null and m.enviado_at is not null order by m.enviado_at desc limit 1) as ult_dir,
  (select m.enviado_at from mensajes m where m.conversacion_id = cv.id and m.direccion is not null and m.enviado_at is not null order by m.enviado_at desc limit 1) as ult_at`

export async function leerDatosResumen(correduriaId: string, ahora: Date) {
  const db = prismaAsegura()
  const { inicio, fin } = diaMadrid(ahora)
  const hoy = await db.$queryRaw<Fila[]>(Prisma.sql`
    select ${CAMPOS},
      (select count(*)::int from mensajes m where m.conversacion_id = cv.id and m.direccion = 'entrante' and m.enviado_at >= ${inicio} and m.enviado_at < ${fin}) as entrantes,
      (select count(*)::int from mensajes m where m.conversacion_id = cv.id and m.direccion = 'saliente' and m.rol = 'bot' and m.enviado_at >= ${inicio} and m.enviado_at < ${fin}) as salientes_ia
    ${BASE} and cv.correduria_id = ${correduriaId}::uuid
      and exists (select 1 from mensajes m where m.conversacion_id = cv.id and m.direccion is not null and m.enviado_at >= ${inicio} and m.enviado_at < ${fin}
                    and (m.direccion = 'entrante' or m.rol = 'bot'))
    order by cv.ultimo_mensaje_at desc nulls last limit 60`)
  const desde = new Date(ahora.getTime() - DIAS_MAX_SIN_CONTESTAR * 86_400_000)
  const sin = await db.$queryRaw<Fila[]>(Prisma.sql`
    select ${CAMPOS}, 0 as entrantes, 0 as salientes_ia
    ${BASE} and cv.correduria_id = ${correduriaId}::uuid and cv.ultimo_mensaje_at >= ${desde}
    order by cv.ultimo_mensaje_at asc limit 80`)
  let propuestas: PropuestaPendiente[] | null
  try {
    const f = await db.$queryRaw<{ nombre: string | null; tipo: string }[]>(Prisma.sql`
      select nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as nombre, p.tipo
        from whatsapp_propuestas p join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
       where p.correduria_id = ${correduriaId}::uuid and p.estado = 'pendiente' and p.caduca_at > ${ahora}
       order by p.creada_at limit 40`)
    propuestas = f
  } catch (e) {
    if (!(esTablaAusente(e) || esColumnaAusente(e))) throw e
    propuestas = null
  }
  return { ahora, hoy: hoy.map(aVista), sinContestar: sin.map(aVista), propuestas }
}

export type SalidaResumen = { estado: 'apagado' | 'sin_novedad' | 'enviado' | 'ensayo' | 'error_telegram'; texto?: string }

export async function ejecutarResumenDiario(correduriaId: string, op: { ahora?: Date; soloContar?: boolean; env?: Record<string, string | undefined> } = {}): Promise<SalidaResumen> {
  const env = op.env ?? process.env
  if (!resumenActivo(env) || !whatsappActivo(env)) return { estado: 'apagado' }
  const texto = textoResumenDiario(await leerDatosResumen(correduriaId, op.ahora ?? new Date()))
  if (texto === null) return { estado: 'sin_novedad' }
  if (op.soloContar) return { estado: 'ensayo', texto }
  const id = await tgSend(texto, { html: true })
  // `tgSend` devuelve null si Telegram no lo aceptó: se dice, no se da por entregado.
  return id === null ? { estado: 'error_telegram' } : { estado: 'enviado' }
}
