// apps/asegura/lib/cartera-recaptacion.ts
//
// La cola de recaptación: leads del volcado histórico con contacto que NO son
// ya cliente vivo por CIMA. Ver
// docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
//
// 🎯 DOS orígenes, medidos el 20/09/2026 antes de ampliar el alcance:
//   · `sin_vencimiento` (Fase 1, 12/09/2026) — activa sin fecha, 1.167 leads.
//   · `vencimiento_antiguo` (Fase 2, 20/09/2026) — venció hace años (el 89% en
//     estado `vencida`, la mayoría 2014-2018): el AÑO no sirve para "vence
//     pronto", pero el MES/DÍA es la única pista de cuándo solía renovar y
//     permite repartir el contacto a lo largo del año. Sube el total
//     recaptable de 424 a 1.399 clientes (medido contra la BD real). Alberto,
//     20/09/2026: "más importante es ir captando nuevos clientes con leads
//     que tenemos, muchos" — la Fase 1 sola tocaba menos del 5% del volcado.
//
// No hay tabla de cola: se calcula en cada GET, como `polizasSinRecibo()` de
// `cartera-impagados.ts`. `recaptacion_envios` es solo el HISTORIAL que decide
// el cooldown y alimenta el contador semanal.
//
// 🔒 Igual que el resto de `lib/cartera-*.ts` de esta app: `prismaAsegura()`
// conecta con `?schema=seguros` ya en la URL, así que las tablas NO se
// prefijan con `seguros.` en el SQL crudo (ver `cartera-impagados.ts`,
// `cartera-filtro.ts`) — eso mismo evita disparar el guardián de aislamiento
// de `test/regression-asegura-aislamiento.test.ts`, que solo mira SQL que
// nombre el schema explícitamente.

import { enCooldown, COOLDOWN_DIAS, textoBaseRecaptacionWhatsapp, textoBaseRecaptacionEmail, sqlCarteraViva, sqlVolcadoHistorico, remitenteCorreo } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { decidirDestinatarioRecaptacion, enviarEmailResend } from './recaptacion-email'
import { estadoEmailDeFicha } from './email-ficha'
import { urlBaja, urlPublicaAsegura } from './recaptacion-baja'
import { candidatosLoteEmail, LIMITE_LOTE_POR_DEFECTO } from './recaptacion-lote'
import { dentroVentanaAntiguo } from './recaptacion-ventana'
import { esLeadSilencioso, SEGUIMIENTO_EMAIL_DESDE, UMBRAL_SILENCIO } from './recaptacion-silencio'
import { descartarCliente } from './cartera-edicion'

export { candidatosLoteEmail } from './recaptacion-lote'

const RAMOS_LEGIBLES: Record<string, string> = {
  hogar: 'hogar',
  auto: 'auto',
  moto: 'moto',
  responsabilidad_civil: 'responsabilidad civil',
  vida: 'vida',
  salud: 'salud',
  decesos: 'decesos',
  comercio: 'comercio',
  otros: 'comunidades', // el caso real que abrió este trabajo (BIDP023227) es 'otros'
}

function ramoLegible(tipo: string): string {
  return RAMOS_LEGIBLES[tipo] ?? tipo.replace(/_/g, ' ')
}

/**
 * `(legacy)` es un CENTINELA del volcado (26.987 pólizas), no el nombre de
 * una compañía — el importador lo escribió cuando no sabía la aseguradora
 * real. Servirlo tal cual haría que el mensaje de recaptación dijera «que
 * tuviste con (legacy)», que es basura con forma de dato (regla del
 * CLAUDE.md raíz sobre valores de cajón). Trata cualquier variante como
 * "no se conoce", igual que un `aseguradora` vacío.
 */
function aseguradoraLegible(v: string | null | undefined): string | null {
  const limpio = v?.trim() || null
  if (limpio === null) return null
  return /^\(?legacy\)?$/i.test(limpio) ? null : limpio
}

/** Descifra sin convertir un fallo en "no tiene contacto". Mismo patrón que `cartera-impagados.ts`. */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

