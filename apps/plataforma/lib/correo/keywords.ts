// lib/correo/keywords.ts — Capa DETERMINISTA del triaje (0 tokens), previa a la IA.
//
// Mismo patrón que /finanzas (lib/subcategoria-keywords.ts): los remitentes/asuntos INEQUÍVOCOS
// se clasifican por regla, sin depender de que la pasarela de IA responda. Rescata los correos que
// antes caían a 'dudoso' cuando la IA se saturaba (p.ej. recibos de Stripe, mensajes de Booking,
// pólizas de Occident) — visto en producción: ~27% de los correos acababan en 'dudoso' con
// confianza 0, muchos de ellos contabilidad/huéspedes/correduría claros o puro marketing.
//
// PRINCIPIO: solo reglas de ALTA PRECISIÓN. Ante la duda, devolver null y dejar decidir a la IA.
// Puro (sin `@/` ni prisma) → testeable con `node --test` (keywords.test.ts).

export interface KeywordMatch {
  categoria: string
  motivo: string
}

const norm = (s: string) => (s || '').toLowerCase().trim()
const dominioDe = (from: string) => {
  const at = from.indexOf('@')
  return at >= 0 ? from.slice(at + 1) : ''
}
const enDominio = (dom: string, base: string) => dom === base || dom.endsWith('.' + base)
/** Sin acentos: las compañías escriben «anulacion» y «anulación» el mismo día. */
const sinTildes = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ── 🚨 Recibos de aseguradora: la regla que va PRIMERA ──────────────────────
// `mediadores@occidentinforma.com` manda el mismo día un siniestro, un comunicado comercial y
// «Recibos devueltos de banco». Por dominio los tres caen en `correduria` (digest de las 22:30);
// el tercero es el único que caduca —art. 15 LCS: al mes se suspende la cobertura— y encima es
// la ÚNICA fuente para las compañías cuyos recibos CIMA no actualiza (medido 03/09/2026). Por eso
// se mira ANTES que el dominio y con dos condiciones a la vez: remitente de aseguradora Y asunto
// de recibo. Un «Recibo de su pago a IONOS» de PayPal no pasa la primera; un «Nueva oferta de
// Salud» de Mapfre no pasa la segunda.
export const ASEGURADORAS = [
  'occidentinforma.com', 'comunicacionesoccident.com', 'newsoccident.com', 'occident.com',
  'mapfre.com', 'allianz.es', 'reale.es', 'generali.com', 'tugenerali.es', 'fidelidade.pt',
  'zurich.es', 'axa.es', 'catalanaoccidente.com', 'libertyseguros.es', 'plusultra.es', 'caser.es',
  // Añadidas 14/10/2026 (dominios corporativos de sobra conocidos; ante la duda de un dominio, fuera).
  // 🚨 FUERA a propósito las de venta directa / salud (Sanitas, DKV, Asisa, Verti, Línea Directa, Mutua
  // Madrileña): un «recibo devuelto» o un «siniestro» suyo puede ser una póliza PERSONAL de Alberto, no de
  // un cliente de la correduría. Esos los decide la IA.
  'mapfre.es', 'helvetia.es', 'santalucia.es', 'pelayo.com', 'segurcaixaadeslas.es', 'fiatc.es',
]
// Solo lo que habla de un recibo que no ha entrado. `anulad|anulacion` cubre «pólizas anuladas
// por impago» y «recibos próximos a la anulación», que es el aviso que llega ANTES de que caiga
// la cobertura y por tanto el más útil de todos.
const ASUNTO_RECIBO = /\brecibos?\b|\bimpago\b|devuelt|anulacion|\banulad|\bdomiciliacion\b/i

/** Asunto que habla de un recibo que no ha entrado (devuelto, impagado, anulación). Solo el asunto. */
export function asuntoDeRecibo(subject: string): boolean {
  return ASUNTO_RECIBO.test(sinTildes(subject || ''))
}

/** `true` = el dominio del remitente es de una aseguradora conocida (`ASEGURADORAS`, subdominios incluidos). */
export function esDominioAseguradora(from: string): boolean {
  const dom = dominioDe(norm(from))
  return !!dom && ASEGURADORAS.some(d => enDominio(dom, d))
}

