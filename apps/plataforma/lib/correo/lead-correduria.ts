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
//   4. `plantillaPeticionDatos`: el texto para pedirle los datos, SOLO lo que falta, desde el contrato único por ramo
//      (`peticionDatos` de `@central/module-seguros`). Aquí solo se redacta: enviarlo exige el ✅ de Alberto
//      (`lead-correduria-peticion.ts`).
//   5. `textoAvisoLeadCorreo`: el Telegram, con lo que se hizo y lo que NO.
//
// Test: `lib/correo/lead-correduria.test.ts`.

import { escapeHtml } from '@central/core-telegram'
import {
  MEDIADOR, RAMOS_OPORTUNIDAD, nombreDePila, normalizarEmail, normalizarNombre, normalizarTelefono, peticionDatos,
  referenciasCatastralesEn, type RamoOportunidad,
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
 * ¿Es el ECO de nuestra propia respuesta a un lead? (19/10/2026) La petición de datos sale por Resend con copia oculta
 * a hola@ (lo de Resend no aparece en «Enviados» de Gmail): esa copia vuelve al buzón. Para silenciarla hacen falta LAS
 * DOS cosas (revisión 19/10/2026): el From es EXACTAMENTE nuestro remitente (`remitenteCorreo(ASEGURA_MAIL_FROM)`, no
 * «cualquiera del dominio»: una respuesta de Manuel o un From falsificado no se callan) y sus referencias casan con un
 * `correduria-lead` registrado (`esRespuestaDeLead`). Lo que no cumpla ambas sigue su camino y avisa. PURA.
 */
export function esEcoPropioCorreduria(c: { from: string; remitentePropio: string; casaConLead: boolean }): boolean {
  const from = (c.from ?? '').trim().toLowerCase()
  const propio = (c.remitentePropio.match(/<([^>]+)>/)?.[1] ?? c.remitentePropio).trim().toLowerCase()
  return from.includes('@') && propio.includes('@') && from === propio && c.casaConLead
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
  '"ramos" es una LISTA con TODOS los seguros que pide (p. ej. ["hogar","vida"]), cada uno con una palabra de la lista de ramos.',
  '"datos" recoge SOLO lo que el correo dice LITERALMENTE (copia el texto tal cual), si aparece; si no, omítelo:',
  '  capital (importe a asegurar), duracion_anios (años), ocupacion (vivienda habitual / segunda residencia / alquilada),',
  '  cp (código postal de lo que asegura), matricula, metros (m² de la vivienda), anio_construccion.',
  '{"es_lead":true|false,"nombre":"nombre y apellidos o null","email":"o null","telefono":"o null","ramos":["..."],',
  ' "pide_presupuesto":true|false|null,"resumen":"una línea en español: qué quiere","datos":{"capital":"..."}}',
].join('\n')

// ─── 2. Lo que la IA saca del correo, validado ───────────────────────────────


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
  /**
   * Claves del contrato de datos (`contratoDatos`) que el correo YA responde (19/10/2026): la IA las señala y cada una
   * se comprueba en el texto (como el teléfono). Solo sirven para NO volver a preguntarlas; no se escriben en la
   * cartera (eso es la F2). `undefined` = no se miró.
   */
  datosDados?: string[]
  /** Referencias catastrales VÁLIDAS (control correcto) escritas en el correo. Deterministas, sin IA. */
  referenciasCatastrales?: string[]
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
  'patinete electrico': 'patinete', vmp: 'patinete',
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Un texto de ramo → ramo de oportunidad, o `null` si no se reconoce (nunca se cae a `otros`). Tolera lo que la IA
 * devuelve de verdad (19/10/2026, lead de hogar + vida que salió con la plantilla GENÉRICA): «Seguro de hogar»,
 * «Vida (hipoteca)», «seguro del coche».
 */
export function ramoDeTexto(v: unknown): RamoOportunidad | null {
  if (typeof v !== 'string') return null
  const s = sinTildes(v).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z_ ]+/g, ' ').trim()
    .replace(/^(un |el |la )?seguros? (de |del |para )?(la |el |mi |una |un )?/, '').replace(/[\s-]+/g, ' ').trim()
  if (!s) return null
  const exacto = RAMOS_OPORTUNIDAD.find((r) => r === s.replace(/ /g, '_'))
  if (exacto && exacto !== 'otros') return exacto
  return SINONIMOS_RAMO[s] ?? null
}

