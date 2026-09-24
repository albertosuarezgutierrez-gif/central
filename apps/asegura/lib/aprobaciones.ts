// Cola única de aprobaciones (Fase 2 de ASegura OS, pieza 2-c).
//
// - `proponerReciboDevuelto()` la llama el detector de cartera, DENTRO de su transacción, cuando un
//   recibo pasa a `devuelto`: redacta el aviso al cliente y lo deja pendiente de OK.
// - `aprobacionesPendientes()` es lo que pinta «Hoy · Esperan tu OK» en plataforma.
// - `decidirAprobacion()` aplica el OK o el no. Con OK, reclama la fila (`enviando`) ANTES de mandar:
//   un doble clic no manda dos correos. La dirección se lee de la ficha en ese momento.
//
// Nada de esto manda un correo sin una decisión humana: la política (`POLITICA`) lo exige, y la
// única llamada que envía está detrás de `decision: 'aprobar'`.
//
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import {
  MEDIADOR, POLITICA, borradorAnulacionCompania, borradorCartaMediadorCompania, borradorReciboDevuelto, buzonSugerido, importeEiac, remitenteCorreo,
  type BuzonCompania, type Decision,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { campoIlegible, descifrarCampo } from './cartera-edicion'
import { rechazoDeRemitente } from './correo-invitacion-portal.ts'
import { estadoEmailDeFicha } from './email-ficha'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ORIGEN_RECIBO_DEVUELTO = 'recibo_devuelto'

/** `true` si ha dejado una propuesta nueva. Idempotente por `clave` (una por recibo y vencimiento). */
export async function proponerReciboDevuelto(tx: Tx, correduriaId: string, reciboId: string, eventoId: string | null): Promise<boolean> {
  if (POLITICA.enviar_correo_cliente === 'prohibido') return false
  const [r] = await tx.$queryRaw<{ clienteId: string; polizaId: string; ramo: string | null; compania: string | null; numeroPoliza: string | null; importe: string | null; vencimiento: string | null }[]>`
    select p.cliente_id::text as "clienteId", p.id::text as "polizaId", p.tipo::text as ramo, p.aseguradora as compania,
           p.numero_poliza as "numeroPoliza", r.prima_total as importe,
           to_char(r.fecha_vencimiento at time zone 'Europe/Madrid', 'YYYY-MM-DD') as vencimiento
    from poliza_recibos r join polizas p on p.id = r.poliza_id
    where r.id = ${reciboId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null`
  if (!r) return false
  const b = borradorReciboDevuelto({
    ramo: r.ramo, compania: r.compania, numeroPoliza: r.numeroPoliza,
    importe: importeEiac(r.importe), vencimiento: r.vencimiento, hoy: new Date(),
  })
  if (!b) return false
  const ins = await tx.$queryRaw<{ id: string }[]>`
    insert into aprobacion (correduria_id, accion, origen, clave, cliente_id, poliza_id, evento_id, propuesta, urgente, caduca_at)
    values (${correduriaId}::uuid, 'enviar_correo_cliente', ${ORIGEN_RECIBO_DEVUELTO},
            ${`${ORIGEN_RECIBO_DEVUELTO}:${reciboId}:${r.vencimiento ?? 'sin_fecha'}`},
            ${r.clienteId}::uuid, ${r.polizaId}::uuid, ${eventoId}::uuid,
            ${JSON.stringify({ asunto: b.asunto, texto: b.texto })}::jsonb, ${b.urgente}, ${b.caduca})
    on conflict (clave) do nothing
    returning id::text as id`
  return ins.length > 0
}

export const ORIGEN_ANULACION = 'anulacion'

/**
 * Propone comunicar a la compañía las anulaciones FIRMADAS por el cliente en el portal (pieza 2-d-3)
 * sin propuesta viva. Solo las de firma electrónica (`firma_id` + `carta_texto`): una firma en papel
 * la manda el corredor con el escaneado. Una propuesta `fallida` o `caducada` SE REPROPONE (si no, la
 * anulación se quedaría firmada para siempre sin que nadie la viera); una `rechazada` no: Alberto dijo
 * que no, y la manda él. Corre antes de listar, así que no depende de que la firma la dispare.
 */
export async function proponerAnulacionesFirmadas(correduriaId: string): Promise<number> {
  if (POLITICA.enviar_correo_compania === 'prohibido') return 0
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ id: string; clienteId: string; polizaId: string; tomador: string; compania: string | null; numeroPoliza: string | null; tipo: 'no_renovacion' | 'inmediata' | 'sustitucion'; fechaEfecto: string; firmadaEl: string; docHash: string }[]>`
    select a.id::text as id, a.cliente_id::text as "clienteId", a.poliza_id::text as "polizaId",
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           coalesce(cd.nombre_comun, p.aseguradora) as compania, p.numero_poliza as "numeroPoliza", a.tipo,
           to_char(a.fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto",
           to_char(a.firmada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "firmadaEl", f.doc_hash as "docHash"
    from anulacion a
      join polizas p on p.id = a.poliza_id
      join clientes c on c.id = a.cliente_id
      join firma f on f.id = a.firma_id
      left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'firmada' and a.carta_texto is not null
      -- Firmada junto a un presupuesto (cambio de compañía): no sale hasta que la nueva conste emitida.
      and (a.presupuesto_id is null or exists (select 1 from presupuesto pr where pr.id = a.presupuesto_id and pr.emitido_at is not null))
      and not exists (select 1 from aprobacion x where x.anulacion_id = a.id
                      and x.estado in ('pendiente', 'enviando', 'ejecutada', 'rechazada'))`
  let n = 0
  for (const f of filas) {
    if (!f.compania || !f.numeroPoliza) {
      // La ficha de la póliza dice «falta comunicarla»; aquí no hay con qué redactar el correo.
      console.warn('[aprobaciones] anulación firmada sin compañía o número de póliza, no se propone:', f.id)
      continue
    }
    const b = borradorAnulacionCompania({
      tomador: f.tomador, compania: f.compania, numeroPoliza: f.numeroPoliza, tipo: f.tipo, fechaEfecto: f.fechaEfecto,
      firmadaEl: f.firmadaEl, docHash: f.docHash, mediador: MEDIADOR.marca, hoy: new Date(),
    })
    const ins = await db.$queryRaw<{ id: string }[]>`
      insert into aprobacion (correduria_id, accion, origen, clave, cliente_id, poliza_id, anulacion_id, propuesta, urgente, caduca_at)
      values (${correduriaId}::uuid, 'enviar_correo_compania', ${ORIGEN_ANULACION}, ${ORIGEN_ANULACION} || ':' || ${f.id} || ':' || (select count(*) + 1 from aprobacion x where x.anulacion_id = ${f.id}::uuid)::text,
              ${f.clienteId}::uuid, ${f.polizaId}::uuid, ${f.id}::uuid,
              ${JSON.stringify({ asunto: b.asunto, texto: b.texto })}::jsonb, ${b.urgente}, ${b.caduca})
      on conflict do nothing
      returning id::text as id`
    n += ins.length
  }
  return n
}