function esReciboAseguradora(from: string, subject: string): boolean {
  const dom = dominioDe(from)
  if (!dom || !ASEGURADORAS.some(d => enDominio(dom, d))) return false
  return ASUNTO_RECIBO.test(sinTildes(subject || ''))
}

// ── Avisos OPERATIVOS de compañía y de Codeoscopic (proveedor del ERP de la correduría) ──────────
// Medido a 90 días: `avisosrecibos@info.mapfre.com` caía en seguridad-sospechosa, y «Cierre de MAO
// desktop», «Ticket Cerrado», «Movimientos a Fichero» (Reale) o «desbloqueo de póliza» (Allianz)
// acababan en ruido/dudoso. Aquí corre ANTES que la IA (clasificador.ts: correo_reglas → OTP →
// keyword → IA), así que gana a seguridad-sospechosa. Se exige remitente de compañía Y señal
// operativa (prefijo del buzón o asunto): el comunicado comercial masivo NO entra (sigue a la IA/digest).
const PUBLICIDAD_COMPANIA = /mapfretecuidamos/
const BUZON_OPERATIVO = ['avisosrecibos@', 'enviodocumentacionpoliza@']
const ASUNTO_OPERATIVO_COMPANIA =
  /\bticket\b|\bmao\b|movimientos? a fichero|desbloqueo|\bsiniestros?\b|\bincidencia|documentacion (de |de la )?poliza|\bpoliza\b.*\b(emitida|anulada|suspendida)/i
const CODEOSCOPIC = 'codeoscopic.com'
const CODEOSCOPIC_NEWSLETTER_BUZON = ['newsletter', 'news@', 'marketing', 'comunicacion', 'hola@', 'info@']
const CODEOSCOPIC_NEWSLETTER_ASUNTO = /newsletter|boletin|webinar|\bseminario|novedades del mes|\bevento\b/i
// Sus facturas no son correduría operativa: siguen las reglas de siempre (o la IA), como antes de esta regla.
const CODEOSCOPIC_FACTURA_BUZON = /^factur/
const CODEOSCOPIC_FACTURA_ASUNTO = /\bfacturas?\b|\binvoices?\b/i

function operativoCompania(f: string, dom: string, subject: string): boolean {
  if (!dom || !ASEGURADORAS.some(d => enDominio(dom, d))) return false
  if (PUBLICIDAD_COMPANIA.test(f)) return false
  if (BUZON_OPERATIVO.some(p => f.startsWith(p))) return true
  return ASUNTO_OPERATIVO_COMPANIA.test(sinTildes(subject || ''))
}

function categoriaCodeoscopic(f: string, subject: string): string {
  const news = CODEOSCOPIC_NEWSLETTER_BUZON.some(p => f.startsWith(p)) ||
    CODEOSCOPIC_NEWSLETTER_ASUNTO.test(sinTildes(subject || ''))
  return news ? 'ruido' : 'correduria'
}

