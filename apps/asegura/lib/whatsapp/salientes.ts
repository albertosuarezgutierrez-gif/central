// Salientes previstos (spec 2026-11-04 §4): registrar el `wa.me` que abre plataforma, casar el echo y leer el vinculado
// para el analizador. Las reglas (normalización, casado, ventana) son PURAS en `vinculo.ts`; aquí solo la BD.
//
// 🛡️ Toda sentencia filtra `correduria_id` (BYPASSRLS). Sin el SQL `2026-11-04_whatsapp_respuestas_crm.sql`:
//   · registrar → `sin_migracion` (el endpoint responde 503; plataforma sigue abriendo el wa.me igual);
//   · casar / leer → no hacen nada (`sin_migracion` / null): el procesado y el análisis siguen como antes.

import { aE164, importeEiac, sqlCarteraEnVigor, telefonoParaFicha } from '@central/module-seguros'
import { computeTelefonoLookupHash } from '@central/module-seguros-pii'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import {
  HOLGURA_RELOJ_MS,
  VENTANA_ECHO_MS,
  VENTANA_RESPUESTA_MS,
  casarEcho,
  hashTextoSaliente,
  salienteDeLaRespuesta,
  type EntradaSalientePrevisto,
  type OrigenSaliente,
  type SalienteVinculado,
} from './vinculo'

const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

export function e164DeTelefono(telefono: string): string | null {
  const limpio = telefono.replace(/[\s().-]/g, '')
  // Nacional (ES) o con «+»; un wa_id sin «+» (34600123456) se reintenta con él, como hace `procesar.ts`.
  return aE164(limpio) ?? (/^\d{10,15}$/.test(limpio) ? aE164(`+${limpio}`) : null)
}

/** El mismo índice ciego que `procesar.ts` guarda en `conversaciones.wa_telefono_hash`. */
export function hashTelefonoConversacion(telefono: string): string | null {
  const e164 = e164DeTelefono(telefono)
  return e164 === null ? null : computeTelefonoLookupHash(telefonoParaFicha(e164))
}

export type ResultadoRegistro =
  | { ok: true; id: string }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'sin_clave_pii' | 'sin_migracion'; motivo: string }

