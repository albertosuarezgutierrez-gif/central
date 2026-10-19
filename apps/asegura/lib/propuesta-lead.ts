// F4 — de los precios de un lead de correo a la PROPUESTA enviada en su hilo (19/10/2026, spec lead → propuesta §F4/§3.4).
// Parte con BD; las reglas, en `propuesta-lead-puro.ts` y `@central/module-seguros` (`propuesta-lead.ts`), con test.
// Puerto `POST /api/operador/correo/propuesta-lead`; lo llama SOLO plataforma:
//   · `pendientes` / `revisar` (GRATIS, sin escribir nada): por hilo de lead con precio pedido (F3a), la comparativa
//     (compañía · prima · franquicia · firmeza · coberturas del catálogo · bloqueo), las necesidades IDD leídas de lo que
//     contestó el cliente y la recomendada, con su huella (si cambia, plataforma ACTUALIZA el aviso; no manda otro).
//   · `enviar`: SOLO tras «📤 Enviar» de Alberto. Recalcula todo, exige EXACTAMENTE la opción y la prima pulsadas, monta
//     el presupuesto de esa oferta (`prepararPresupuestoDeOfertas`), le escribe la declaración de necesidades y lo avisa
//     por el camino de siempre (`prepararAviso`/`ejecutarAviso`: portal con código y aceptación firmada) EN EL HILO.
//   · `hiloTrasPrecioRpa`: el gancho donde el tarificador ya registra precios (`/api/tarificador/resultado`): el hilo pasa
//     de `tarificando` a `tarificada`.
// 🛡️ Todo SQL lleva `correduria_id` (puerta `lib/tenant`). 🚨 Nada de Codeoscopic (0,50€) ni de IA aquí. Ningún dato
// personal en la respuesta del puerto (nombre de pila y códigos de opción) ni en logs.
import { prisma } from './tenant'
import { prismaAsegura } from './asegura-db'
import {
  MEDIADOR, conInformacionPrevia, declaracionNecesidadesLead, deducirNecesidadesLead, nombreDePila, validarNecesidades,
  type OpcionComparada,
} from '@central/module-seguros'
import { leerDatosContrato } from './correo-respuesta-lead-puro'
import { VIA_PROPUESTA_LEAD, ofertasDeRespuesta } from './presupuesto-rpa-reglas'
import {
  ESTADOS_HILO_CON_PRECIO, ESTADO_HILO_PROPUESTA_ENVIADA, HILO_ANTES_DE_PRECIO, armarPropuesta, decidirEnvio, opcionDeOfertaRpa, opcionDePrecioAvant2,
  textoHistorialPropuesta, type CabeceraPropuesta, type FilaPrecioAvant2, type PeticionPropuesta, type Propuesta,
} from './propuesta-lead-puro'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const codigoError = (err: unknown) => (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code
const sinTabla = (err: unknown) => codigoError(err) === '42P01' || /relation .* does not exist/i.test(String((err as Error)?.message))
const hoyMadrid = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d)
const MAX_PENDIENTES = 10

type FilaHilo = {
  id: bigint; cliente_id: string; oportunidad_id: string; message_id_raiz: string; message_ids: string[]; email_cliente_ciego: string | null
  estado_datos: string; ramo: string; info_riesgo: unknown; nombre: string | null
}

async function leerHilo(correduriaId: string, hiloId: string): Promise<FilaHilo | null> {
  const f = await prisma.$queryRaw<FilaHilo[]>`
    select h.id, h.cliente_id::text as cliente_id, h.oportunidad_id::text as oportunidad_id, h.message_id_raiz, h.message_ids,
           h.email_cliente_ciego, h.estado_datos, o.tipo::text as ramo, o.info_riesgo, c.nombre
    from seguros.correduria_hilo h
    join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id and o.cliente_id = h.cliente_id
    join seguros.clientes c on c.id = h.cliente_id and c.correduria_id = h.correduria_id and c.merged_into_cliente_id is null
    where h.correduria_id = ${correduriaId}::uuid and h.id = ${BigInt(hiloId)}`
  return f[0] ?? null
}

/** Los valores EN CLARO que el cliente dio en su hilo (lo cifrado no hace falta para las necesidades y no se abre). */
function valoresEnClaro(info: unknown): Record<string, unknown> {
  const dc = leerDatosContrato(esObj(info) ? info.datosContrato : null)
  return Object.fromEntries(Object.entries(dc.valores).filter(([, v]) => !esObj(v)))
}