/**
 * `sin_vencimiento` = Fase 1 (12/09/2026): activa y sin fecha, no hay a qué
 * anclar el contacto. `vencimiento_antiguo` = Fase 2 (20/09/2026): venció hace
 * años (la mayoría 2014-2018, cualquier estado del volcado) — el AÑO no sirve,
 * pero el MES/DÍA es la única pista real de cuándo solía renovar, y permite
 * repartir el contacto a lo largo del año en vez de escribirles a todos de
 * golpe. Ver `docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md`
 * ("Fuera de alcance de esta primera vuelta").
 */
export type OrigenLeadRecaptacion = 'sin_vencimiento' | 'vencimiento_antiguo'

export type LeadRecaptacion = {
  clienteId: string
  polizaId: string
  cliente: string
  ramo: string
  ramoLegible: string
  aseguradoraAnterior: string | null
  numeroPoliza: string | null
  telefono: string | null
  email: string | null
  /** `null` = la compañía no informa la prima. NUNCA 0. */
  prima: number | null
  /** `true` = ya se contactó hace menos de 14 días; la pantalla ofrece "ver igualmente" para forzar. */
  enCooldown: boolean
  ultimoContactoEn: string | null
  origen: OrigenLeadRecaptacion
  /** Mes (1-12) del vencimiento antiguo. `null` cuando `origen==='sin_vencimiento'`. */
  mesVencimientoAntiguo: number | null
  /** Día (1-31) del vencimiento antiguo. `null` cuando `origen==='sin_vencimiento'`. */
  diaVencimientoAntiguo: number | null
}

export type ContadoresRecaptacion = {
  totalCandidatos: number
  contactadosSemana: number
  conAperturaORespuestaSemana: number
  /** Acumulado TOTAL de emails de recaptación (no solo la semana): con envío manual
   *  y bajo volumen, el contador semanal se resetea antes de tener muestra suficiente
   *  para juzgar si el asunto/mensaje funciona. `null` = no se pudo calcular. */
  emailEnviadosTotal: number | null
  emailAbiertosTotal: number | null
  /**
   * Leads `vencimiento_antiguo` que existen pero cuya ventana de contacto
   * (45 días antes de su aniversario) todavía no se ha abierto. NO están
   * perdidos ni descartados: `totalCandidatos` los excluye a propósito
   * (mandarles ahora no tendría motivo real detrás) y este número es lo que
   * evita que esa exclusión se lea como "solo hay esto en toda la cartera".
   */
  enEsperaVentana: number
}

export type ColaRecaptacion = { leads: LeadRecaptacion[]; contadores: ContadoresRecaptacion }

type FilaCruda = {
  clienteId: string
  nombre: string
  apellidos: string
  polizaId: string
  tipo: string
  aseguradora: string | null
  numeroPoliza: string | null
  prima: unknown
  /** `null` si no hay teléfono O si el cliente dio de baja WhatsApp (`wa_opt_out_at`). */
  telefono: string | null
  /** `null` si no hay email O si el cliente dio de baja el correo (`email_opt_out_at`). */
  email: string | null
  ultimoEnvioAt: Date | null
  origen: string
  mesVencimientoAntiguo: number | null
  diaVencimientoAntiguo: number | null
}