/** Lo que la IA da como ramos: lista, o un texto «hogar y vida», «hogar, vida». */
function listaRamosIa(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === 'string' ? x.split(/\s*(?:,|;|\/|\by\b|\+)\s*/) : [x]))
  if (typeof v === 'string') return v.split(/\s*(?:,|;|\/|\by\b|\+)\s*/)
  return []
}

/**
 * Ramos que el correo nombra SIN DUDA, sin IA: «seguro de hogar», «seguro de vida», «vida … hipoteca», «seguro del
 * coche»… Frases, no palabras sueltas («vida» sola sale en cualquier saludo). Si la IA cae o se deja uno, el correo
 * manda. PURA.
 */
const RAMOS_POR_FRASE: Array<[RegExp, RamoOportunidad]> = [
  [/\bseguros? (de |del |para )?(el |la |mi |una |un )?(hogar|casa|vivienda|piso)\b|\bmultirriesgo (de )?hogar\b|\bseguro de hogar\b/, 'hogar'],
  [/\bseguros? de vida\b|\bvida\b[^.]{0,60}\bhipoteca\b|\bhipoteca\b[^.]{0,60}\b(seguro de )?vida\b/, 'vida'],
  [/\bseguros? (de |del |para )?(el |mi |un )?(coche|automovil|vehiculo|turismo|furgoneta)\b/, 'auto'],
  [/\bseguros? (de |para )?(la |mi |una )?(moto|motocicleta|ciclomotor|scooter)\b/, 'moto'],
  [/\bseguros? (de |medico|privado de )?salud\b|\bseguro medico\b/, 'salud'],
  [/\bseguros? de decesos\b|\bdecesos\b/, 'decesos'],
  [/\bcomunidad de (propietarios|vecinos)\b/, 'comunidades'],
]
export function ramosDelTexto(texto: string): RamoOportunidad[] {
  const t = sinTildes(texto ?? '').toLowerCase().replace(/\s+/g, ' ')
  return RAMOS_POR_FRASE.filter(([re]) => re.test(t)).map(([, r]) => r)
}

/** Datos que la IA dice que el correo trae → clave del contrato. Solo estos; el resto se ignora. */
const DATO_A_CLAVE: Record<string, { claves: string[]; tipo: 'numero' | 'texto' }> = {
  capital: { claves: ['capital'], tipo: 'numero' },
  duracion_anios: { claves: ['duracionAnios'], tipo: 'numero' },
  ocupacion: { claves: ['ocupacion'], tipo: 'texto' },
  cp: { claves: ['cp'], tipo: 'numero' },
  matricula: { claves: ['matricula'], tipo: 'texto' },
  metros: { claves: ['metrosCuadrados'], tipo: 'numero' },
  anio_construccion: { claves: ['anioConstruccion'], tipo: 'numero' },
}

/**
 * Claves que el correo YA responde. Cada valor que da la IA se COMPRUEBA en el texto: un número, por sus cifras
 * («90.000€» → 90000 tiene que estar); un texto, tal cual (sin tildes ni mayúsculas). Lo que no está, no cuenta. PURA.
 */