/** Los precios de la oportunidad: ofertas del bot vivas (con su respuesta del portal) y, si ya los hay, los de Avant2. */
async function preciosDe(correduriaId: string, oportunidadId: string, ramo: string, hoy: string): Promise<OpcionComparada[]> {
  const rpa = await prisma.$queryRaw<{ id: string; compania: string | null; producto: string | null; prima_total: unknown; estado: string; datos_extra: unknown; respuesta: unknown }[]>`
    select f.id::text as id, f.compania, f.producto, f.prima_total, f.estado, f.datos_extra, x.respuesta
    from seguros.oportunidad_oferta f
    left join seguros.tarificaciones x on x.id::text = f.datos_extra->>'tarificacionId' and x.correduria_id = f.correduria_id
    where f.correduria_id = ${correduriaId}::uuid and f.oportunidad_id = ${oportunidadId}::uuid
      and f.rol = 'oferta' and f.estado <> 'descartada' and f.datos_extra->>'origen' = 'rpa'
    order by f.created_at asc
    limit 30`
  const out: OpcionComparada[] = []
  for (const f of rpa) {
    const extra = esObj(f.datos_extra) ? f.datos_extra : {}
    const tarificacionId = typeof extra.tarificacionId === 'string' ? extra.tarificacionId : ''
    const leidas = tarificacionId ? ofertasDeRespuesta(f.respuesta, { tarificacionId, trabajoId: String(extra.trabajoId ?? '') }) : null
    const leida = leidas?.find((l) => l.clave === extra.rpaClave) ?? null
    const o = opcionDeOfertaRpa(ramo, {
      id: f.id, compania: f.compania, producto: f.producto, primaTotal: f.prima_total, estado: f.estado, datosExtra: f.datos_extra,
      oferta: leida ? { coberturas: leida.oferta.coberturas, avisos: leida.oferta.avisos } : null,
    }, hoy)
    if (o) out.push(o)
  }
  // Avant2: SOLO si ya hay una tarificación real de esta oportunidad (desde aquí nunca se pide precio: cuesta 0,50€).
  const cds = await prisma.$queryRaw<FilaPrecioAvant2[]>`
    select p.id::text as id, p.compania, p.producto, p.prima_eur, p.franquicia_eur, p.firmeza, p.avisos, p.garantias
    from seguros.tarificacion_precios p
    where p.tarificacion_id = (
      select t.id from seguros.tarificaciones t
      where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid and t.simulado = false
        and coalesce(to_jsonb(t)->>'canal', 'codeoscopic') = 'codeoscopic'
      order by t.creado_at desc limit 1)
    limit 40`.catch(() => [] as FilaPrecioAvant2[])
  for (const f of cds) {
    const o = opcionDePrecioAvant2(f)
    if (o) out.push(o)
  }
  return out
}

function cabecera(h: FilaHilo): CabeceraPropuesta {
  return {
    hiloId: String(h.id), clienteId: h.cliente_id, oportunidadId: h.oportunidad_id, ramo: h.ramo, pila: nombreDePila(h.nombre),
    estadoDatos: h.estado_datos, messageIdRaiz: h.message_id_raiz, messageIds: [...new Set([h.message_id_raiz, ...(h.message_ids ?? [])])].slice(0, 50),
  }
}

async function propuestaDe(correduriaId: string, h: FilaHilo, hoy: string): Promise<Propuesta> {
  const necesidades = deducirNecesidadesLead(h.ramo, valoresEnClaro(h.info_riesgo))
  const precios = await preciosDe(correduriaId, h.oportunidad_id, h.ramo, hoy)
  return armarPropuesta(cabecera(h), necesidades, precios)
}

export type ResultadoRevisar = { estado: 'ok'; propuesta: Propuesta } | { estado: 'sin_hilo' | 'sin_tabla' | 'sin_precios' }

export async function revisarPropuestaLead(correduriaId: string, hiloId: string, ahora = new Date()): Promise<ResultadoRevisar> {
  let h: FilaHilo | null
  try { h = await leerHilo(correduriaId, hiloId) } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
  if (!h) return { estado: 'sin_hilo' }
  const p = await propuestaDe(correduriaId, h, hoyMadrid(ahora))
  if (!p.opciones.length) return { estado: 'sin_precios' }
  return { estado: 'ok', propuesta: p }
}