export const ORIGEN_CARTA_MEDIADOR = 'carta_mediador'

/**
 * Propone mandar a la compañía las cartas de nombramiento de mediador FIRMADAS en el portal sin
 * propuesta viva (mismas reglas que las anulaciones: fallida o caducada se repropone; rechazada no,
 * la manda Alberto por fuera y la marca «enviada» en la ficha).
 */
export async function proponerCartasFirmadas(correduriaId: string): Promise<number> {
  if (POLITICA.enviar_correo_compania === 'prohibido') return 0
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ id: string; clienteId: string; polizaId: string; tomador: string; compania: string | null; numeroPoliza: string | null; firmadaEl: string; docHash: string }[]>`
    select cm.id::text as id, cm.cliente_id::text as "clienteId", cm.poliza_id::text as "polizaId",
           trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))) as tomador,
           coalesce(cd.nombre_comun, p.aseguradora) as compania, p.numero_poliza as "numeroPoliza",
           to_char(cm.firmada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "firmadaEl", f.doc_hash as "docHash"
    from carta_mediador cm
      join polizas p on p.id = cm.poliza_id
      join clientes c on c.id = cm.cliente_id
      join firma f on f.id = cm.firma_id
      left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where cm.correduria_id = ${correduriaId}::uuid and cm.estado = 'firmada' and cm.carta_texto is not null
      and not exists (select 1 from aprobacion x where x.carta_mediador_id = cm.id
                      and x.estado in ('pendiente', 'enviando', 'ejecutada', 'rechazada'))`
  let n = 0
  for (const f of filas) {
    if (!f.compania || !f.numeroPoliza) {
      console.warn('[aprobaciones] carta firmada sin compañía o número de póliza, no se propone:', f.id)
      continue
    }
    const b = borradorCartaMediadorCompania({
      tomador: f.tomador, compania: f.compania, numeroPoliza: f.numeroPoliza, firmadaEl: f.firmadaEl,
      docHash: f.docHash, mediador: MEDIADOR.marca, hoy: new Date(),
    })
    const ins = await db.$queryRaw<{ id: string }[]>`
      insert into aprobacion (correduria_id, accion, origen, clave, cliente_id, poliza_id, carta_mediador_id, propuesta, urgente, caduca_at)
      values (${correduriaId}::uuid, 'enviar_correo_compania', ${ORIGEN_CARTA_MEDIADOR}, ${ORIGEN_CARTA_MEDIADOR} || ':' || ${f.id} || ':' || (select count(*) + 1 from aprobacion x where x.carta_mediador_id = ${f.id}::uuid)::text,
              ${f.clienteId}::uuid, ${f.polizaId}::uuid, ${f.id}::uuid,
              ${JSON.stringify({ asunto: b.asunto, texto: b.texto })}::jsonb, ${b.urgente}, ${b.caduca})
      on conflict do nothing
      returning id::text as id`
    n += ins.length
  }
  return n
}