export function datosDadosEnCorreo(raw: unknown, texto: string): string[] {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const t = sinTildes(texto).toLowerCase()
  const cifras = texto.replace(/(\d)[.\s](?=\d{3}\b)/g, '$1')
  const out = new Set<string>()
  for (const [k, def] of Object.entries(DATO_A_CLAVE)) {
    const v = o[k]
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
    if (!s || s.length > 80) continue
    let esta = false
    if (def.tipo === 'numero') {
      const d = s.replace(/(\d)[.\s](?=\d{3}\b)/g, '$1').match(/\d+/)?.[0]
      esta = !!d && new RegExp(`(?<!\\d)${d}(?!\\d)`).test(cifras)
    } else {
      const n = sinTildes(s).toLowerCase().replace(/\s+/g, ' ')
      esta = n.length >= 4 && t.replace(/\s+/g, ' ').includes(n)
    }
    if (esta) for (const c of def.claves) out.add(c)
  }
  return [...out]
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

  // Los ramos: lo que diga la IA (tolerante) ∪ lo que el correo nombra sin duda. Un lead de hogar Y vida salió el
  // 19/10/2026 con la petición GENÉRICA: la IA no los dio en la forma exacta y dos ramos caían a «genérico».
  const listaRamos = listaRamosIa(o.ramos ?? o.ramo)
  const ramosIa = listaRamos.map(ramoDeTexto).filter((r): r is RamoOportunidad => r !== null)
  const ramos = [...new Set([...ramosIa, ...ramosDelTexto(ctx.texto)])].slice(0, 3)

  const pide = o.pide_presupuesto ?? o.pidePresupuesto
  const pidePresupuesto = pide === true || pide === 'true' ? true : pide === false || pide === 'false' ? false : null

  const esLead = o.es_lead === true || o.es_lead === 'true' ? true : o.es_lead === false || o.es_lead === 'false' ? false : null

  return {
    nombre, email, emailRemitente, telefono, ramos, pidePresupuesto, resumen: textoValido(o.resumen, 300), esLead,
    datosDados: datosDadosEnCorreo(o.datos, ctx.texto),
    referenciasCatastrales: referenciasCatastralesEn(ctx.texto).slice(0, 3),
  }
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
  patinete: 'patinete (VMP)',
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

// ─── 4. La petición de datos (desde el contrato único; SOLO lo que falta) ───

/**
 * Lo que ya se sabe del lead por su correo, en claves del contrato: nombre (con 3+ palabras se dan por dados los dos
 * apellidos; con 2, el primero), teléfono, email y lo que `datosDadosEnCorreo` comprobó. PURA.
 */
export function conocidosDelLead(l: Pick<LeadCorreo, 'nombre' | 'telefono' | 'email' | 'datosDados' | 'referenciasCatastrales'>): Set<string> {
  const s = new Set<string>(l.datosDados ?? [])
  const palabras = (l.nombre ?? '').trim().split(/\s+/).filter(Boolean).length
  if (palabras >= 1) s.add('nombre')
  if (palabras >= 2) s.add('apellido1')
  if (palabras >= 3) s.add('apellido2')
  if (l.telefono) s.add('telefono')
  if (l.email) s.add('email')
  if (l.referenciasCatastrales?.length) s.add('referenciaCatastral')
  return s
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

/**
 * Asunto y cuerpo del BORRADOR de respuesta: las preguntas del contrato (`peticionDatos`) que FALTAN, agrupadas por
 * ramo si pide varios. `conocidos` = claves que ya se saben (las del correo + lo que trajo el Catastro). Solo cambia
 * el saludo (nombre de pila); el pie legal y el aviso RGPD salen de `MEDIADOR`. Sin preguntas pendientes (raro), se
 * dice que con lo que mandó basta y se le preparará la propuesta.
 */
export function plantillaPeticionDatos(
  l: Pick<LeadCorreo, 'nombre' | 'ramos'> & Partial<Pick<LeadCorreo, 'telefono' | 'email' | 'datosDados' | 'referenciasCatastrales'>>,
  asuntoOriginal: string,
  conocidos: ReadonlySet<string> = conocidosDelLead({ nombre: l.nombre, telefono: l.telefono ?? null, email: l.email ?? null, datosDados: l.datosDados, referenciasCatastrales: l.referenciasCatastrales }),
): { asunto: string; cuerpo: string; ramos: RamoOportunidad[]; preguntas: number } {
  const pila = l.nombre ? nombreDePila(l.nombre) : null
  const asunto = /^\s*re:/i.test(asuntoOriginal) ? asuntoOriginal.trim() : `Re: ${asuntoOriginal.trim()}`
  const bloques = peticionDatos(l.ramos, conocidos)
  const queRamos = l.ramos.length ? l.ramos.map(etiquetaRamo).join(' y ') : null
  const intro = !queRamos
    ? 'Para prepararte una propuesta necesito que me cuentes un poco más:'
    : `Para prepararte una comparativa del seguro de ${queRamos} entre varias compañías${conocidos.size ? ', además de lo que ya me has contado,' : ''} necesito estos datos:`
  const cuerpoPreguntas = bloques.length === 0
    ? ['Con lo que me has enviado tengo lo necesario para empezar.']
    : [intro, ...bloques.flatMap((b) => ['', ...(b.titulo ? [`${b.titulo}:`] : []), ...b.preguntas.map((p) => `- ${p}`)])]
  const cuerpo = [
    pila ? `Hola ${pila}:` : 'Hola:',
    '',
    `Gracias por escribirnos. Soy ${MEDIADOR.identidad.nombre.split(' ')[0]}, de ${MEDIADOR.marca}, y seré tu persona de contacto.`,
    '',
    ...cuerpoPreguntas,
    '',
    'Con eso te preparo la propuesta y te la envío. Si lo prefieres, dime a qué hora te viene bien que te llame.',
    '',
    'Un saludo,',
    '',
    pieLegalLeadCorreo(),
  ].join('\n')
  return { asunto: asunto.slice(0, 200), cuerpo, ramos: [...l.ramos], preguntas: bloques.reduce((n, b) => n + b.preguntas.length, 0) }
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

export type OportunidadLeadCorreo = { ramo: RamoOportunidad; estado: 'abierta' | 'ya_abierta' | 'tope' | 'error'; motivo?: string; id?: string }

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
  /** `boton`: la petición va como borrador con ✅/✏️/❌ (no sale sin el ✅); `copiar` (por defecto): texto para copiar. */
  peticion?: 'boton' | 'copiar'
  /** Línea del Catastro ya en HTML seguro (`lineaCatastroTelegram`), si se consultó. */
  catastro?: string | null
  /** Resultado de añadirlo a Google Contacts (`interpretarContactosLead`); `null`/ausente = no se intentó. */
  contactos?: { estado: string; motivo: string | null } | null
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
  const contactos = lineaContactosLead(a.contactos ?? null)
  if (contactos) lineas.push(contactos)
  for (const o of a.oportunidades) {
    const r = escapeHtml(etiquetaRamo(o.ramo))
    if (o.estado === 'abierta') lineas.push(`📌 Oportunidad de ${r} abierta, primer paso hoy: pedirle los datos.`)
    else if (o.estado === 'ya_abierta') lineas.push(`📌 Ya tenía una oportunidad de ${r} abierta: no se ha duplicado.`)
    else if (o.estado === 'tope') lineas.push(`⚠️ Tope diario de oportunidades por correo: la de ${r} NO se ha abierto.`)
    else lineas.push(`⚠️ La oportunidad de ${r} NO se ha abierto${o.motivo ? ` (${escapeHtml(o.motivo)})` : ''}.`)
  }
  if (a.catastro) lineas.push(a.catastro)
  if (a.plantilla && a.peticion === 'boton') {
    lineas.push('📝 Petición de datos (solo lo que falta) en el mensaje siguiente, con ✅ Enviar / ✏️ Editar / ❌ Descartar. NO se ha enviado nada al lead: sale solo con tu ✅, en su hilo.')
  } else if (a.plantilla) {
    lineas.push('📝 Petición de datos lista para copiar en el mensaje siguiente (no hay borrador en Gmail; NO se ha enviado nada al lead).')
  } else if (!a.respuesta) {
    lineas.push('📝 Sin petición de datos: no parece un lead.')
  }
  return lineas.join('\n')
}

/** Por qué no se pudo añadir a Google Contacts, en palabras de Alberto (códigos del puerto de asegura). */
const MOTIVO_CONTACTOS: Record<string, string> = {
  pendiente_activar: 'la sincronización con Google no está activada',
  sin_conexion: 'Google Contactos no está conectado',
  revocada: 'hay que volver a conectar Google Contactos',
  pii_no_descifra: 'la clave de cifrado no abre la cartera',
  limite: 'la agenda llegaría al tope de 25.000 contactos',
  fuera_de_alcance: 'la ficha no es un lead de correo ni de la cartera',
  sacado_del_grupo: 'lo sacaste de la etiqueta «Grupo ASegura»',
  ilegible: 'su teléfono o correo no se puede descifrar',
  fallo_google: 'Google ha fallado',
  red: 'sin respuesta a tiempo: míralo en Contactos',
  sin_configurar: 'el puerto de la correduría no está configurado',
}
const DUDA_CONTACTOS = new Set(['nombre_distinto', 'telefono_compartido', 'mismo_email', 'mismo_nombre', 'varios_candidatos', 'telefono_titular', 'telefono_muchas_fichas', 'en_cola'])

/**
 * La línea 📇 del aviso del lead (19/10/2026): «añadido a Contactos» / «ya estaba en Contactos» / «no se
 * pudo añadir a Contactos (motivo)». Sin datos personales: solo el estado y el motivo. `null` = no se intentó.
 */
export function lineaContactosLead(r: { estado: string; motivo: string | null } | null): string | null {
  if (!r) return null
  if (r.estado === 'anadido') return '📇 añadido a Contactos'
  if (r.estado === 'ya_estaba') return '📇 ya estaba en Contactos'
  const m = r.motivo ?? ''
  const motivo = r.estado === 'revision' || DUDA_CONTACTOS.has(m)
    ? 'dudoso: está en la cola de revisión de Google Contactos'
    : MOTIVO_CONTACTOS[m] ?? (m ? `error: ${m}` : 'error sin detalle')
  return `📇 no se pudo añadir a Contactos (${escapeHtml(motivo)})`
}

/**
 * La plantilla va en un SEGUNDO mensaje a propósito: si Telegram rechazara este (HTML, longitud), el
 * aviso principal —que es el que no se puede perder— ya ha salido.
 */
export function textoPlantillaTelegram(p: { asunto: string; cuerpo: string }, nota: string | null = null): string {
  return `📝 <b>Petición de datos (copiar y responder desde ${escapeHtml(MEDIADOR.identidad.email)})</b>\n${nota ? `⚠️ ${escapeHtml(nota)}\n` : ''}<blockquote expandable>${escapeHtml(`Asunto: ${p.asunto}\n\n${p.cuerpo}`.slice(0, 3400))}</blockquote>`
}

// ─── 6. Presupuesto de tiempo de la pasada (revisión 19/10/2026) ─────────────
//
// Un lead cuesta hasta ~140 s (IA de extracción + alta + historial + oportunidades + Catastro con tope de 25 s +
// riesgo + pendiente + dos avisos) y la
// función del triaje muere a los 300 s: un correo a medias se quedaría `pendiente` y el dedupe lo
// saltaría para siempre, sin aviso. Por eso un lead NO se empieza pasados `LEAD_HASTA_MS` ni más de
// `LEADS_POR_PASADA` por pasada, y ningún correo nuevo pasados `CORREO_HASTA_MS`: se DIFIERE (su fila se
// borra y el cursor se queda justo antes), y la pasada siguiente —10 min— lo coge entero.
export const LEADS_POR_PASADA = 2
/**
 * Tope de la llamada a Google Contacts del lead (19/10/2026). Sale del presupuesto: `LEAD_HASTA_MS` bajó de
 * 150 s a 135 s para que un lead empezado al límite (≈140 s + esto) siga acabando antes de los 300 s.
 */
export const TIMEOUT_CONTACTOS_LEAD_MS = 12_000
export const LEAD_HASTA_MS = 135_000
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