/**
 * Hilos de lead con precio pedido (F3a) y al menos un precio (de bot, o REAL de Avant2 por 💶 `clp_cds`), sin propuesta
 * enviada. Para el cron del triaje.
 */
export async function pendientesPropuestaLead(correduriaId: string, ahora = new Date()): Promise<{ estado: 'ok'; propuestas: Propuesta[] } | { estado: 'sin_tabla' }> {
  let filas: FilaHilo[]
  try {
    filas = await prisma.$queryRaw<FilaHilo[]>`
      select h.id, h.cliente_id::text as cliente_id, h.oportunidad_id::text as oportunidad_id, h.message_id_raiz, h.message_ids,
             h.email_cliente_ciego, h.estado_datos, o.tipo::text as ramo, o.info_riesgo, c.nombre
      from seguros.correduria_hilo h
      join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id and o.cliente_id = h.cliente_id
      join seguros.clientes c on c.id = h.cliente_id and c.correduria_id = h.correduria_id and c.merged_into_cliente_id is null
      where h.correduria_id = ${correduriaId}::uuid and h.estado_datos = any(${[...ESTADOS_HILO_CON_PRECIO]}::text[])
        and h.created_at > now() - interval '30 days'
        and (exists (select 1 from seguros.oportunidad_oferta f where f.correduria_id = h.correduria_id and f.oportunidad_id = h.oportunidad_id
                       and f.rol = 'oferta' and f.estado <> 'descartada' and f.datos_extra->>'origen' = 'rpa')
             or exists (select 1 from seguros.tarificaciones t where t.correduria_id = h.correduria_id and t.oportunidad_id = h.oportunidad_id
                          and t.simulado = false and coalesce(to_jsonb(t)->>'canal', 'codeoscopic') = 'codeoscopic'))
      order by h.id desc
      limit ${MAX_PENDIENTES}`
  } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
  const hoy = hoyMadrid(ahora)
  const propuestas: Propuesta[] = []
  for (const h of filas) {
    const p = await propuestaDe(correduriaId, h, hoy)
    if (p.opciones.length) propuestas.push(p)
  }
  return { estado: 'ok', propuestas }
}

/**
 * Gancho del tarificador (donde ya registra precios): un trabajo de bot `ok` de una oportunidad que vino de un lead pasa
 * su hilo de `tarificando` a `tarificada`. Nunca lanza (el precio ya está guardado; esto solo es el estado del expediente).
 */
export async function hiloTrasPrecioRpa(trabajoId: string): Promise<void> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(trabajoId)) return
    await prisma.$executeRaw`
      update seguros.correduria_hilo h set estado_datos = 'tarificada'
      from seguros.tarificacion_trabajos t
      where t.id = ${trabajoId}::uuid and t.estado = 'ok' and t.oportunidad_id = h.oportunidad_id and t.correduria_id = h.correduria_id
        and h.estado_datos = 'tarificando'`
  } catch (e) {
    if (!sinTabla(e)) console.error('[propuesta-lead] hilo tras precio:', e instanceof Error ? e.name : 'error')
  }
}

/**
 * Gancho de Avant2 (opción B, 19/10/2026): tras un precio REAL de Codeoscopic colgado de su oportunidad (`cotizar()`, paso de
 * enlazar), el hilo del lead pasa a `tarificada` para que la propuesta F4 lo recoja. Solo desde `lista_para_tarificar` o
 * `tarificando` (`HILO_ANTES_DE_PRECIO`): nunca deshace una propuesta enviada. Exige la tarificación real en BD (no simulada).
 * Nunca lanza: el precio ya está pagado y guardado; esto solo es el estado del expediente.
 */