export type BuzonPropuesto = { id: string; nombre: string; cargo: string | null; area: string | null; email: string }

export type AprobacionPendiente = {
  id: string
  accion: 'enviar_correo_cliente' | 'enviar_correo_compania'
  /** A quién va: el nombre de la compañía cuando el correo es para ella; `null` = al cliente. */
  destinatario: string | null
  /** Buzones de esa compañía entre los que elige Alberto, y el preseleccionado (`null` = elige él). */
  buzones: BuzonPropuesto[]
  buzonSugerido: string | null
  origen: string
  clienteId: string
  cliente: string | null
  asunto: string
  texto: string
  urgente: boolean
  creada: string
  caduca: string
}

/**
 * Retira lo que ya no es verdad: lo caducado, y el aviso de un recibo que ya no consta devuelto
 * (se cobró o la compañía lo rectificó). Escribirle «no consta pagado» a quien ya ha pagado es
 * justo lo que el sistema sabe y no puede callarse. Corre antes de listar Y antes de decidir.
 */
export async function retirarObsoletas(correduriaId: string): Promise<void> {
  const db = prismaAsegura()
  await db.$executeRaw`
    update aprobacion set estado = 'caducada', decidida_at = now(), decidida_por = 'sistema:caducidad'
    where correduria_id = ${correduriaId}::uuid and estado = 'pendiente' and caduca_at < now()`
  await db.$executeRaw`
    update aprobacion a set estado = 'caducada', decidida_at = now(), decidida_por = 'sistema:recibo_resuelto',
           resultado = 'El recibo ya no consta devuelto: no se envía.'
    from poliza_recibos r
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente' and a.origen = ${ORIGEN_RECIBO_DEVUELTO}
      and r.id::text = split_part(a.clave, ':', 2) and r.situacion::text is distinct from 'devuelto'`
  // Una anulación que ya no está firmada (desistida, o comunicada a mano) no se manda otra vez.
  await db.$executeRaw`
    update aprobacion a set estado = 'caducada', decidida_at = now(), decidida_por = 'sistema:anulacion_cambiada',
           resultado = 'La anulación ya no está pendiente de comunicar: no se envía.'
    from anulacion n
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente' and a.accion = 'enviar_correo_compania'
      and n.id = a.anulacion_id and n.estado <> 'firmada'`
  // Igual con la carta: enviada a mano por fuera o desistida, no se manda otra vez.
  await db.$executeRaw`
    update aprobacion a set estado = 'caducada', decidida_at = now(), decidida_por = 'sistema:carta_cambiada',
           resultado = 'La carta ya no está pendiente de mandar: no se envía.'
    from carta_mediador cm
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente' and a.accion = 'enviar_correo_compania'
      and cm.id = a.carta_mediador_id and cm.estado <> 'firmada'`
}

