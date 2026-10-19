// lib/correo/lead-correduria.ts — el lead que ESCRIBE a hola@grupoasegura.es, en PURO (sin red, sin env).
//
// 19/10/2026: un lead escribió a hola@ pidiendo «comparativa de presupuestos para seguro»; el triaje lo
// mandó por IA a `leads-negocio` (que es de ia-rest/ialimp), avisó con «Oportunidad de negocio» y en la
// correduría no quedó NADA. Decisión de Alberto: lead → datos → presupuesto → seguimiento, sin que se
// escape nada. Aquí viven las reglas que se pueden probar sin levantar nada:
//   1. `esLeadCorreduria`: DETERMINISTA, sin IA. Destinatario público de la correduría + remitente
//      externo + correo que ABRE hilo (una respuesta a algo que escribió Alberto —una asociación, una
//      compañía nueva— no es un lead: sigue el camino de siempre).
//   2. `normalizarLeadCorreo`: lo que devuelve la IA se VALIDA contra el texto del correo. Lo que la IA
//      dice y el correo no contiene se descarta (null = no se sabe). Nunca se inventa un teléfono.
//   3. `cuerpoAltaLeadCorreo`: el alta por el MISMO puerto que la web, con `fuente: 'correo'`. Sin
//      prueba de consentimiento web (no hubo formulario): la base es la propia solicitud de la persona.
//   4. `plantillaPeticionDatos`: el texto FIJO por ramo para pedirle los datos. Solo texto: nada se envía.
//   5. `textoAvisoLeadCorreo`: el Telegram, con lo que se hizo y lo que NO.
//
// Test: `lib/correo/lead-correduria.test.ts`.

import { escapeHtml } from '@central/core-telegram'
import {
  MEDIADOR, RAMOS_OPORTUNIDAD, nombreDePila, normalizarEmail, normalizarNombre, normalizarTelefono,
  type RamoOportunidad,
} from '@central/module-seguros'
import { ASEGURADORAS } from './keywords.ts'
import type { ResultadoEscritura } from '../cliente-edicion-asegura.ts'

/** Actor con el que el triaje escribe en la cartera (asegura solo acepta `fuente:'correo'` de este actor). */
export const ACTOR_TRIAJE_CORREO = 'agente:triaje-correo'

// ─── 1. ¿Es un lead de la correduría? ────────────────────────────────────────

/** Dominio de los contactos públicos de la correduría, sacado de `MEDIADOR` (nunca a mano). */
export const DOMINIO_CORREDURIA = MEDIADOR.identidad.email.split('@')[1]
/** `grupoasegura.es` y su gemelo `.com` (dpo@, operaciones@…). */
const DOMINIOS_CORREDURIA = [DOMINIO_CORREDURIA, DOMINIO_CORREDURIA.replace(/\.es$/, '.com')]

const dominioDe = (e: string) => (e.split('@')[1] ?? '').toLowerCase()
const enDominio = (dom: string, base: string) => dom === base || dom.endsWith(`.${base}`)
const esDeCorreduria = (e: string) => DOMINIOS_CORREDURIA.some((d) => enDominio(dominioDe(e), d))

/**
 * Buzones automáticos: nunca son una persona pidiendo un seguro. Las marcas inequívocas (no-reply,
 * mailer-daemon, dmarc…) se buscan en CUALQUIER parte del local-part: `sc-noreply@google.com`,
 * `businessprofile-noreply@`, `messages-noreply@linkedin.com`, `dmarcreport@` (revisión 19/10/2026).
 */
const RE_BUZON_AUTOMATICO = /no-?reply|do-?not-?reply|mailer-daemon|dmarc|postmaster|bounce/i
/** Prefijos de buzón genérico que tampoco son una persona (anclados: «newsletter@», no «anews@»). */
const RE_BUZON_GENERICO = /^(notificaciones?|notifications?|alertas?|alerts?|newsletter|news|marketing|info-?mailing)\b/i

/**
 * ¿Lo ha mandado una máquina? Cabeceras crudas (`parsed.headerLines`): `List-Unsubscribe` (lista o
 * campaña), `Auto-Submitted` distinto de `no` (RFC 3834: autorespuestas, avisos) y `Precedence`
 * bulk/list/junk. Puro.
 */