export async function hiloTrasPrecioAvant2(correduriaId: string, oportunidadId: string): Promise<void> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(oportunidadId) || !/^[0-9a-f-]{36}$/i.test(correduriaId)) return
    await prisma.$executeRaw`
      update seguros.correduria_hilo h set estado_datos = 'tarificada'
      where h.correduria_id = ${correduriaId}::uuid and h.oportunidad_id = ${oportunidadId}::uuid
        and h.estado_datos = any(${[...HILO_ANTES_DE_PRECIO]}::text[])
        and exists (select 1 from seguros.tarificaciones t where t.correduria_id = h.correduria_id and t.oportunidad_id = h.oportunidad_id
                      and t.simulado = false and coalesce(to_jsonb(t)->>'canal', 'codeoscopic') = 'codeoscopic')`
  } catch (e) {
    if (!sinTabla(e)) console.error('[propuesta-lead] hilo tras precio de Avant2:', e instanceof Error ? e.name : 'error')
  }
}

// ─── Enviar ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Enviar = Extract<PeticionPropuesta, { accion: 'enviar' }>

export type ResultadoEnviar =
  | { estado: 'enviado'; presupuestoId: string; repetido?: true; hilo: 'ok' | 'sin_sql' | 'error'; oportunidad: 'ok' | 'sin_cambio'; historial: boolean }
  /** Seguro que NO salió nada (con el motivo legible). `status` para el puerto. */
  | { estado: 'no_enviado'; motivo: string; detalle: string; status: 404 | 409 | 503 }
  /** Salió el `prepararAviso` pero el envío no consta (proveedor caído, rechazo…). */
  | { estado: 'fallo_envio'; motivo: string; detalle: string }

const noEnviado = (motivo: string, detalle: string, status: 404 | 409 | 503 = 409): ResultadoEnviar => ({ estado: 'no_enviado', motivo, detalle, status })

/**
 * ¿Ya se usó esta clave? `enviado` = salió (un reintento no vuelve a rotar el enlace del cliente); `envio_incierto` = no
 * consta si salió: tampoco se repite (ni presupuesto nuevo, que retiraría el que quizá ya tiene, ni enlace rotado).
 */
async function yaEnviado(correduriaId: string, idempotencia: string): Promise<{ id: string; tipo: 'enviado' | 'envio_incierto' } | null> {
  const f = await prismaAsegura().$queryRaw<{ id: string; tipo: 'enviado' | 'envio_incierto' }[]>`
    select p.id::text as id, e.tipo from presupuesto_evento e join presupuesto p on p.id = e.presupuesto_id
    where p.correduria_id = ${correduriaId}::uuid and e.tipo in ('enviado', 'envio_incierto') and e.detalle->>'idempotencia' = ${idempotencia}
    order by (e.tipo = 'enviado') desc
    limit 1`
  return f[0] ?? null
}

async function hashEmail(email: string): Promise<string | null> {
  const { computeEmailLookupHash } = await import('@central/module-seguros-pii')
  try { return computeEmailLookupHash(email) } catch { return null }
}