/** Pendientes, urgentes primero. */
export async function aprobacionesPendientes(correduriaId: string): Promise<AprobacionPendiente[]> {
  const db = prismaAsegura()
  await retirarObsoletas(correduriaId)
  try {
    await proponerAnulacionesFirmadas(correduriaId)
  } catch (e) {
    // Sin propuesta nueva la lista sigue siendo verdad; la anulación firmada sale igual en su ficha.
    console.error('[aprobaciones] no se pudieron proponer las anulaciones firmadas:', e instanceof Error ? e.message : e)
  }
  try {
    await proponerCartasFirmadas(correduriaId)
  } catch (e) {
    console.error('[aprobaciones] no se pudieron proponer las cartas de nombramiento firmadas:', e instanceof Error ? e.message : e)
  }
  const filas = await db.$queryRaw<{ id: string; accion: string; destinatario: string | null; dgs: string | null; origen: string; clienteId: string; nombre: string | null; apellidos: string | null; propuesta: { asunto?: unknown; texto?: unknown }; urgente: boolean; creada: Date; caduca: Date }[]>`
    select a.id::text as id, a.accion,
           case when a.accion = 'enviar_correo_compania' then coalesce(cd.nombre_comun, p.aseguradora, 'la compañía') end as destinatario,
           case when a.accion = 'enviar_correo_compania' then p.codigo_entidad_dgs end as dgs,
           a.origen, a.cliente_id::text as "clienteId", c.nombre, c.apellidos, a.propuesta, a.urgente,
           a.created_at as creada, a.caduca_at as caduca
    from aprobacion a left join clientes c on c.id = a.cliente_id
      left join polizas p on p.id = a.poliza_id
      left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente'
    order by a.urgente desc, a.created_at
    limit 100`
  const dgs = [...new Set(filas.map((f) => f.dgs).filter((x): x is string => !!x))]
  const contactos = dgs.length === 0 ? [] : await db.$queryRaw<{ id: string; dgs: string; nombre: string; cargo: string | null; area: string | null; email: string; activo: boolean; orden: number; recibe: boolean; recibeNombramientos: boolean }[]>`
    select id::text as id, compania_codigo_dgs as dgs, nombre, cargo, area::text as area, email, activo, orden,
           recibe_anulaciones as recibe, recibe_nombramientos as "recibeNombramientos"
    from compania_contactos
    where compania_codigo_dgs in (${Prisma.join(dgs)}) and activo and email is not null
    order by orden`
  return filas.map((f) => {
    const deEsta = f.dgs ? contactos.filter((c) => c.dgs === f.dgs) : []
    return {
    id: f.id,
    accion: f.accion === 'enviar_correo_compania' ? 'enviar_correo_compania' as const : 'enviar_correo_cliente' as const,
    destinatario: f.destinatario,
    buzones: deEsta.map((c) => ({ id: c.id, nombre: c.nombre, cargo: c.cargo, area: c.area, email: c.email })),
    // Cada tipo de envío recuerda su propio buzón: el de bajas no tiene por qué ser el de cambio de mediador.
    buzonSugerido: buzonSugerido(deEsta.map((c) => ({ id: c.id, activo: c.activo, email: c.email, orden: c.orden, recibeAnulaciones: f.origen === ORIGEN_CARTA_MEDIADOR ? c.recibeNombramientos : c.recibe }))),
    origen: f.origen,
    clienteId: f.clienteId,
    cliente: [f.nombre, f.apellidos].filter(Boolean).join(' ') || null,
    asunto: typeof f.propuesta?.asunto === 'string' ? f.propuesta.asunto : '',
    texto: typeof f.propuesta?.texto === 'string' ? f.propuesta.texto : '',
    urgente: f.urgente,
    creada: f.creada.toISOString(),
    caduca: f.caduca.toISOString(),
  }
  })
}

export type ResultadoDecision =
  | { estado: 'ejecutada' | 'rechazada' }
  | { estado: 'no_encontrada' }
  /** Ya no está pendiente (la decidió otro clic, caducó o se está enviando). */
  | { estado: 'ya_decidida' }
  /** No hay a quién escribir (sin correo, baja de correo, ficha fusionada): sigue pendiente. */
  | { estado: 'sin_email'; motivo: string }
  /** No hay proveedor o remitente de correo: sigue pendiente, reintentarlo no lo arregla. */
  | { estado: 'sin_correo_configurado'; motivo: string }
  /** El proveedor rechazó el envío: queda `fallida`. */
  | { estado: 'fallida'; motivo: string }
  /** Se cortó esperando al proveedor: pudo salir. Queda `enviando` y sale en «a medias». */
  | { estado: 'incierto'; motivo: string }
  /** Un envío a medias cerrado a mano tras mirarlo en el proveedor. */
  | { estado: 'cerrada' }

/** Cortes de red o de espera: el proveedor pudo haber aceptado el mensaje antes de cortarse. */
export function falloIncierto(mensaje: string): boolean {
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|ESOCKET|socket hang up|aborted/i.test(mensaje)
}

const MOTIVO_SIN_EMAIL: Record<'no_encontrado' | 'baja_de_correo' | 'sin_email', string> = {
  sin_email: 'la ficha no tiene correo; añádelo o descarta el aviso',
  baja_de_correo: 'el cliente se dio de baja del correo; descarta el aviso y llámale',
  no_encontrado: 'la ficha ya no existe (¿fusionada?); descarta el aviso',
}