// ── 🛡️ Capa 0: EXCLUSIÓN DE SEGURIDAD (21/10/2026, spec docs/CORREDURIA-AGENTE-CORREO.md §5) ──────────────
// Los hilos de TIREA (alta de CIMA; su Jira `tirea.atlassian.net`) y los tickets de Codeoscopic llevan CREDENCIALES EN
// CLARO (usuario/contraseña de CIMA o de las compañías, reenviadas). Un correo excluido NO se parsea, no se guarda
// extracto ni adjunto y NO va a ningún LLM (el clasificador lo mandaba a Groq/NIM cuando ninguna regla decidía): solo
// queda su fila en `correo_triaje` con `categoria = 'excluido_seguridad'` y el asunto truncado. Se evalúa ANTES que
// todo lo demás en `clasificar()` (cepo `test/regression-correo-exclusion.test.ts`).
// - TIREA: TODO su correo, sin excepción.
// - Codeoscopic: todo SALVO su newsletter (→ ruido), sus facturas (→ reglas de siempre) y los avisos Avant2 de emisión
//   («Póliza aceptada», «Documentos de la emisión»: sin credenciales). Lo demás (tickets, alta/verificación/recuperación
//   de contraseña de Avant) fuera.
// - Cualquier remitente del SECTOR (aseguradoras de `ASEGURADORAS`, TIREA, Codeoscopic) con asunto de credenciales.
//   Solo del sector a propósito: un «restablece tu contraseña» de otro remitente puede ser phishing y ese lo tiene que
//   ver la IA (`seguridad-sospechosa`, aviso inmediato), no esconderse aquí.
// - Detector de secretos en el cuerpo: «usuario:/contraseña:/password:/clave:» seguido de un valor, en correo del sector
//   o en un reenvío que cita a TIREA/Codeoscopic (Alberto reenviando el alta de CIMA desde su gmail).
export const CATEGORIA_EXCLUIDA = 'excluido_seguridad'
export const TIREA = ['tirea.es', 'tirea.atlassian.net']
const ASUNTO_CREDENCIALES = /contrasena|clave de acceso|credenciales|recuperacion de (la )?clave|usuario y contrasena|\bpassword\b|\bclaves? de usuario\b/i
const AVANT2_EMISION = /^\s*avant\s*2?\s*:\s*(poliza aceptada|documentos de la emision)\b/i
// «Usuario solicitante: M…» de Occident NO casa (hay una palabra entre «usuario» y los dos puntos): a propósito.
const SECRETO_EN_CUERPO = /\b(usuario|user(name)?|login|password|contrase[ñn]a|clave(\s+de\s+acceso)?|pin)\s*[:=]\s*\S{3,}/i
const CITA_TIREA_CODEOSCOPIC = /@tirea\.es\b|tirea\.atlassian\.net|@codeoscopic\.com\b/i

export type MotivoExclusion = 'tirea' | 'codeoscopic' | 'asunto_credenciales' | 'secreto_en_cuerpo'

/**
 * ¿Hay que EXCLUIR este correo por seguridad? `null` = no. Decide por remitente + asunto y, si se da, el cuerpo (solo
 * para buscar secretos: nada de él sale de aquí). PURA.
 */
export function exclusionSeguridad(from: string, subject: string, cuerpo?: string | null): MotivoExclusion | null {
  const f = norm(from)
  const dom = dominioDe(f)
  const asunto = sinTildes(subject || '')
  const deTirea = !!dom && TIREA.some(d => enDominio(dom, d))
  const deCodeoscopic = !!dom && enDominio(dom, CODEOSCOPIC)
  const delSector = deTirea || deCodeoscopic || (!!dom && ASEGURADORAS.some(d => enDominio(dom, d)))
  if (deTirea) return 'tirea'
  if (delSector && ASUNTO_CREDENCIALES.test(asunto)) return 'asunto_credenciales'
  const texto = cuerpo ?? ''
  const conSecreto = SECRETO_EN_CUERPO.test(texto)
  if (conSecreto && (delSector || CITA_TIREA_CODEOSCOPIC.test(texto))) return 'secreto_en_cuerpo'
  if (deCodeoscopic) {
    const newsletter = categoriaCodeoscopic(f, subject) === 'ruido'
    const factura = CODEOSCOPIC_FACTURA_BUZON.test(f) || CODEOSCOPIC_FACTURA_ASUNTO.test(asunto)
    if (!newsletter && !factura && !AVANT2_EMISION.test(asunto)) return 'codeoscopic'
  }
  return null
}

/** Lo único del correo excluido que se guarda: el asunto, TRUNCADO (puede citar a quién es el alta). */
export function asuntoExcluido(subject: string): string {
  const s = (subject || '').replace(/\s+/g, ' ').trim()
  return s.length > 60 ? `${s.slice(0, 59)}…` : s
}

// Dominio del remitente → categoría (procesadores de pago, plataformas de reserva, aseguradoras,
// emisores de marketing masivo conocidos). El match cubre subdominios (info.homeexchange.com).
const DOMINIOS: { categoria: string; dominios: string[] }[] = [
  { categoria: 'contabilidad', dominios: ['stripe.com', 'paypal.es', 'paypal.com', 'interactivebrokers.com'] },
  { categoria: 'huespedes', dominios: ['guest.booking.com', 'smoobu.com', 'homeexchange.com'] },
  { categoria: 'correduria', dominios: ['occidentinforma.com'] },
  // Marketing masivo de alta precisión (archivar es seguro): boletines/promos conocidos.
  { categoria: 'ruido', dominios: ['endesaclientes.com', 'club.cortefiel.com', 'sevillafc.es', 'pedrobuerbaum.com'] },
]