export async function enviarPropuestaLead(correduriaId: string, e: Enviar, ahora = new Date()): Promise<ResultadoEnviar> {
  // 0. Idempotencia: lo que ya salió con esta clave no se repite (ni rota el enlace que el cliente ya tiene).
  const previo = await yaEnviado(correduriaId, e.idempotencia)
  if (previo?.tipo === 'enviado') return { estado: 'enviado', presupuestoId: previo.id, repetido: true, hilo: 'ok', oportunidad: 'sin_cambio', historial: false }
  if (previo) return { estado: 'fallo_envio', motivo: 'incierto', detalle: 'Esta propuesta ya se intentó con esa misma clave y no consta si salió: no la repito (rotaría el enlace que quizá ya tiene). Míralo en Resend o en su hilo.' }

  // 1. La propuesta AHORA (precios y necesidades pueden haber cambiado desde el aviso) y la opción EXACTA pulsada.
  let h: FilaHilo | null
  try { h = await leerHilo(correduriaId, e.hiloId) } catch (err) {
    if (sinTabla(err)) return noEnviado('sin_tabla', 'Falta el SQL del hilo (2026-10-19b): no se envía nada.', 503)
    throw err
  }
  if (!h) return noEnviado('sin_hilo', 'Ese hilo no existe en esta correduría.', 404)
  const p = await propuestaDe(correduriaId, h, hoyMadrid(ahora))
  const d = decidirEnvio(p, e.clave, e.primaEur)
  if (!d.ok) return noEnviado(d.estado, d.detalle)
  const declaracion = declaracionNecesidadesLead(h.ramo, p.necesidades)
  const vn = validarNecesidades(declaracion)
  if (!vn.ok) return noEnviado('necesidades_incompletas', vn.motivo)

  // 2. El destinatario: SOLO el email del hilo, que tiene que ser un email de la ficha (lo comprueba también el aviso).
  const hTo = await hashEmail(e.to)
  if (!hTo || !h.email_cliente_ciego || hTo !== h.email_cliente_ciego) return noEnviado('email_no_es_del_hilo', 'Ese correo no es el del hilo del lead.')
  const db = prismaAsegura()
  const cli = await db.cliente.findFirst({
    where: { id: h.cliente_id, correduriaId, mergedIntoClienteId: null },
    select: { emailLookupHash: true, emailOptOutAt: true, emails: { select: { emailLookupHash: true } } },
  })
  if (!cli) return noEnviado('no_encontrado', 'La ficha ya no existe en la correduría.', 404)
  const deFicha = new Set([cli.emailLookupHash, ...cli.emails.map((x) => x.emailLookupHash)].filter((x): x is string => !!x))
  if (!deFicha.has(hTo)) return noEnviado('email_no_es_de_la_ficha', 'El correo del hilo no es un email de la ficha.')
  if (cli.emailOptOutAt) return noEnviado('baja_de_correos', 'La ficha tiene la baja de correos.')
  // El aviso del presupuesto va al email PRINCIPAL de la ficha (con él entra al portal): tiene que ser el del hilo. Se
  // mira ANTES de escribir nada (revisión de la oferta, presupuesto), para no dejar rastro de un envío que no saldrá.
  const { estadoEmailDeFicha } = await import('./email-ficha')
  const principal = await estadoEmailDeFicha(correduriaId, h.cliente_id)
  if (principal.estado !== 'ok' || (await hashEmail(principal.email)) !== hTo) {
    return noEnviado('email_distinto', 'El correo del hilo no es el principal de su ficha (con el que entraría al portal): no se envía. Revísalo en su ficha.')
  }

  // 3. La revisión de la oferta del bot es la pulsación de Alberto sobre ESTA comparativa (compañía, prima, franquicia y
  //    coberturas a la vista). Solo una oferta del bot aún `extraida`; una leída de PDF no se toca aquí.
  await db.oportunidadOferta.updateMany({
    where: { id: d.opcion.clave, correduriaId, oportunidadId: h.oportunidad_id, estado: 'extraida', datosExtra: { path: ['origen'], equals: 'rpa' } },
    data: { estado: 'revisada', revisadaAt: ahora, revisadaPor: e.actor, updatedAt: ahora },
  })

  // 4. El presupuesto de ESA oferta (sola), por el camino de siempre (trigger de revisión incluido).
  //    🚨 `via`: solo se sustituyen presupuestos AUTOMÁTICOS sin enviar (borrador del bot sin tocar, otro 📤 que no salió);
  //    lo que Alberto hizo a mano en la oportunidad no se retira nunca.
  const { prepararPresupuestoDeOfertas } = await import('./presupuesto')
  const prep = await prepararPresupuestoDeOfertas(
    correduriaId, { oportunidadId: h.oportunidad_id, ofertaIds: [d.opcion.clave], actor: e.actor, via: VIA_PROPUESTA_LEAD }, ahora)
  if (prep.estado !== 'ok') return noEnviado(prep.motivo, prep.detalle)
  const presupuestoId = prep.presupuesto.id

  // 5. La declaración de necesidades del cliente (sustituye a la deducida «neutra» que el presupuesto se autorrellena).
  await db.presupuesto.updateMany({
    where: { id: presupuestoId, correduriaId, aceptadoAt: null, retiradoAt: null },
    data: { necesidades: vn.valor, necesidadesAt: ahora },
  })
  await db.presupuestoEvento.create({
    data: { presupuestoId, tipo: 'necesidades', origen: 'corredor', detalle: { actor: e.actor, via: 'lead_correo', respuestas: p.necesidades.respuestas } },
  })

  // 6. El aviso de siempre (portal con código y aceptación firmada), EN EL HILO. Destino = el email del aviso, que
  //    tiene que ser el mismo del hilo (si no, el código del portal iría a otro buzón).
  const { prepararAviso, ejecutarAviso } = await import('./envio-presupuesto')
  const aviso = await prepararAviso(correduriaId, { id: presupuestoId, canal: 'email', actor: e.actor }, ahora)
  if (aviso.estado === 'error') return noEnviado(aviso.motivo, aviso.detalle)
  const hAviso = aviso.emailAcceso ? await hashEmail(aviso.emailAcceso) : null
  if (hAviso !== hTo) return noEnviado('email_distinto', 'El correo con el que entraría al portal no es el del hilo: no se envía. Revísalo en su ficha.')
  const r = await ejecutarAviso(aviso, null, undefined, {
    asunto: e.asunto, intro: conInformacionPrevia(e.texto), enRespuestaA: e.enRespuestaA, copiaOculta: MEDIADOR.identidad.email, idempotencia: e.idempotencia,
  })
  if (r.estado !== 'enviado') {
    const detalle = r.estado === 'error' ? r.detalle : 'Respuesta inesperada del aviso.'
    const motivo = r.estado === 'error' ? r.motivo : 'inesperado'
    // `ocupado` = otro clic a la vez: no salió nada por aquí. El resto (proveedor, rechazo) tampoco consta como enviado.
    return r.estado === 'error' && (r.motivo === 'sin_proveedor' || r.motivo === 'ocupado' || r.motivo === 'no_enviable')
      ? noEnviado(motivo, detalle, r.motivo === 'sin_proveedor' ? 503 : 409)
      : { estado: 'fallo_envio', motivo, detalle }
  }

  // 7. Ya salió: nada de aquí abajo puede convertirlo en un fallo (se reintentaría y saldría dos veces).
  const hilo = await marcarHiloPropuesta(correduriaId, h, presupuestoId)
  let oportunidad: 'ok' | 'sin_cambio' = 'sin_cambio'
  try {
    const { cambiarEstadoOportunidad } = await import('./oportunidad-seguimiento')
    const c = await cambiarEstadoOportunidad(correduriaId, h.oportunidad_id, { accion: 'propuesta_enviada' }, e.actor)
    if (c.ok) oportunidad = 'ok'
  } catch (err) {
    console.error('[propuesta-lead] oportunidad sin cambiar:', err instanceof Error ? err.name : 'error')
  }
  await prisma.$executeRaw`
    insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
    values (${correduriaId}::uuid, ${h.oportunidad_id}::uuid, 'propuesta_lead_enviada',
            ${JSON.stringify({ presupuestoId, compania: d.opcion.compania, primaEur: d.opcion.primaEur, recomendada: p.recomendada?.clave === d.opcion.clave })}::jsonb, ${e.actor})`.catch(() => 0)
  let historial = false
  try {
    await prisma.$executeRaw`
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${h.cliente_id}::uuid, cast('contacto' as seguros.tipo_historial_interno),
              ${textoHistorialPropuesta({ compania: d.opcion.compania, primaEur: d.opcion.primaEur, actor: e.actor, asunto: e.asunto })})`
    historial = true
  } catch (err) {
    console.error('[propuesta-lead] historial no anotado:', err instanceof Error ? err.name : 'error')
  }
  return { estado: 'enviado', presupuestoId, hilo, oportunidad, historial }
}

/**
 * El hilo pasa a «propuesta enviada» (+ presupuesto y sello para el seguimiento de F5). Sin el SQL 2026-10-19e el CHECK
 * no admite el estado: se dice `sin_sql` (el correo YA salió) y el hilo se queda como estaba.
 */
async function marcarHiloPropuesta(correduriaId: string, h: FilaHilo, presupuestoId: string): Promise<'ok' | 'sin_sql' | 'error'> {
  try {
    await prisma.$executeRaw`
      update seguros.correduria_hilo
      set estado_datos = ${ESTADO_HILO_PROPUESTA_ENVIADA}, presupuesto_id = ${presupuestoId}::uuid, propuesta_enviada_at = now()
      where correduria_id = ${correduriaId}::uuid and id = ${h.id}`
    return 'ok'
  } catch (err) {
    const c = codigoError(err)
    // 23514 (CHECK) o 42703 (columna): el SQL de F4 sin aplicar.
    if (c === '23514' || c === '42703' || /check constraint|column .* does not exist/i.test(String((err as Error)?.message))) return 'sin_sql'
    console.error('[propuesta-lead] hilo sin marcar:', err instanceof Error ? err.name : 'error')
    return 'error'
  }
}