export function esCorreoAutomatico(lineas: readonly { key: string; line: string }[] | undefined): boolean {
  for (const { key, line } of lineas ?? []) {
    const k = key.toLowerCase()
    const v = line.slice(line.indexOf(':') + 1).trim().toLowerCase()
    if (k === 'list-unsubscribe') return true
    if (k === 'auto-submitted' && v !== '' && v !== 'no') return true
    if (k === 'precedence' && /^(bulk|list|junk)\b/.test(v)) return true
  }
  return false
}

/** «código postal 41010» / «CP 41010» en el asunto de un lead: el regex de OTP del clasificador no lo puede tomar por un código. */
export const RE_CODIGO_POSTAL = /c[oó]d(igo|\.)?\s*postal|\bc\.?\s?p\.?\s*\d{5}\b/i

/** ¿El correo iba a un contacto público de la correduría (hola@grupoasegura.es, …)? */
export function esDestinoCorreduria(destinatarios: readonly string[] | undefined): boolean {
  return (destinatarios ?? []).some((d) => esDeCorreduria(d.toLowerCase()))
}

/**
 * Regla DETERMINISTA (sin IA) del lead de la correduría. Exige TODO a la vez:
 * - iba a un contacto público de la correduría (To/Cc/Delivered-To…);
 * - el remitente es de fuera: ni de la correduría, ni el propio buzón de Alberto, ni una aseguradora
 *   (esas las clasifica `keywords.ts` antes), ni un buzón automático (no-reply, mailer-daemon…);
 * - ABRE hilo (no es respuesta a nada). Una respuesta a un hilo de un lead se casa aparte
 *   (`esRespuestaDeLead`); una respuesta a algo que Alberto escribió (una asociación, un proveedor)
 *   no es un lead y sigue el camino de siempre.
 */
export function esLeadCorreduria(c: {
  from: string
  destinatarios?: readonly string[]
  referencias?: readonly string[]
  buzonPropio?: string | null
  /** `esCorreoAutomatico(cabeceras)`: lista, autorespuesta o envío masivo. */
  automatico?: boolean
}): boolean {
  const from = (c.from ?? '').trim().toLowerCase()
  if (!from.includes('@')) return false
  if (c.automatico) return false
  if (!esDestinoCorreduria(c.destinatarios)) return false
  if ((c.referencias ?? []).length > 0) return false
  if (esDeCorreduria(from)) return false
  if (c.buzonPropio && from === c.buzonPropio.trim().toLowerCase()) return false
  const dom = dominioDe(from)
  if (ASEGURADORAS.some((d) => enDominio(dom, d))) return false
  const local = from.split('@')[0]
  if (RE_BUZON_AUTOMATICO.test(local) || RE_BUZON_GENERICO.test(local)) return false
  return true
}

/**
 * ¿Es la respuesta del lead a un hilo que YA abrió como lead? `idsLead` = los Message-ID de sus
 * referencias que el triaje registró como `correduria-lead`. Un hilo = un lead: esto solo anota.
 */
export function esRespuestaDeLead(referencias: readonly string[] | undefined, idsLead: ReadonlySet<string>): boolean {
  return (referencias ?? []).some((r) => idsLead.has(r))
}