// Prefijo del remitente (parte local) → categoría, para dominios compartidos (allianz.es sirve
// tanto marketing como a mediadores; solo 'mediadores@' es correduría).
const REMITENTE: { categoria: string; empieza: string[]; soloAseguradoras?: boolean }[] = [
  { categoria: 'correduria', empieza: ['mediadores@', 'comunicacion.mediadores@'] },
  // Singular (14/10/2026): «Rel. Emisión Producción» de mediador@allianz.es. Solo desde dominios de
  // ASEGURADORAS: el buzón singular no se da por correduría en cualquier otro dominio.
  { categoria: 'correduria', empieza: ['mediador@'], soloAseguradoras: true },
]

// Marcadores INEQUÍVOCOS en el asunto (frases transaccionales), como red de seguridad si el dominio
// no está en la lista. Conservador: nada ambiguo.
const ASUNTO: { categoria: string; re: RegExp }[] = [
  { categoria: 'contabilidad', re: /\b(your\s+)?(receipt|invoice|credit\s+note|refund)\b|recibo de (su )?pago|justificante de pago/i },
]

/**
 * Clasifica un correo por reglas deterministas de alta precisión. Devuelve null si ninguna aplica
 * (entonces decide la IA). NUNCA usa 'seguridad-sospechosa' ni 'personal-importante': esos exigen
 * el juicio de la IA y no se infieren por dominio.
 */
export function clasificarPorKeyword(from: string, subject: string): KeywordMatch | null {
  const f = norm(from)
  const dom = dominioDe(f)
  // Segunda red de la capa 0 (la primera es `clasificar()`): quien llame aquí sin cuerpo tampoco lo saca de la exclusión.
  const excluido = exclusionSeguridad(from, subject)
  if (excluido) return { categoria: CATEGORIA_EXCLUIDA, motivo: `exclusión de seguridad (${excluido})` }
  // Antes que el dominio: si no, `occidentinforma.com` se lo llevaría a `correduria` y el aviso
  // llegaría en el digest de la noche.
  if (esReciboAseguradora(f, subject)) {
    return { categoria: 'correduria-recibo', motivo: `recibo de aseguradora (${dom})` }
  }
  // Publicidad de compañía (mapfretecuidamos) → ruido, antes de la regla operativa de su dominio.
  if (dom && ASEGURADORAS.some(d => enDominio(dom, d)) && PUBLICIDAD_COMPANIA.test(f)) {
    return { categoria: 'ruido', motivo: `publicidad de compañía (${dom})` }
  }
  if (dom && enDominio(dom, CODEOSCOPIC)
    && !CODEOSCOPIC_FACTURA_BUZON.test(f) && !CODEOSCOPIC_FACTURA_ASUNTO.test(sinTildes(subject || ''))) {
    const categoria = categoriaCodeoscopic(f, subject)
    return { categoria, motivo: `Codeoscopic (${categoria === 'ruido' ? 'newsletter' : 'operativo'})` }
  }
  if (operativoCompania(f, dom, subject)) {
    return { categoria: 'correduria', motivo: `aviso operativo de compañía (${dom})` }
  }
  if (dom) {
    for (const { categoria, dominios } of DOMINIOS) {
      if (dominios.some(d => enDominio(dom, d))) return { categoria, motivo: `dominio ${dom}` }
    }
  }
  for (const { categoria, empieza, soloAseguradoras } of REMITENTE) {
    if (soloAseguradoras && !(dom && ASEGURADORAS.some(d => enDominio(dom, d)))) continue
    if (empieza.some(p => f.startsWith(p))) return { categoria, motivo: `remitente ${f}` }
  }
  const s = subject || ''
  for (const { categoria, re } of ASUNTO) {
    if (re.test(s)) return { categoria, motivo: 'asunto transaccional' }
  }
  return null
}