export async function colaRecaptacion(correduriaId: string): Promise<ColaRecaptacion> {
  const vacia: ColaRecaptacion = {
    leads: [],
    contadores: {
      totalCandidatos: 0, contactadosSemana: 0, conAperturaORespuestaSemana: 0,
      emailEnviadosTotal: null, emailAbiertosTotal: null, enEsperaVentana: 0,
    },
  }
  if (!aseguraConfigurada()) return vacia
  const db = prismaAsegura()

  // Un lead entra si: es volcado sin vencimiento y activo, tiene teléfono o
  // email DISPONIBLE (tras aplicar el opt-out por canal), y su cliente NO
  // tiene NINGUNA otra póliza de cartera viva (si la tuviera, es cliente
  // actual y se trabaja desde su ficha, no aquí).
  const filas = await db.$queryRaw<FilaCruda[]>(Prisma.sql`
    select
      c.id as "clienteId", c.nombre, c.apellidos,
      p.id as "polizaId", p.tipo::text as tipo, p.aseguradora, p.numero_poliza as "numeroPoliza",
      -- Las dos primas son la MISMA magnitud en dos columnas distintas; un 0
      -- guardado tampoco es una prima real (regla NULL≠0 del CLAUDE.md).
      nullif(coalesce(p.prima_bruta, p.prima_anual), 0)::float8 as prima,
      -- Opt-out POR CANAL, no de la ficha entera: si dio de baja WhatsApp pero
      -- no el email (o al revés), sigue siendo contactable por el otro.
      case when c.wa_opt_out_at is null then c.telefono else null end as telefono,
      case when c.email_opt_out_at is null then c.email else null end as email,
      (
        select max(r.created_at) from recaptacion_envios r
        where r.cliente_id = c.id
      ) as "ultimoEnvioAt",
      -- Fase 2 (20/09/2026): un lead SIN vencimiento (Fase 1, activa) es
      -- distinto de uno CON vencimiento antiguo (venció hace años, cualquier
      -- estado) — la pantalla los distingue y usa el mes del segundo para
      -- repartir el contacto a lo largo del año.
      case when p.fecha_vencimiento is null then 'sin_vencimiento' else 'vencimiento_antiguo' end as origen,
      extract(month from p.fecha_vencimiento)::int as "mesVencimientoAntiguo",
      extract(day from p.fecha_vencimiento)::int as "diaVencimientoAntiguo"
    from polizas p
    join clientes c on c.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and c.merged_into_cliente_id is null
      and c.activo
      and ${Prisma.raw(sqlVolcadoHistorico('p'))}
      -- Fase 1: activa y sin fecha (nada a lo que anclar el contacto).
      -- Fase 2: CUALQUIER estado con fecha de vencimiento — el 89% de estos
      -- están en estado vencida, que es justo lo que significa "dejó de ser cliente".
      and (
        (p.estado = 'activa' and p.fecha_vencimiento is null)
        or p.fecha_vencimiento is not null
      )
      -- Al menos un canal DISPONIBLE tras aplicar el opt-out (no basta con
      -- tener el dato guardado: si el único canal que tiene está dado de baja,
      -- este lead no entra en la cola).
      and (
        (c.telefono is not null and c.wa_opt_out_at is null)
        or (c.email is not null and c.email_opt_out_at is null)
      )
      and not exists (
        -- cartera_viva: si el cliente tiene OTRA póliza que sea cartera viva
        -- (import_ref is null or eiac_xml_hash is not null, regla única de
        -- @central/module-seguros), es cliente ACTUAL y se trabaja desde su
        -- ficha, no aquí.
        select 1 from polizas v
        where v.cliente_id = c.id
          and v.id <> p.id
          and v.merged_into_poliza_id is null
          and ${Prisma.raw(sqlCarteraViva('v'))}
      )
    order by c.apellidos, c.nombre
    -- Medido el 20/09/2026: la Fase 2 sube el total a ~2.171 filas (1.399
    -- clientes) — el tope de Fase 1 (2000) se habría quedado corto y habría
    -- truncado en silencio parte de la cola nueva.
    limit 4000
  `)

  const hoy = new Date()
  const leads: LeadRecaptacion[] = filas.map((f) => {
    const tipo = String(f.tipo)
    const ultimoEnvio = f.ultimoEnvioAt ? { creadoAt: f.ultimoEnvioAt } : null
    return {
      clienteId: f.clienteId,
      polizaId: f.polizaId,
      cliente: `${f.nombre} ${f.apellidos}`.trim(),
      ramo: tipo,
      ramoLegible: ramoLegible(tipo),
      aseguradoraAnterior: aseguradoraLegible(f.aseguradora),
      numeroPoliza: f.numeroPoliza,
      telefono: descifrar(f.telefono),
      email: descifrar(f.email),
      prima: f.prima === null || f.prima === undefined ? null : Number(f.prima),
      enCooldown: enCooldown(ultimoEnvio, hoy, COOLDOWN_DIAS),
      ultimoContactoEn: f.ultimoEnvioAt ? f.ultimoEnvioAt.toISOString().slice(0, 10) : null,
      // Un valor que el SQL no puede dar (nunca debería pasar: el `case`
      // solo devuelve estas dos cadenas) cae al lado conservador (Fase 1),
      // no se propaga un string arbitrario a la pantalla.
      origen: f.origen === 'vencimiento_antiguo' ? 'vencimiento_antiguo' : 'sin_vencimiento',
      mesVencimientoAntiguo: f.mesVencimientoAntiguo ?? null,
      diaVencimientoAntiguo: f.diaVencimientoAntiguo ?? null,
    }
  })

  // Fase 2: un `vencimiento_antiguo` solo es candidato dentro de los 45 días
  // previos a su aniversario — escribirle en cualquier otro momento no tiene
  // motivo real detrás (ver cabecera del fichero). `sin_vencimiento` no pasa
  // por este filtro: nunca tuvo fecha a la que anclar una ventana.
  // 🚨 Si el mes/día no se pudo leer, se trata como CONTACTABLE (el lado que
  // no esconde trabajo) en vez de exigir un dato que puede faltar.
  const leadsEnVentana = leads.filter((l) => {
    if (l.origen !== 'vencimiento_antiguo') return true
    if (l.mesVencimientoAntiguo === null || l.diaVencimientoAntiguo === null) return true
    return dentroVentanaAntiguo(l.mesVencimientoAntiguo, l.diaVencimientoAntiguo, hoy)
  })
  const enEsperaVentana = leads.length - leadsEnVentana.length

  const [semana, historicoEmail] = await Promise.all([contadoresSemana(correduriaId), contadoresEmailHistorico(correduriaId)])
  return {
    leads: leadsEnVentana,
    contadores: { ...semana, ...historicoEmail, totalCandidatos: leadsEnVentana.length, enEsperaVentana },
  }
}