async function enviarCorreo(destino: string, asunto: string, texto: string, adjunto?: { nombre: string; texto: string }): Promise<{ ok: true } | { ok: false; configuracion: boolean; incierto?: boolean; motivo: string }> {
  // Carga perezosa, como en el resto de correos de la app: `@central/core-email` no resuelve con `node --test`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return { ok: false, configuracion: true, motivo: 'No hay proveedor de correo configurado en central-asegura.' }
  if (!process.env.ASEGURA_MAIL_FROM?.trim()) return { ok: false, configuracion: true, motivo: 'Falta ASEGURA_MAIL_FROM en central-asegura.' }
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM), to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto,
      ...(adjunto ? { attachments: [{ filename: adjunto.nombre, content: adjunto.texto, contentType: 'text/plain; charset=utf-8' }] } : {}),
    })
    return { ok: true }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error('[aprobaciones] el proveedor rechazó el correo:', m)
    if (falloIncierto(m)) return { ok: false, configuracion: false, incierto: true, motivo: 'se cortó esperando al proveedor de correo; pudo salir' }
    return { ok: false, configuracion: rechazoDeRemitente(m), motivo: rechazoDeRemitente(m) ? 'El dominio del remitente no está verificado en Resend.' : 'El proveedor de correo no aceptó el mensaje.' }
  }
}

/**
 * A quién y con qué adjunto va la anulación firmada: el buzón de la compañía que Alberto ELIGE en la
 * tarjeta (tiene que ser un contacto activo de la compañía de ESA póliza). No se deduce por área.
 */
async function destinoAnulacion(correduriaId: string, anulacionId: string | null, contactoId: string | undefined):
  Promise<{ email: string; contactoId: string; compania: string | null; adjunto: { nombre: string; texto: string } } | { estado: 'sin_email'; motivo: string } | { estado: 'ya_decidida' }> {
  if (!anulacionId) return { estado: 'sin_email', motivo: 'la propuesta no apunta a ninguna anulación' }
  const db = prismaAsegura()
  const [n] = await db.$queryRaw<{ estado: string; carta: string | null; numero: string | null; dgs: string | null; compania: string | null }[]>`
    select a.estado, a.carta_texto as carta, p.numero_poliza as numero, p.codigo_entidad_dgs as dgs,
           coalesce(cd.nombre_comun, p.aseguradora) as compania
    from anulacion a join polizas p on p.id = a.poliza_id left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where a.id = ${anulacionId}::uuid and a.correduria_id = ${correduriaId}::uuid`
  if (!n || n.estado !== 'firmada') return { estado: 'ya_decidida' }
  if (!n.carta) return { estado: 'sin_email', motivo: 'la anulación no tiene la carta firmada guardada; mándala a mano con el escaneado' }
  if (!n.dgs) return { estado: 'sin_email', motivo: 'a la póliza le falta el código DGS de la compañía; mándala a mano' }
  if (!contactoId) return { estado: 'sin_email', motivo: `elige a qué buzón de ${n.compania ?? 'la compañía'} va` }
  const [c] = await db.$queryRaw<{ email: string | null }[]>`
    select email from compania_contactos
    where id = ${contactoId}::uuid and compania_codigo_dgs = ${n.dgs} and activo`
  if (!c?.email || !c.email.includes('@')) return { estado: 'sin_email', motivo: `ese buzón no es un contacto activo con correo de ${n.compania ?? 'la compañía'}` }
  const num = (n.numero ?? 'poliza').replace(/[^\w.-]+/g, '_')
  return { email: c.email.trim(), contactoId, compania: n.compania, adjunto: { nombre: `solicitud-anulacion-${num}.txt`, texto: n.carta } }
}