export async function registrarSalientePrevisto(correduriaId: string, e: EntradaSalientePrevisto, actor: string): Promise<ResultadoRegistro> {
  const telefonoHash = hashTelefonoConversacion(e.telefono)
  if (telefonoHash === null) {
    // Sin E.164 válido o sin PII_LOOKUP_KEY: no se distingue aquí; los dos impiden casar.
    return e164DeTelefono(e.telefono) === null
      ? { ok: false, estado: 'invalido', motivo: 'telefono no válido' }
      : { ok: false, estado: 'sin_clave_pii', motivo: 'sin PII_LOOKUP_KEY no hay índice ciego' }
  }
  const db = prismaAsegura()
  // Cada ancla, de ESTA correduría (si no, 404: nunca se cuelga un vínculo de otra cartera).
  const [anclas] = await db.$queryRaw<{ cliente: boolean; recibo: boolean; oportunidad: boolean; poliza: boolean }[]>(Prisma.sql`
    select
      (${e.clienteId}::uuid is null or exists (select 1 from clientes where id = ${e.clienteId}::uuid and correduria_id = ${correduriaId}::uuid)) as cliente,
      (${e.reciboId}::uuid is null or exists (select 1 from poliza_recibos where id = ${e.reciboId}::uuid and correduria_id = ${correduriaId}::uuid)) as recibo,
      (${e.oportunidadId}::uuid is null or exists (select 1 from oportunidades where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid)) as oportunidad,
      (${e.polizaId}::uuid is null or exists (select 1 from polizas where id = ${e.polizaId}::uuid and correduria_id = ${correduriaId}::uuid)) as poliza`)
  const fuera = anclas ? Object.entries(anclas).filter(([, ok]) => !ok).map(([k]) => k) : ['todo']
  if (fuera.length > 0) return { ok: false, estado: 'no_encontrado', motivo: `no es de esta correduría: ${fuera.join(', ')}` }
  try {
    const [fila] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into whatsapp_salientes_previstos
        (correduria_id, cliente_id, telefono_hash, origen, recibo_id, oportunidad_id, poliza_id, solicitud_id, texto_hash, abierto_por)
      values (${correduriaId}::uuid, ${e.clienteId}::uuid, ${telefonoHash}, ${e.origen}, ${e.reciboId}::uuid, ${e.oportunidadId}::uuid,
              ${e.polizaId}::uuid, ${e.solicitudId}::uuid, ${hashTextoSaliente(e.texto)}, ${actor.slice(0, 120)})
      returning id::text as id`)
    return { ok: true, id: fila.id }
  } catch (err) {
    if (faltaMigracion(err)) return { ok: false, estado: 'sin_migracion', motivo: 'falta prisma/sql/2026-11-04_whatsapp_respuestas_crm.sql' }
    throw err
  }
}

export type ResultadoCasado = { estado: 'exacto' | 'aproximado' | 'sin_vinculo' | 'sin_migracion' | 'carrera' }

/**
 * Casa un echo YA guardado (`mensajes.id`) con su saliente previsto. Lo llama `procesar.ts` tras guardar un `saliente`.
 * Nunca lanza por la migración ausente; otro error sí (quien llama lo captura: el mensaje ya está guardado).
 */
export async function casarEchoGuardado(correduriaId: string, echo: { mensajeId: string; telefonoHash: string; fecha: Date; texto: string }): Promise<ResultadoCasado> {
  const db = prismaAsegura()
  let filas: { id: string; texto_hash: string | null; abierto_at: Date }[]
  try {
    filas = await db.$queryRaw(Prisma.sql`
      select id::text as id, texto_hash, abierto_at from whatsapp_salientes_previstos
       where correduria_id = ${correduriaId}::uuid and telefono_hash = ${echo.telefonoHash} and mensaje_id is null
         and abierto_at between ${new Date(echo.fecha.getTime() - VENTANA_ECHO_MS)} and ${new Date(echo.fecha.getTime() + HOLGURA_RELOJ_MS)}
       order by abierto_at desc limit 20`)
  } catch (err) {
    if (faltaMigracion(err)) return { estado: 'sin_migracion' }
    throw err
  }
  const c = casarEcho(
    { telefonoHash: echo.telefonoHash, fecha: echo.fecha, textoHash: hashTextoSaliente(echo.texto) },
    filas.map((f) => ({ id: f.id, telefonoHash: echo.telefonoHash, textoHash: f.texto_hash, abiertoAt: f.abierto_at, casado: false })),
  )
  if (!c) return { estado: 'sin_vinculo' }
  try {
    const n = await db.$executeRaw(Prisma.sql`
      update whatsapp_salientes_previstos set mensaje_id = ${echo.mensajeId}::uuid, casado_at = now(), casado_tipo = ${c.tipo}
       where id = ${c.previstoId}::uuid and correduria_id = ${correduriaId}::uuid and mensaje_id is null
         and not exists (select 1 from whatsapp_salientes_previstos x where x.correduria_id = ${correduriaId}::uuid and x.mensaje_id = ${echo.mensajeId}::uuid)`)
    return n > 0 ? { estado: c.tipo } : { estado: 'carrera' }
  } catch (err) {
    // 23505: otro proceso casó ese echo a la vez. No es un fallo.
    if (err && typeof err === 'object' && /23505/.test(String((err as { message?: unknown }).message ?? ''))) return { estado: 'carrera' }
    throw err
  }
}

/** Lo que el analizador sabe del último saliente vinculado: ids para el SERVIDOR y lo mínimo para la IA. */
export type SalienteParaAnalisis = SalienteVinculado & { ramo: string | null; fecha: string | null; importe: number | null }

/**
 * El saliente vinculado más reciente ANTERIOR a la última respuesta del cliente (≤14 días), de esa conversación.
 * `null` = no hay (o no se pudo leer: el analizador trabaja como antes, sin contexto de saliente).
 */
export async function salienteVinculadoDe(correduriaId: string, telefonoHash: string, respuestaAt: Date): Promise<SalienteParaAnalisis | null> {
  const db = prismaAsegura()
  let filas: {
    id: string; origen: string; recibo_id: string | null; oportunidad_id: string | null; poliza_id: string | null; enviado_at: Date
    ramo: string | null; fecha: string | null; importe_txt: string | null; importe_num: number | null
  }[]
  try {
    filas = await db.$queryRaw(Prisma.sql`
      select s.id::text as id, s.origen, s.recibo_id::text as recibo_id, s.oportunidad_id::text as oportunidad_id, s.poliza_id::text as poliza_id,
             m.enviado_at,
             coalesce(pr.tipo::text, o.tipo::text, pp.tipo::text) as ramo,
             coalesce(to_char(r.fecha_efecto_actual, 'YYYY-MM-DD'), to_char(o.fecha_fin_vigencia, 'YYYY-MM-DD')) as fecha,
             r.prima_total as importe_txt, o.prima_bruta::float8 as importe_num
        from whatsapp_salientes_previstos s
        join mensajes m on m.id = s.mensaje_id
        left join poliza_recibos r on r.id = s.recibo_id and r.correduria_id = ${correduriaId}::uuid
        left join polizas pr on pr.id = r.poliza_id and pr.correduria_id = ${correduriaId}::uuid
        left join oportunidades o on o.id = s.oportunidad_id and o.correduria_id = ${correduriaId}::uuid
        left join polizas pp on pp.id = s.poliza_id and pp.correduria_id = ${correduriaId}::uuid
       where s.correduria_id = ${correduriaId}::uuid and s.telefono_hash = ${telefonoHash} and s.mensaje_id is not null
         and m.enviado_at <= ${respuestaAt} and m.enviado_at >= ${new Date(respuestaAt.getTime() - VENTANA_RESPUESTA_MS)}
       order by m.enviado_at desc limit 5`)
  } catch (err) {
    if (faltaMigracion(err)) return null
    throw err
  }
  const v = salienteDeLaRespuesta(
    respuestaAt,
    filas.map((f) => ({ ...f, enviadoAt: f.enviado_at })),
  )
  if (!v) return null
  return {
    id: v.id,
    origen: v.origen as OrigenSaliente,
    reciboId: v.recibo_id,
    oportunidadId: v.oportunidad_id,
    polizaId: v.poliza_id,
    enviadoAt: v.enviado_at,
    ramo: v.ramo,
    fecha: v.fecha,
    importe: v.importe_txt !== null ? importeEiac(v.importe_txt) : v.importe_num,
  }
}

export type ReciboParaAnalisis = { id: string; ramo: string; situacion: string; efecto: string | null; importe: number | null }

/**
 * Recibos devueltos/pendientes de las pólizas EN VIGOR de la ficha (D4: un lead o ex-cliente no tiene ninguno, y por
 * tanto ninguna propuesta de cobro). `null` = no se pudo leer («no se sabe», nunca «no hay»).
 */
export async function recibosPendientesDe(correduriaId: string, clienteId: string): Promise<ReciboParaAnalisis[] | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string; ramo: string; situacion: string; efecto: string | null; importe: string | null }[]>(Prisma.sql`
      select r.id::text as id, p.tipo::text as ramo, r.situacion::text as situacion,
             to_char(coalesce(r.fecha_efecto_actual, r.fecha_efecto_inicial), 'YYYY-MM-DD') as efecto, r.prima_total as importe
        from poliza_recibos r join polizas p on p.id = r.poliza_id
       where r.correduria_id = ${correduriaId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
         and r.situacion::text in ('devuelto', 'pendiente') and ${Prisma.raw(sqlCarteraEnVigor('p'))}
       order by coalesce(r.fecha_efecto_actual, r.fecha_efecto_inicial) desc nulls last
       limit 10`)
    return filas.map((f) => ({ id: f.id, ramo: f.ramo, situacion: f.situacion, efecto: f.efecto, importe: importeEiac(f.importe) }))
  } catch (err) {
    console.error('[whatsapp-ia] recibos no leídos:', err instanceof Error ? err.name : 'error')
    return null
  }
}