async function contadoresSemana(correduriaId: string): Promise<{ contactadosSemana: number; conAperturaORespuestaSemana: number }> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ contactados: bigint; conRespuesta: bigint }[]>(Prisma.sql`
    select
      count(distinct cliente_id)::bigint as contactados,
      count(distinct cliente_id) filter (where estado in ('abierto', 'pinchado'))::bigint as "conRespuesta"
    from recaptacion_envios
    where correduria_id = ${correduriaId}::uuid
      and created_at >= now() - interval '7 days'
  `)
  const f = filas[0]
  return { contactadosSemana: Number(f?.contactados ?? 0), conAperturaORespuestaSemana: Number(f?.conRespuesta ?? 0) }
}

/**
 * Acumulado TOTAL (sin ventana) de emails de recaptación: enviados y
 * abiertos-o-pinchados. Solo `canal = 'email'` — el WhatsApp manual nunca
 * avanza a 'abierto'/'pinchado' (no hay WABA, solo se registra "se abrió el
 * enlace"), así que mezclarlo aquí falsearía la tasa de apertura del email.
 * `null` en caso de fallo de lectura: NUNCA se sustituye por 0, que se leería
 * como "0% de apertura" en vez de "no se ha podido comprobar".
 * Solo desde `SEGUIMIENTO_EMAIL_DESDE`: antes el tracking estaba apagado y
 * esos envíos harían bajar la tasa con aperturas que nadie pudo medir.
 */
async function contadoresEmailHistorico(correduriaId: string): Promise<{ emailEnviadosTotal: number | null; emailAbiertosTotal: number | null }> {
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ enviados: bigint; abiertos: bigint }[]>(Prisma.sql`
      select
        count(*)::bigint as enviados,
        count(*) filter (where estado in ('abierto', 'pinchado'))::bigint as abiertos
      from recaptacion_envios
      where correduria_id = ${correduriaId}::uuid
        and canal = 'email'
        and created_at >= ${SEGUIMIENTO_EMAIL_DESDE}::timestamp
    `)
    const f = filas[0]
    return { emailEnviadosTotal: Number(f?.enviados ?? 0), emailAbiertosTotal: Number(f?.abiertos ?? 0) }
  } catch {
    return { emailEnviadosTotal: null, emailAbiertosTotal: null }
  }
}

export type ResultadoBaja =
  | { estado: 'ok'; yaEstaba: boolean }
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