/** Igual que `destinoAnulacion`, para la carta de nombramiento firmada. El adjunto es la carta GUARDADA (cifrada en BD). */
async function destinoCarta(correduriaId: string, cartaId: string, contactoId: string | undefined):
  Promise<{ email: string; contactoId: string; compania: string | null; adjunto: { nombre: string; texto: string } } | { estado: 'sin_email'; motivo: string } | { estado: 'ya_decidida' }> {
  const db = prismaAsegura()
  const [n] = await db.$queryRaw<{ estado: string; carta: string | null; numero: string | null; dgs: string | null; compania: string | null }[]>`
    select cm.estado, cm.carta_texto as carta, p.numero_poliza as numero, p.codigo_entidad_dgs as dgs,
           coalesce(cd.nombre_comun, p.aseguradora) as compania
    from carta_mediador cm join polizas p on p.id = cm.poliza_id left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where cm.id = ${cartaId}::uuid and cm.correduria_id = ${correduriaId}::uuid`
  if (!n || n.estado !== 'firmada') return { estado: 'ya_decidida' }
  if (campoIlegible(n.carta)) return { estado: 'sin_email', motivo: 'la carta firmada no se puede descifrar (PII_ENCRYPTION_KEY en central-asegura)' }
  const carta = descifrarCampo(n.carta)
  if (!carta) return { estado: 'sin_email', motivo: 'la carta no tiene el texto firmado guardado; mándala a mano' }
  if (!n.dgs) return { estado: 'sin_email', motivo: 'a la póliza le falta el código DGS de la compañía; mándala a mano' }
  if (!contactoId) return { estado: 'sin_email', motivo: `elige a qué buzón de ${n.compania ?? 'la compañía'} va` }
  const [c] = await db.$queryRaw<{ email: string | null }[]>`
    select email from compania_contactos
    where id = ${contactoId}::uuid and compania_codigo_dgs = ${n.dgs} and activo`
  if (!c?.email || !c.email.includes('@')) return { estado: 'sin_email', motivo: `ese buzón no es un contacto activo con correo de ${n.compania ?? 'la compañía'}` }
  const num = (n.numero ?? 'poliza').replace(/[^\w.-]+/g, '_')
  return { email: c.email.trim(), contactoId, compania: n.compania, adjunto: { nombre: `nombramiento-mediador-${num}.txt`, texto: carta } }
}

/** La carta pasa a «enviada»: el correo salió. Un fallo aquí no puede invitar a repetir el envío. */
async function marcarCartaEnviada(correduriaId: string, cartaId: string): Promise<boolean> {
  try {
    const n = await prismaAsegura().$executeRaw`
      update carta_mediador set estado = 'enviada', enviada_at = now(), updated_at = now()
      where id = ${cartaId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'firmada'`
    if (n > 0) anotarCambio({ entidad: 'carta_mediador', id: cartaId, campo: 'estado', antes: 'firmada', despues: 'enviada' })
    return true
  } catch (e) {
    console.error('[aprobaciones] correo enviado pero la carta no pasó a enviada:', e instanceof Error ? e.message : e)
    return false
  }
}

/** La anulación pasa a «comunicada»: el correo salió (o Alberto ha comprobado que salió). */
async function marcarComunicada(correduriaId: string, anulacionId: string): Promise<boolean> {
  // El correo YA salió cuando se llama: un fallo aquí no puede convertirse en un 500 que invite a
  // repetir el envío. Se registra y la nota del historial lo dice, para marcarla a mano en la póliza.
  try {
    const n = await prismaAsegura().$executeRaw`
      update anulacion set estado = 'comunicada', comunicada_at = now(), updated_at = now()
      where id = ${anulacionId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'firmada'`
    if (n > 0) anotarCambio({ entidad: 'anulacion', id: anulacionId, campo: 'estado', antes: 'firmada', despues: 'comunicada' })
    return true
  } catch (e) {
    console.error('[aprobaciones] correo enviado pero la anulación no pasó a comunicada:', e instanceof Error ? e.message : e)
    return false
  }
}