/** Nombre visible del remitente («"Ana Pérez" <ana@x.es>» → «Ana Pérez»). `null` si no hay o es un email. */
export function nombreVisible(fromRaw: string): string | null {
  const s = (fromRaw ?? '').replace(/<[^>]*>/g, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim()
  return s && !s.includes('@') ? s.slice(0, 120) : null
}

/** Prompt de extracción. La IA SOLO lee; lo que diga se comprueba contra el correo (`normalizarLeadCorreo`). */
export const PROMPT_EXTRAER_LEAD = [
  'Lees el correo de una persona que escribe a una correduría de seguros. Extrae SOLO lo que esté escrito en el correo.',
  'Si un dato no aparece, pon null. NUNCA inventes ni deduzcas un teléfono, un email o un nombre.',
  `Ramos posibles: ${RAMOS_OPORTUNIDAD.filter((r) => r !== 'otros').join(', ')}.`,
  'Responde SOLO con JSON, sin markdown:',
  '"es_lead" es true si es una persona que pide un seguro, un precio o información de seguros; false si es publicidad, spam,',
  'una oferta de servicios, un proveedor o una aseguradora.',
  '{"es_lead":true|false,"nombre":"nombre y apellidos o null","email":"o null","telefono":"o null","ramos":["..."],',
  ' "pide_presupuesto":true|false|null,"resumen":"una línea en español: qué quiere"}',
].join('\n')

// ─── 2. Lo que la IA saca del correo, validado ───────────────────────────────

/** Los ramos para los que hay plantilla propia de petición de datos. El resto, genérica. */
export type RamoPlantilla = 'hogar' | 'vida' | 'auto' | 'generico'

export type LeadCorreo = {
  /** Nombre tal cual aparece en el correo (firma o remitente). `null` = no consta. */
  nombre: string | null
  /** Email de contacto. Por defecto el REMITENTE; otro solo si está escrito en el correo. Se ENSEÑA; no identifica. */
  email: string | null
  /**
   * La dirección del From, normalizada: lo ÚNICO por lo que se casa con una ficha que ya existe (revisión
   * 19/10/2026). Un email o teléfono escrito en el cuerpo lo puede poner cualquiera: si identificase,
   * un tercero colgaría su petición en la ficha de un cliente real.
   */
  emailRemitente: string | null
  /** Teléfono escrito en el correo. `null` = no consta (nunca se deduce). */
  telefono: string | null
  /** Ramos de la oportunidad. `[]` = la IA no lo identificó (no «no quiere nada»). */
  ramos: RamoOportunidad[]
  /** `true` pide precio/presupuesto/comparativa; `false` dice explícitamente otra cosa; `null` = no se sabe. */
  pidePresupuesto: boolean | null
  /** Resumen en una línea. `null` = la IA no lo dio. */
  resumen: string | null
  /**
   * ¿Es una persona que pide un seguro? `false` = la IA lo lee como publicidad, spam o un proveedor
   * (un buzón público recibe de todo): NO se da de alta. `null` = la IA no respondió: se da de alta
   * igual (perder un lead es peor que descartar una ficha) y el aviso lo dice.
   */
  esLead: boolean | null
}

/** Sinónimos → ramo de oportunidad. Lo que no esté aquí ni sea un ramo exacto se ignora. */
const SINONIMOS_RAMO: Record<string, RamoOportunidad> = {
  coche: 'auto', automovil: 'auto', vehiculo: 'auto', turismo: 'auto', furgoneta: 'auto',
  motocicleta: 'moto', ciclomotor: 'moto',
  casa: 'hogar', vivienda: 'hogar', piso: 'hogar', hogar: 'hogar', multirriesgo: 'hogar',
  'vida riesgo': 'vida', hipoteca: 'vida',
  medico: 'salud', sanitario: 'salud',
  rc: 'responsabilidad_civil', 'responsabilidad civil': 'responsabilidad_civil',
  negocio: 'comercio', tienda: 'comercio', local: 'comercio',
  comunidad: 'comunidades', 'comunidad de propietarios': 'comunidades',
  perro: 'mascotas', mascota: 'mascotas',
  'impago de alquiler': 'impago_alquiler', alquiler: 'impago_alquiler',
  flota: 'flotas',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Un texto de ramo → ramo de oportunidad, o `null` si no se reconoce (nunca se cae a `otros`). */
export function ramoDeTexto(v: unknown): RamoOportunidad | null {
  if (typeof v !== 'string') return null
  const s = sinTildes(v).toLowerCase().trim().replace(/[\s-]+/g, ' ')
  if (!s) return null
  const exacto = RAMOS_OPORTUNIDAD.find((r) => r === s.replace(/ /g, '_'))
  if (exacto && exacto !== 'otros') return exacto
  return SINONIMOS_RAMO[s] ?? null
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')

function textoValido(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s || /^(null|n\/?a|desconocido|no consta|-+)$/i.test(s)) return null
  return s.slice(0, max)
}

/**
 * Lo que la IA devuelve → `LeadCorreo` validado. Cada dato que «afirma» la IA se COMPRUEBA en el
 * texto del correo (`ctx.texto` = asunto + cuerpo + remitente): un teléfono cuyos dígitos no están
 * en el correo, un email que no aparece o un nombre que no figura se descartan. La IA resume y
 * clasifica; los datos de contacto los pone el correo.
 */
export function normalizarLeadCorreo(raw: unknown, ctx: { texto: string; from: string; fromNombre: string | null }): LeadCorreo {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const texto = `${ctx.texto}\n${ctx.fromNombre ?? ''}`
  const textoMin = sinTildes(texto).toLowerCase()
  const digitosTexto = soloDigitos(texto)

  // Nombre: el que dé la IA si figura en el correo; si no, el nombre visible del remitente.
  let nombre: string | null = null
  for (const candidato of [o.nombre, ctx.fromNombre]) {
    const t = textoValido(candidato, 120)
    if (!t || t.includes('@')) continue
    if (!textoMin.includes(sinTildes(t).toLowerCase())) continue
    const r = normalizarNombre(t, 'nombre')
    if (r.ok) { nombre = r.valor; break }
  }

  const remitente = ctx.from && !esDeCorreduria(ctx.from.toLowerCase()) ? normalizarEmail(ctx.from) : null
  const emailRemitente = remitente?.ok ? remitente.valor : null

  // Email: el del remitente es un HECHO; el de la IA solo si está escrito en el correo.
  let email: string | null = null
  const deIa = textoValido(o.email, 200)
  for (const candidato of [deIa && textoMin.includes(deIa.toLowerCase()) ? deIa : null, ctx.from]) {
    if (!candidato) continue
    if (esDeCorreduria(candidato.toLowerCase())) continue
    const r = normalizarEmail(candidato)
    if (r.ok) { email = r.valor; break }
  }

  // Teléfono: solo si sus dígitos están en el correo (el de la firma, por ejemplo).
  let telefono: string | null = null
  const tel = textoValido(o.telefono, 40)
  if (tel) {
    const d = soloDigitos(tel).replace(/^(0034|34)(?=\d{9}$)/, '')
    if (d.length >= 9 && digitosTexto.includes(d)) {
      const r = normalizarTelefono(tel)
      if (r.ok && !esTelefonoCorreduria(r.valor)) telefono = r.valor
    }
  }

  const listaRamos = Array.isArray(o.ramos) ? o.ramos : o.ramo !== undefined ? [o.ramo] : []
  const ramos = [...new Set(listaRamos.map(ramoDeTexto).filter((r): r is RamoOportunidad => r !== null))].slice(0, 3)

  const pide = o.pide_presupuesto ?? o.pidePresupuesto
  const pidePresupuesto = pide === true || pide === 'true' ? true : pide === false || pide === 'false' ? false : null

  const esLead = o.es_lead === true || o.es_lead === 'true' ? true : o.es_lead === false || o.es_lead === 'false' ? false : null

  return { nombre, email, emailRemitente, telefono, ramos, pidePresupuesto, resumen: textoValido(o.resumen, 300), esLead }
}

function esTelefonoCorreduria(t: string): boolean {
  return soloDigitos(t).slice(-9) === soloDigitos(MEDIADOR.identidad.telefono).slice(-9)
}

/** ¿Se puede dar de alta? El puerto exige nombre y un dato para volver a encontrarla (email o teléfono). */
export function motivoSinAlta(l: LeadCorreo): string | null {
  if (l.esLead === false) return 'no parece alguien pidiendo un seguro (publicidad, spam o proveedor): si lo es, dale de alta a mano'
  // Solo con un SÍ de la IA (revisión 19/10/2026): con `null` (IA caída o sin respuesta) no se escribe
  // en la cartera; el aviso sale igual y Alberto decide.
  if (l.esLead !== true) return 'la IA no ha podido confirmar que sea alguien pidiendo un seguro: si lo es, dale de alta a mano'
  if (!l.nombre) return 'no consta el nombre en el correo'
  if (!l.emailRemitente) return 'no se ha podido leer la dirección del remitente'
  return null
}

// ─── 3. El alta (mismo puerto que la web) ────────────────────────────────────

const ETIQUETA_RAMO: Partial<Record<RamoOportunidad, string>> = {
  auto: 'auto', moto: 'moto', hogar: 'hogar', vida: 'vida', salud: 'salud', decesos: 'decesos',
  responsabilidad_civil: 'responsabilidad civil', comercio: 'comercio', comunidades: 'comunidades',
  mascotas: 'mascotas', impago_alquiler: 'impago de alquiler', flotas: 'flota',
}
export const etiquetaRamo = (r: RamoOportunidad) => ETIQUETA_RAMO[r] ?? r.replace(/_/g, ' ')

/** `notas` de la ficha y texto del historial: qué pidió, por dónde. */
export function notasLeadCorreo(l: LeadCorreo, asunto: string): string {
  const quiere = l.ramos.length > 0 ? `Quiere: ${l.ramos.map(etiquetaRamo).join(', ')}.` : 'Ramo sin identificar.'
  const resumen = l.resumen ? ` ${l.resumen}` : ''
  return `${quiere}${resumen} (correo a ${MEDIADOR.identidad.email}: «${asunto.slice(0, 120)}»)`.slice(0, 1000)
}

/**
 * Cuerpo de `POST /api/operador/cliente`. Sin `consentimiento`: no hubo formulario (asegura solo escribe
 * `consent_logs` con `fuente:'web'`). El email es el del REMITENTE (identifica); el teléfono del cuerpo
 * viaja como contacto de la ficha NUEVA, pero si casa con otra ficha `resolverAltaLeadCorreo` lo manda a
 * revisar a mano. Un email distinto escrito en el cuerpo va a las notas, no al índice.
 */
export function cuerpoAltaLeadCorreo(l: LeadCorreo, asunto: string): Record<string, unknown> {
  const otroEmail = l.email && l.email !== l.emailRemitente ? ` Email que da en el correo: ${l.email}.` : ''
  return {
    nombre: l.nombre,
    apellidos: '',
    telefono: l.telefono,
    email: l.emailRemitente,
    notas: `${notasLeadCorreo(l, asunto)}${otroEmail}`.slice(0, 1000),
    fuente: 'correo',
    actor: ACTOR_TRIAJE_CORREO,
  }
}

/** Historial `contacto` en una ficha que YA existía (o en la respuesta del hilo). */
export function textoHistorialLeadCorreo(l: LeadCorreo, asunto: string, respuesta: boolean): string {
  const contacto = [l.telefono ? `Tel. ${l.telefono}` : null, l.email ? `Email ${l.email}` : null].filter(Boolean).join(' · ')
  const que = respuesta ? 'Respuesta por correo en el hilo del lead' : 'Contacto por correo'
  return `${que}${l.nombre ? ` (${l.nombre})` : ''}: ${notasLeadCorreo(l, asunto)}${contacto ? ` · ${contacto}` : ''}`.slice(0, 2000)
}

/** Fecha `YYYY-MM-DD` en Madrid (el primer paso de la oportunidad es HOY). */
export function hoyMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/**
 * Cuerpo de `POST /api/operador/oportunidad {accion:'crear'}`. Nace «interesado» (pidió precio) con
 * primer paso `email` HOY: pedirle los datos. `fuente:'correo'` solo la acepta asegura de este actor.
 */
export function cuerpoOportunidadLeadCorreo(clienteId: string, ramo: RamoOportunidad, l: LeadCorreo, ahora: Date): Record<string, unknown> {
  return {
    accion: 'crear',
    clienteId,
    ramo,
    estado: 'en_negociacion',
    tipoTarea: 'email',
    fechaTarea: hoyMadrid(ahora),
    nota: `Lead por correo: pedirle los datos de ${etiquetaRamo(ramo)} para tarificar.${l.resumen ? ` ${l.resumen}` : ''}`.slice(0, 2000),
    fuente: 'correo',
    actor: ACTOR_TRIAJE_CORREO,
  }
}

// ─── 4. La petición de datos (plantilla FIJA por ramo; nada se envía) ────────

export function ramoPlantilla(ramos: readonly RamoOportunidad[]): RamoPlantilla {
  if (ramos.length !== 1) return 'generico'
  const r = ramos[0]
  if (r === 'hogar') return 'hogar'
  if (r === 'vida') return 'vida'
  if (r === 'auto' || r === 'moto') return 'auto'
  return 'generico'
}

const DATOS_POR_RAMO: Record<RamoPlantilla, readonly string[]> = {
  hogar: [
    'Dirección completa de la vivienda (calle, número, piso y código postal).',
    'Metros cuadrados construidos.',
    'Año de construcción (aproximado si no lo sabes).',
    'Si es tu vivienda habitual o una segunda residencia (o si está alquilada).',
    'Qué quieres asegurar: continente (la construcción), contenido (muebles y enseres) o ambos, y por qué importe aproximado.',
    'Si tiene hipoteca y con qué banco.',
    'Si ya tienes un seguro: compañía, precio actual y fecha de vencimiento.',
  ],
  vida: [
    'Fecha de nacimiento de cada persona a asegurar.',
    'Capital que quieres asegurar.',
    'Si está ligado a una hipoteca: banco y capital pendiente.',
    'Profesión y si fumas (influye en el precio).',
    'Si ya tienes un seguro: compañía, precio actual y fecha de vencimiento.',
  ],
  auto: [
    'Matrícula del vehículo.',
    'Fecha de expedición del carné de conducir del conductor principal.',
    'Fecha de nacimiento del conductor principal.',
    'Código postal donde duerme el vehículo.',
    'Si ya tienes un seguro: compañía, precio actual, fecha de vencimiento y años sin siniestros.',
  ],
  generico: [
    'Qué quieres asegurar y para qué (cuéntamelo con tus palabras).',
    'Tu código postal.',
    'Un teléfono por si es más rápido llamarte.',
    'Si ya tienes un seguro: compañía, precio actual y fecha de vencimiento.',
  ],
}

const INTRO_RAMO: Record<RamoPlantilla, string> = {
  hogar: 'Para prepararte una comparativa del seguro de hogar entre varias compañías necesito estos datos:',
  vida: 'Para prepararte una comparativa del seguro de vida entre varias compañías necesito estos datos:',
  auto: 'Para prepararte una comparativa del seguro del vehículo entre varias compañías necesito estos datos:',
  generico: 'Para prepararte una propuesta necesito que me cuentes un poco más:',
}

/**
 * Pie legal del correo: identidad del mediador, registro DGSFP y RGPD. TODO sale de `MEDIADOR`
 * (`@central/module-seguros`), nunca a mano; la política es la de la web pública.
 */
export function pieLegalLeadCorreo(): string {
  const m = MEDIADOR.identidad
  return [
    '--',
    `${m.nombre} · ${MEDIADOR.marca}`,
    `${m.figura}, inscrito en el Registro Administrativo de Distribuidores de Seguros de la DGSFP con la clave ${m.claveDgsfp}. NIF ${m.nif}. ${m.domicilio}.`,
    `${m.email} · ${m.web}`,
    '',
    `Protección de datos: el responsable es ${m.nombre}. Trataremos los datos que nos facilites solo para estudiar y preparar la propuesta de seguro que nos pides (medidas precontractuales a petición tuya); para presupuestarla podemos compartirlos con las aseguradoras que coticen. Puedes ejercer tus derechos de acceso, rectificación, supresión y demás escribiendo a ${m.email}. Más información: ${m.web}/legal/privacidad`,
  ].join('\n')
}

/** Asunto y cuerpo del BORRADOR de respuesta. Texto fijo; solo cambia el saludo (nombre de pila) y el ramo. */
export function plantillaPeticionDatos(l: Pick<LeadCorreo, 'nombre' | 'ramos'>, asuntoOriginal: string): { asunto: string; cuerpo: string; ramo: RamoPlantilla } {
  const ramo = ramoPlantilla(l.ramos)
  const pila = l.nombre ? nombreDePila(l.nombre) : null
  const asunto = /^\s*re:/i.test(asuntoOriginal) ? asuntoOriginal.trim() : `Re: ${asuntoOriginal.trim()}`
  const cuerpo = [
    pila ? `Hola ${pila}:` : 'Hola:',
    '',
    `Gracias por escribirnos. Soy ${MEDIADOR.identidad.nombre.split(' ')[0]}, de ${MEDIADOR.marca}, y seré tu persona de contacto.`,
    '',
    INTRO_RAMO[ramo],
    '',
    ...DATOS_POR_RAMO[ramo].map((d) => `- ${d}`),
    '',
    'Con eso te preparo la propuesta y te la envío. Si lo prefieres, dime a qué hora te viene bien que te llame.',
    '',
    'Un saludo,',
    '',
    pieLegalLeadCorreo(),
  ].join('\n')
  return { asunto: asunto.slice(0, 200), cuerpo, ramo }
}

// ─── 5. El aviso de Telegram ─────────────────────────────────────────────────

/** Qué pasó con la ficha: nueva · ya existía · casa con OTRA ficha (revisar a mano) · no se registró. */
export type FichaLeadCorreo =
  | { estado: 'nueva'; id: string; url: string }
  | { estado: 'existente'; id: string; nombre: string; url: string; historial: boolean }
  | { estado: 'revisar'; fichas: { id: string; nombre: string; url: string }[]; motivo: string }
  | { estado: 'no_registrado'; motivo: string }

/** Respuesta del alta → qué hacer. Puro: la escritura ya interpretada (`interpretarEscritura`) + el status. */
export type AltaLeadCorreo =
  | { estado: 'nueva'; id: string }
  | { estado: 'existente'; id: string; nombre: string }
  | { estado: 'revisar'; fichas: { id: string; nombre: string }[]; motivo: string }
  | { estado: 'no_registrado'; motivo: string }

/**
 * Se casa con una ficha que ya existe SOLO si la coincidencia es por el email del REMITENTE (el único
 * dato que viaja como `email` en el alta) y todo lo demás que coincide es esa misma ficha. Si el
 * teléfono del cuerpo cae en otra ficha (o solo coincide el teléfono), es «revisar a mano»: ni historial
 * ni oportunidad en una ficha que quizá es de otra persona.
 */
export function resolverAltaLeadCorreo(status: number, json: unknown, r: ResultadoEscritura): AltaLeadCorreo {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (status === 429 || o.estado === 'tope') return { estado: 'no_registrado', motivo: typeof o.motivo === 'string' ? o.motivo : 'tope diario de altas por correo' }
  switch (r.estado) {
    case 'ok':
      return r.id ? { estado: 'nueva', id: r.id } : { estado: 'no_registrado', motivo: 'el puerto dijo ok sin devolver el id de la ficha' }
    case 'conflicto': {
      const porEmail = new Map(r.coincidencias.filter((c) => c.por === 'email').map((c) => [c.id, c.nombre]))
      const otras = r.coincidencias.filter((c) => !porEmail.has(c.id))
      if (r.forzable && porEmail.size === 1 && otras.length === 0) {
        const [[id, nombre]] = [...porEmail]
        return { estado: 'existente', id, nombre }
      }
      const fichas = [...new Map(r.coincidencias.map((c) => [c.id, c.nombre]))].map(([id, nombre]) => ({ id, nombre }))
      return {
        estado: 'revisar',
        fichas,
        motivo: porEmail.size > 1 ? 'el email del remitente está en varias fichas' : 'el teléfono o el DNI del correo ya está en otra ficha',
      }
    }
    case 'invalido':
      return { estado: 'no_registrado', motivo: r.motivo }
    case 'no_encontrado':
      return { estado: 'no_registrado', motivo: 'el puerto no encontró la correduría' }
    case 'sin_configurar':
      return { estado: 'no_registrado', motivo: 'puerto sin configurar (ASEGURA_OPERADOR_SECRET)' }
    case 'error':
      return { estado: 'no_registrado', motivo: r.motivo }
  }
}

export type OportunidadLeadCorreo = { ramo: RamoOportunidad; estado: 'abierta' | 'ya_abierta' | 'tope' | 'error'; motivo?: string }

/**
 * HTML de Telegram. Todo lo que viene del correo pasa por `escapeHtml`. Dice lo que se hizo Y lo que no:
 * la petición de datos es un TEXTO para copiar (no hay borrador en Gmail: no existe ese mecanismo) y
 * nada ha salido hacia el lead.
 */
export function textoAvisoLeadCorreo(a: {
  remitente: string
  asunto: string
  lead: LeadCorreo
  ficha: FichaLeadCorreo
  oportunidades: readonly OportunidadLeadCorreo[]
  plantilla: { asunto: string; cuerpo: string } | null
  respuesta?: boolean
}): string {
  const l = a.lead
  const lineas = [
    a.respuesta
      ? '🛡️ <b>Respuesta de un lead por correo · Grupo ASegura</b>'
      : l.esLead === false
        ? '📬 <b>Correo a hola@ que no parece un lead · Grupo ASegura</b>'
        : '🛡️ <b>Lead nuevo por correo (hola@) · Grupo ASegura</b>',
    `👤 <b>${escapeHtml(l.nombre ?? a.remitente)}</b>${l.ramos.length ? ` · quiere <b>${escapeHtml(l.ramos.map(etiquetaRamo).join(', '))}</b>` : ' · ramo sin identificar'}`,
    escapeHtml(a.asunto.slice(0, 200)),
  ]
  if (l.resumen) lineas.push(`🤖 ${escapeHtml(l.resumen)}`)
  if (l.esLead === null && !a.respuesta) lineas.push('🤖 La IA no ha podido confirmar que sea un lead: no se ha tocado la cartera.')
  if (l.telefono) lineas.push(`📞 ${escapeHtml(l.telefono)}`)
  if (l.email) lineas.push(`✉️ ${escapeHtml(l.email)}`)
  const f = a.ficha
  if (f.estado === 'nueva') lineas.push(`🆕 Ficha nueva (lead, fuente correo): <a href="${escapeHtml(f.url)}">abrir ficha</a>`)
  else if (f.estado === 'existente') {
    lineas.push(`♻️ Ya estaba en la cartera como <b>${escapeHtml(f.nombre)}</b>: <a href="${escapeHtml(f.url)}">abrir ficha</a>`)
    if (!f.historial) lineas.push('⚠️ El contacto NO ha quedado anotado en su historial.')
  } else if (f.estado === 'revisar') {
    lineas.push(`⚠️ <b>Revisar a mano</b>: ${escapeHtml(f.motivo)}. No se ha anotado nada ni abierto oportunidad.`)
    for (const x of f.fichas.slice(0, 3)) lineas.push(`   · <a href="${escapeHtml(x.url)}">${escapeHtml(x.nombre)}</a>`)
  } else {
    lineas.push(`⚠️ <b>NO se ha registrado en la cartera</b> (${escapeHtml(f.motivo)}). Este aviso es el único rastro: dale de alta a mano.`)
  }
  for (const o of a.oportunidades) {
    const r = escapeHtml(etiquetaRamo(o.ramo))
    if (o.estado === 'abierta') lineas.push(`📌 Oportunidad de ${r} abierta, primer paso hoy: pedirle los datos.`)
    else if (o.estado === 'ya_abierta') lineas.push(`📌 Ya tenía una oportunidad de ${r} abierta: no se ha duplicado.`)
    else if (o.estado === 'tope') lineas.push(`⚠️ Tope diario de oportunidades por correo: la de ${r} NO se ha abierto.`)
    else lineas.push(`⚠️ La oportunidad de ${r} NO se ha abierto${o.motivo ? ` (${escapeHtml(o.motivo)})` : ''}.`)
  }
  if (a.plantilla) {
    lineas.push('📝 Petición de datos lista para copiar en el mensaje siguiente (no hay borrador en Gmail; NO se ha enviado nada al lead).')
  } else if (!a.respuesta) {
    lineas.push('📝 Sin petición de datos: no parece un lead.')
  }
  return lineas.join('\n')
}

/**
 * La plantilla va en un SEGUNDO mensaje a propósito: si Telegram rechazara este (HTML, longitud), el
 * aviso principal —que es el que no se puede perder— ya ha salido.
 */
export function textoPlantillaTelegram(p: { asunto: string; cuerpo: string }): string {
  return `📝 <b>Petición de datos (copiar y responder desde ${escapeHtml(MEDIADOR.identidad.email)})</b>\n<blockquote expandable>${escapeHtml(`Asunto: ${p.asunto}\n\n${p.cuerpo}`.slice(0, 3400))}</blockquote>`
}

// ─── 6. Presupuesto de tiempo de la pasada (revisión 19/10/2026) ─────────────
//
// Un lead cuesta hasta ~110 s (IA de extracción + alta + historial + oportunidades + dos avisos) y la
// función del triaje muere a los 300 s: un correo a medias se quedaría `pendiente` y el dedupe lo
// saltaría para siempre, sin aviso. Por eso un lead NO se empieza pasados `LEAD_HASTA_MS` ni más de
// `LEADS_POR_PASADA` por pasada, y ningún correo nuevo pasados `CORREO_HASTA_MS`: se DIFIERE (su fila se
// borra y el cursor se queda justo antes), y la pasada siguiente —10 min— lo coge entero.
export const LEADS_POR_PASADA = 2
export const LEAD_HASTA_MS = 170_000
export const CORREO_HASTA_MS = 200_000

export function diferirCorreo(transcurridoMs: number): boolean {
  return transcurridoMs > CORREO_HASTA_MS
}
export function diferirLead(transcurridoMs: number, leadsHechos: number): boolean {
  return leadsHechos >= LEADS_POR_PASADA || transcurridoMs > LEAD_HASTA_MS
}
/** El cursor nunca pasa de un correo diferido: queda en el UID anterior para que se relea. */
export function cursorTrasPasada(maxUid: number, uidDiferido: number | null): number {
  return uidDiferido == null ? maxUid : Math.min(maxUid, uidDiferido - 1)
}