/**
 * Opt-out AUTOMÁTICO cuando Resend confirma que el correo rebotó o el
 * destinatario se quejó de spam (14/09/2026). A diferencia de
 * `aplicarBajaEmail` (que resuelve por el id del envío, del enlace de baja),
 * este resuelve por `resend_message_id`: es el webhook quien lo dispara, no
 * un clic del destinatario — no hay enlace de por medio.
 *
 * Idempotente por la misma razón que `aplicarBajaEmail`: el webhook puede
 * reintentar la entrega del evento.
 */
export async function aplicarBajaPorRebote(resendMessageId: string, motivo: 'rebotado' | 'queja'): Promise<ResultadoBaja> {
  if (!aseguraConfigurada()) return { estado: 'error', motivo: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const envio = await db.$queryRaw<{ clienteId: string; correduriaId: string; emailOptOutAt: Date | null }[]>(Prisma.sql`
      select c.id as "clienteId", c.correduria_id as "correduriaId", c.email_opt_out_at as "emailOptOutAt"
      from recaptacion_envios r
      join clientes c on c.id = r.cliente_id
      where r.resend_message_id = ${resendMessageId} and r.canal = 'email'
      limit 1
    `)
    const fila = envio[0]
    if (!fila) return { estado: 'no_encontrado' }
    if (fila.emailOptOutAt) return { estado: 'ok', yaEstaba: true }

    await db.$executeRaw(Prisma.sql`
      update clientes set email_opt_out_at = now() where id = ${fila.clienteId}::uuid and email_opt_out_at is null
    `)
    const texto = motivo === 'rebotado'
      ? 'Recaptación: email RECHAZADO por el proveedor (dirección muerta) — baja automática de correo'
      : 'Recaptación: destinatario marcó el email como spam — baja automática de correo'
    await anotar(fila.correduriaId, fila.clienteId, texto)
    return { estado: 'ok', yaEstaba: false }
  } catch (e) {
    console.error('[cartera-recaptacion] fallo aplicando la baja por rebote:', e instanceof Error ? e.message : e)
    return { estado: 'error', motivo: 'fallo_bd' }
  }
}

/**
 * Resuelve el token de baja (el `id` de un `recaptacion_envios`) contra la
 * ficha del cliente y le pone `email_opt_out_at`. Idempotente: pulsar el
 * enlace dos veces (un cliente de correo que prefetchea, o el propio cliente
 * dudando) no falla ni pisa la fecha ya puesta.
 *
 * Solo da de baja el CANAL EMAIL — un WhatsApp abierto desde el mismo lead
 * sigue siendo válido; son opt-out independientes, como ya lee `colaRecaptacion`.
 */
export async function aplicarBajaEmail(envioId: string): Promise<ResultadoBaja> {
  if (!aseguraConfigurada()) return { estado: 'error', motivo: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const envio = await db.$queryRaw<{ clienteId: string; correduriaId: string; emailOptOutAt: Date | null }[]>(Prisma.sql`
      select c.id as "clienteId", c.correduria_id as "correduriaId", c.email_opt_out_at as "emailOptOutAt"
      from recaptacion_envios r
      join clientes c on c.id = r.cliente_id
      where r.id = ${envioId}::uuid
      limit 1
    `)
    const fila = envio[0]
    if (!fila) return { estado: 'no_encontrado' }
    if (fila.emailOptOutAt) return { estado: 'ok', yaEstaba: true }

    await db.$executeRaw(Prisma.sql`
      update clientes set email_opt_out_at = now() where id = ${fila.clienteId}::uuid and email_opt_out_at is null
    `)
    await anotar(fila.correduriaId, fila.clienteId, 'Recaptación: baja de email por el propio cliente (enlace del correo)')
    return { estado: 'ok', yaEstaba: false }
  } catch (e) {
    console.error('[cartera-recaptacion] fallo aplicando la baja:', e instanceof Error ? e.message : e)
    return { estado: 'error', motivo: 'fallo_bd' }
  }
}