export async function decidirAprobacion(correduriaId: string, id: string, d: Decision, actor: string): Promise<ResultadoDecision> {
  if (!UUID.test(id)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const quien = actor.slice(0, 100)

  if (d.decision === 'cerrar_incierto') {
    const final = d.salio ? 'ejecutada' : 'fallida'
    const n = await db.$executeRaw`
      update aprobacion set estado = ${final}, resultado = ${`Comprobado a mano por ${quien}: ${d.salio ? 'salió' : 'no salió'}.`}
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'enviando' and decidida_at < now() - interval '10 minutes'`
    if (n === 0) return { estado: 'ya_decidida' }
    anotarCambio({ entidad: 'aprobacion', id, campo: 'estado', antes: 'enviando', despues: final })
    if (d.salio) {
      const [x] = await db.$queryRaw<{ anulacionId: string | null; cartaId: string | null; clienteId: string; polizaId: string | null }[]>`
        select anulacion_id::text as "anulacionId", carta_mediador_id::text as "cartaId", cliente_id::text as "clienteId", poliza_id::text as "polizaId"
        from aprobacion where id = ${id}::uuid and accion = 'enviar_correo_compania'`
      if (x?.cartaId) {
        const ok = await marcarCartaEnviada(correduriaId, x.cartaId)
        await anotarHistorial(correduriaId, x.clienteId, x.polizaId,
          `Carta de nombramiento enviada a la compañía: el envío se quedó a medias y ${quien} comprobó que salió.${ok ? '' : ' ⚠️ No se pudo marcar «enviada»: márcala a mano en la póliza.'}`)
      }
      if (x?.anulacionId) {
        const ok = await marcarComunicada(correduriaId, x.anulacionId)
        await anotarHistorial(correduriaId, x.clienteId, x.polizaId,
          `Anulación comunicada a la compañía: el envío se quedó a medias y ${quien} comprobó que salió.${ok ? '' : ' ⚠️ No se pudo marcar «comunicada»: márcala a mano en la póliza.'}`)
      }
    }
    return { estado: 'cerrada' }
  }

  await retirarObsoletas(correduriaId)
  const [a] = await db.$queryRaw<{ estado: string; clienteId: string; caducada: boolean; accion: string; anulacionId: string | null; cartaId: string | null; polizaId: string | null }[]>`
    select estado, cliente_id::text as "clienteId", caduca_at < now() as caducada, accion,
           anulacion_id::text as "anulacionId", carta_mediador_id::text as "cartaId", poliza_id::text as "polizaId"
    from aprobacion where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!a) return { estado: 'no_encontrada' }
  if (a.estado !== 'pendiente' || a.caducada) return { estado: 'ya_decidida' }

  if (d.decision === 'rechazar') {
    const n = await db.$executeRaw`
      update aprobacion set estado = 'rechazada', decidida_at = now(), decidida_por = ${quien}
      where id = ${id}::uuid and estado = 'pendiente'`
    if (n === 0) return { estado: 'ya_decidida' }
    anotarCambio({ entidad: 'aprobacion', id, campo: 'estado', antes: 'pendiente', despues: 'rechazada' })
    return { estado: 'rechazada' }
  }

  // Antes de reclamar: sin destinatario no se toca la fila (sigue pendiente para cuando haya correo).
  const paraCompania = a.accion === 'enviar_correo_compania'
  let destino: string
  let adjunto: { nombre: string; texto: string } | undefined
  let compania: string | null = null
  let contactoElegido: string | null = null
  if (paraCompania) {
    const r = a.cartaId ? await destinoCarta(correduriaId, a.cartaId, d.contactoId) : await destinoAnulacion(correduriaId, a.anulacionId, d.contactoId)
    if ('estado' in r) return r
    destino = r.email
    adjunto = r.adjunto
    compania = r.compania
    contactoElegido = r.contactoId
  } else {
    const ficha = await estadoEmailDeFicha(correduriaId, a.clienteId)
    if (ficha.estado === 'ilegible') return { estado: 'sin_correo_configurado', motivo: 'el correo de la ficha no se puede descifrar (PII_ENCRYPTION_KEY en central-asegura)' }
    if (ficha.estado !== 'ok') return { estado: 'sin_email', motivo: MOTIVO_SIN_EMAIL[ficha.estado] }
    destino = ficha.email
  }

  // Reclamo atómico: solo una petición pasa de pendiente a enviando.
  const reclamada = await db.$executeRaw`
    update aprobacion set estado = 'enviando', decidida_at = now(), decidida_por = ${quien},
           propuesta = ${JSON.stringify({ asunto: d.asunto, texto: d.texto })}::jsonb
    where id = ${id}::uuid and estado = 'pendiente' and caduca_at >= now()
      and (accion <> 'enviar_correo_compania'
           or exists (select 1 from anulacion n where n.id = aprobacion.anulacion_id and n.estado = 'firmada')
           or exists (select 1 from carta_mediador cm where cm.id = aprobacion.carta_mediador_id and cm.estado = 'firmada'))`
  if (reclamada === 0) return { estado: 'ya_decidida' }

  const envio = await enviarCorreo(destino, d.asunto, d.texto, adjunto)
  if (!envio.ok && envio.configuracion) {
    // No ha salido nada y reintentar no lo arregla: vuelve a pendiente para cuando esté configurado.
    await db.$executeRaw`update aprobacion set estado = 'pendiente', decidida_at = null, decidida_por = null where id = ${id}::uuid and estado = 'enviando'`
    return { estado: 'sin_correo_configurado', motivo: envio.motivo }
  }
  if (!envio.ok && envio.incierto) {
    // Pudo salir: ni «ejecutada» ni «fallida». Se queda en `enviando` y pasa a «a medias».
    await db.$executeRaw`update aprobacion set resultado = ${envio.motivo} where id = ${id}::uuid and estado = 'enviando'`
    return { estado: 'incierto', motivo: envio.motivo }
  }
  const final = envio.ok ? 'ejecutada' : 'fallida'
  await db.$executeRaw`
    update aprobacion set estado = ${final}, resultado = ${envio.ok ? 'enviado' : envio.motivo}
    where id = ${id}::uuid and estado = 'enviando'`
  anotarCambio({ entidad: 'aprobacion', id, campo: 'estado', antes: 'pendiente', despues: final })
  let comunicadaOk = true
  if (envio.ok && paraCompania && a.cartaId) {
    // La carta pasa a «enviada» solo cuando el correo SALIÓ, y ese buzón queda recordado para las cartas.
    comunicadaOk = await marcarCartaEnviada(correduriaId, a.cartaId)
    if (contactoElegido) {
      try {
        await db.$executeRaw`
          update compania_contactos set recibe_nombramientos = (id = ${contactoElegido}::uuid)
          where compania_codigo_dgs = (select compania_codigo_dgs from compania_contactos where id = ${contactoElegido}::uuid)`
      } catch (e) {
        console.error('[aprobaciones] buzón de nombramientos no recordado:', e instanceof Error ? e.message : e)
      }
    }
  }
  if (envio.ok && paraCompania && a.anulacionId) {
    // La anulación pasa a «comunicada» solo cuando el correo SALIÓ; con «a medias» se queda firmada.
    comunicadaOk = await marcarComunicada(correduriaId, a.anulacionId)
    // Y ese buzón queda recordado: la próxima anulación de esta compañía lo trae preseleccionado.
    if (contactoElegido) {
      try {
        await db.$executeRaw`
          update compania_contactos set recibe_anulaciones = (id = ${contactoElegido}::uuid)
          where compania_codigo_dgs = (select compania_codigo_dgs from compania_contactos where id = ${contactoElegido}::uuid)`
      } catch (e) {
        console.error('[aprobaciones] buzón de anulaciones no recordado:', e instanceof Error ? e.message : e)
      }
    }
  }
  if (envio.ok) {
    const nota = paraCompania && a.cartaId
      ? `Carta de nombramiento de mediador enviada a ${compania ?? 'la compañía'} (${destino}) con OK de ${quien}, con la carta firmada adjunta.${comunicadaOk ? '' : ' ⚠️ No se pudo marcar «enviada»: márcala a mano en la póliza (el correo YA salió, no lo repitas).'}`
      : paraCompania
      ? `Anulación comunicada a ${compania ?? 'la compañía'} (${destino}) con OK de ${quien}, con la carta firmada adjunta.${comunicadaOk ? '' : ' ⚠️ No se pudo marcar «comunicada»: márcala a mano en la póliza (el correo YA salió, no lo repitas).'}`
      : `Correo enviado con OK de ${quien}: «${d.asunto}».`
    await anotarHistorial(correduriaId, a.clienteId, a.polizaId, nota)
    return { estado: 'ejecutada' }
  }
  return { estado: 'fallida', motivo: envio.motivo }
}

async function anotarHistorial(correduriaId: string, clienteId: string, polizaId: string | null, nota: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('contacto' as tipo_historial_interno), ${nota})`)
  } catch (e) {
    console.error('[aprobaciones] historial no anotado:', e instanceof Error ? e.message : e)
  }
}

/**
 * Envíos que se reclamaron y no llegaron a cerrarse (el proceso murió a mitad): NO se sabe si el
 * correo salió, y por eso no se reintentan solos. Se cuentan para que la pantalla lo diga.
 */
export type EnvioIncierto = { id: string; clienteId: string; cliente: string | null; asunto: string; desde: string }

export async function enviosInciertos(correduriaId: string): Promise<EnvioIncierto[]> {
  const filas = await prismaAsegura().$queryRaw<{ id: string; clienteId: string; nombre: string | null; apellidos: string | null; propuesta: { asunto?: unknown }; desde: Date }[]>`
    select a.id::text as id, a.cliente_id::text as "clienteId", c.nombre, c.apellidos, a.propuesta, a.decidida_at as desde
    from aprobacion a left join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'enviando' and a.decidida_at < now() - interval '10 minutes'
    order by a.decidida_at
    limit 50`
  return filas.map((f) => ({
    id: f.id,
    clienteId: f.clienteId,
    cliente: [f.nombre, f.apellidos].filter(Boolean).join(' ') || null,
    asunto: typeof f.propuesta?.asunto === 'string' ? f.propuesta.asunto : '',
    desde: f.desde.toISOString(),
  }))
}