/** El texto sugerido para un lead concreto (WhatsApp), antes de que la IA lo pula. */
export function textoWhatsappPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): string {
  return textoBaseRecaptacionWhatsapp({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Ídem para email. */
export function textoEmailPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): { asunto: string; texto: string } {
  return textoBaseRecaptacionEmail({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Registra que Alberto abrió el enlace de WhatsApp de un lead. Deja fila en `historial_interno`. */
export async function registrarEnvioWhatsapp(
  correduriaId: string,
  entrada: { clienteId: string; polizaId: string; mensaje: string; actor: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({ where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true } })
  if (!cliente) return { ok: false, motivo: 'Esa ficha no es de esta correduría.' }
  await db.$executeRaw(Prisma.sql`
    insert into recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, creado_por)
    values (${correduriaId}::uuid, ${entrada.clienteId}::uuid, ${entrada.polizaId}::uuid, 'whatsapp', 'enlace_abierto', ${entrada.mensaje}, ${entrada.actor})
  `)
  await anotar(correduriaId, entrada.clienteId, `Recaptación: se abrió el enlace de WhatsApp (mensaje ya escrito) por ${entrada.actor}`)
  return { ok: true }
}

// ── Envío MANUAL por email (botón de plataforma) ──────────────────────────
//
// 🚨 Lo que este bloque cierra (20/09/2026): la ruta mandaba el correo a
// `body.email` y firmaba la auditoría con `body.actor`, los dos tal cual venían
// en el JSON. Comprobaba que el `clienteId` era de esta correduría y no volvía
// a mirarlo: con el Bearer de operador en la mano se podía escribir a CUALQUIER
// dirección, con asunto y texto libres, desde `envios.grupoasegura.es` (SPF y
// DKIM válidos) — o sea, phishing firmado por Grupo ASegura — y dejar la huella
// a nombre de quien se quisiera.
//
// Las tres reglas, y ninguna es cosmética:
//  1. **El destinatario sale de la FICHA** (`estadoEmailDeFicha`, la única regla
//     del repo sobre a qué correo se le escribe a un cliente: respeta la baja de
//     correo y distingue «ilegible» de «sin correo»). El del cuerpo solo
//     confirma lo que había en pantalla.
//  2. **El actor lo pone el servidor.** Este puerto se autentica con un secreto
//     compartido, no con una persona: lo único cierto es POR DÓNDE entró la
//     escritura. Escribir un nombre que manda el llamante es una pista de
//     auditoría falsificable, que es peor que no tenerla.
//  3. **La póliza se valida contra ESE cliente.** `recaptacion_envios` la
//     guarda, y una póliza de otro cliente ensuciaría el historial de los dos.

/**
 * Lo que se puede afirmar del autor de una escritura por `/api/operador/*`: el
 * canal, no la persona. Ver la regla 2 de arriba.
 */
export const ACTOR_PUERTO_OPERADOR = 'plataforma (puerto de operador)'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EnvioRecaptacionEmail =
  | { ok: true; destinatario: string }
  | {
      ok: false
      motivo:
        | 'ids_invalidos'
        | 'no_encontrado'
        | 'poliza_no_encontrada'
        | 'sin_email'
        | 'baja_de_correo'
        | 'ilegible'
        | 'destinatario_distinto'
        | 'sin_api_key'
        | 'rechazado'
      status: 404 | 422 | 502 | 503
      /** La dirección que resuelve la ficha, cuando la hay. Nunca la declarada. */
      resuelto: string | null
    }

/**
 * Manda UN correo de recaptación al cliente indicado y deja la huella
 * (`recaptacion_envios` + `historial_interno`). El texto ya viene pulido por la
 * ruta; aquí solo se decide A QUIÉN y se registra QUIÉN lo hizo.
 */
export async function enviarEmailRecaptacion(
  correduriaId: string,
  entrada: { clienteId: string; polizaId: string; emailDeclarado?: string | null; asunto: string; texto: string },
): Promise<EnvioRecaptacionEmail> {
  // Los ids se comprueban ANTES de consultar: un uuid mal formado hace que
  // Prisma lance, y ese 500 se leería como «la cartera no se puede leer»
  // (`lib/error-cartera.ts`) cuando lo que pasa es que el cuerpo está mal.
  if (!UUID.test(entrada.clienteId) || !UUID.test(entrada.polizaId)) {
    return { ok: false, motivo: 'ids_invalidos', status: 422, resuelto: null }
  }
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({
    where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { id: true },
  })
  if (!cliente) return { ok: false, motivo: 'no_encontrado', status: 404, resuelto: null }

  const poliza = await db.poliza.findFirst({
    where: { id: entrada.polizaId, correduriaId, clienteId: entrada.clienteId, mergedIntoPolizaId: null },
    select: { id: true },
  })
  if (!poliza) return { ok: false, motivo: 'poliza_no_encontrada', status: 404, resuelto: null }

  const destino = decidirDestinatarioRecaptacion(
    await estadoEmailDeFicha(correduriaId, entrada.clienteId),
    entrada.emailDeclarado,
  )
  if (!destino.ok) {
    // `no_encontrado` de la ficha es 404; el resto son datos del cliente que no
    // permiten escribirle, y cada uno se arregla en un sitio distinto (pedirle
    // el correo, respetar su baja, revisar `PII_ENCRYPTION_KEY` en Vercel).
    const status = destino.motivo === 'no_encontrado' ? 404 : 422
    return { ok: false, motivo: destino.motivo, status, resuelto: destino.resuelto }
  }

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;white-space:pre-line">${escaparHtmlLote(entrada.texto)}</div>`
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const resultado = await enviarEmailResend({ from, to: destino.to, asunto: entrada.asunto, texto: entrada.texto, html })
  if (!resultado.ok) {
    return {
      ok: false,
      motivo: resultado.motivo,
      // Falta la clave del proveedor (se arregla en Vercel) ≠ el proveedor
      // rechazó el mensaje (reintentar puede tener sentido). Misma separación
      // que `sin_correo_configurado` / `error_envio` del aviso de acceso.
      status: resultado.motivo === 'sin_api_key' ? 503 : 502,
      resuelto: destino.to,
    }
  }

  await db.$executeRaw(Prisma.sql`
    insert into recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, resend_message_id, creado_por)
    values (${correduriaId}::uuid, ${entrada.clienteId}::uuid, ${entrada.polizaId}::uuid, 'email', 'enviado', ${entrada.texto}, ${resultado.resendMessageId}, ${ACTOR_PUERTO_OPERADOR})
  `)
  await anotar(correduriaId, entrada.clienteId, `Recaptación: email enviado desde ${ACTOR_PUERTO_OPERADOR}`)
  return { ok: true, destinatario: destino.to }
}

// ── Envío en LOTE por email (cron diario) ─────────────────────────────────
//
// `candidatosLoteEmail` (selección pura) vive en `recaptacion-lote.ts` para
// poder testearse sin arrastrar Prisma. Tope de N por pasada (la volumetría
// del diseño: ~20-25/día) para no quemar cooldown ni reputación de envío.

export type ResumenLoteEmail = {
  candidatos: number
  enviados: number
  fallidos: number
  detalleFallos: string[]
  /** Leads descartados ESTA pasada por `descartarLeadsSilenciosos` (ver abajo). */
  descartadosPorSilencio: number
}

const ACTOR_CRON_SILENCIO = 'cron (recaptación: sin apertura tras varios intentos)'

/**
 * Descarta (borrado suave, igual que el botón "descartar" de la ficha) los
 * leads con `UMBRAL_SILENCIO` o más envíos de email y ninguna apertura/clic
 * — 21/09/2026, a petición de Alberto: "para desechar los que no abran el
 * mail porque lo mismo ya ni lo usan o esos mail ya ni existen".
 *
 * Al `activo=false` los saca `colaRecaptacion` (filtra `c.activo`) sin tocar
 * nada más: es la MISMA guarda que ya usa `descartarCliente` (ninguna póliza
 * viva), así que un lead con actividad real no se pierde por error.
 */
export async function descartarLeadsSilenciosos(correduriaId: string): Promise<number> {
  if (!aseguraConfigurada()) return 0
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ clienteId: string; enviosEmail: bigint; conApertura: boolean }[]>(Prisma.sql`
    select
      r.cliente_id as "clienteId",
      count(*) filter (where r.canal = 'email' and r.created_at >= ${SEGUIMIENTO_EMAIL_DESDE}::timestamp)::bigint as "enviosEmail",
      bool_or(r.canal = 'email' and r.estado in ('abierto', 'pinchado')) as "conApertura"
    from recaptacion_envios r
    join clientes c on c.id = r.cliente_id
    where r.correduria_id = ${correduriaId}::uuid and c.activo
    group by r.cliente_id
    having count(*) filter (where r.canal = 'email' and r.created_at >= ${SEGUIMIENTO_EMAIL_DESDE}::timestamp) >= ${UMBRAL_SILENCIO}
  `)

  let descartados = 0
  for (const f of filas) {
    if (!esLeadSilencioso(Number(f.enviosEmail), f.conApertura)) continue
    const r = await descartarCliente(correduriaId, f.clienteId, ACTOR_CRON_SILENCIO, `${f.enviosEmail} emails de recaptación sin abrir`)
    if (r.ok) descartados++
    // `!r.ok` es casi siempre `tiene_polizas_vivas` (un lead que se hizo cliente
    // entre medias): correcto no tocarlo, no es un fallo que haya que anotar.
  }
  return descartados
}

/**
 * Manda el lote de verdad. Sin IA (a diferencia del envío manual, que sí
 * pule con `pulirConIA`): con 25 llamadas seguidas a la pasarela, sumar hasta
 * 12s de timeout cada una se comería el `maxDuration` del cron; el texto base
 * determinista ya es un mensaje completo y correcto por sí solo (misma
 * garantía que si la IA fallara en el envío manual).
 *
 * Cada envío genera su propio `recaptacion_envios.id` ANTES de mandar el
 * correo, para poder embeber la URL de baja dentro del cuerpo — el mismo
 * truco que usa un webhook idempotente: el id existe antes del efecto.
 */
export async function enviarLoteEmail(
  correduriaId: string,
  opts: { limite?: number; actor: string },
): Promise<ResumenLoteEmail> {
  const vacio: ResumenLoteEmail = { candidatos: 0, enviados: 0, fallidos: 0, detalleFallos: [], descartadosPorSilencio: 0 }
  if (!aseguraConfigurada()) return vacio

  // Antes de elegir a quién escribir: sacar de la cola a quien lleva
  // UMBRAL_SILENCIO envíos sin abrir ninguno — si no, esta misma pasada
  // volvería a intentarlo (con el cooldown ya pasado hace tiempo).
  const descartadosPorSilencio = await descartarLeadsSilenciosos(correduriaId)

  const cola = await colaRecaptacion(correduriaId)
  const candidatos = candidatosLoteEmail(cola.leads, opts.limite ?? LIMITE_LOTE_POR_DEFECTO)
  if (candidatos.length === 0) return { ...vacio, candidatos: 0, descartadosPorSilencio }

  const db = prismaAsegura()
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const baseUrl = urlPublicaAsegura()

  let enviados = 0
  const detalleFallos: string[] = []
  for (const lead of candidatos) {
    if (!lead.email) continue
    const envioId = crypto.randomUUID()
    const bajaUrl = urlBaja(baseUrl, envioId)
    const { asunto, texto } = textoBaseRecaptacionEmail(
      { nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior },
      { bajaUrl },
    )
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;white-space:pre-line">${escaparHtmlLote(texto)}</div>`
    try {
      const resultado = await enviarEmailResend({ from, to: lead.email, asunto, texto, html })
      if (!resultado.ok) {
        detalleFallos.push(`${lead.cliente}: ${resultado.motivo}`)
        continue
      }
      await db.$executeRaw(Prisma.sql`
        insert into recaptacion_envios (id, correduria_id, cliente_id, poliza_id, canal, estado, mensaje, resend_message_id, creado_por)
        values (${envioId}::uuid, ${correduriaId}::uuid, ${lead.clienteId}::uuid, ${lead.polizaId}::uuid, 'email', 'enviado', ${texto}, ${resultado.resendMessageId}, ${opts.actor})
      `)
      await anotar(correduriaId, lead.clienteId, `Recaptación: email de lote enviado por ${opts.actor}`)
      enviados++
    } catch (e) {
      detalleFallos.push(`${lead.cliente}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return { candidatos: candidatos.length, enviados, fallidos: candidatos.length - enviados, detalleFallos, descartadosPorSilencio }
}

function escaparHtmlLote(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[cartera-recaptacion] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
