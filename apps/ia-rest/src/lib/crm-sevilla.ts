// Helpers compartidos del agente de venta de Sevilla (catering / eventos / restaurante):
// detección de vertical, plantillas de email (inicial + seguimiento día 2) y WhatsApp.

export type VerticalVenta = 'catering' | 'eventos' | 'restaurante' | 'franquicia'

export function detectarVertical(tipo?: string | null): VerticalVenta {
  const t = (tipo || '').toLowerCase()
  if (t.includes('franquic') || t.includes('cadena')) return 'franquicia'
  if (t.includes('cater')) return 'catering'
  if (t.includes('event') || t.includes('hacienda') || t.includes('finca') || t.includes('espacio') || t.includes('banquet') || t.includes('bod')) return 'eventos'
  return 'restaurante'
}

// El email de venta lleva SIEMPRE a la web principal (decisión Alberto 03/07/2026:
// un solo mensaje genérico y "que entren en la página web"). El utm sigue siendo
// por vertical para segmentar el tracking de clics; la home monta LandingClickTracker.
const CFG: Record<VerticalVenta, { utm: string; path: string; txt: string }> = {
  catering: { utm: 'crm_catering', path: '', txt: 'www.iarest.es' },
  eventos: { utm: 'crm_eventos', path: '', txt: 'www.iarest.es' },
  restaurante: { utm: 'crm_lead', path: '', txt: 'www.iarest.es' },
  franquicia: { utm: 'crm_franquicia', path: '', txt: 'www.iarest.es' },
}

type LeadVenta = { id: string; nombre: string; tipo_negocio?: string | null }

const BAJA = (unsubUrl: string) =>
  `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/><p style="font-size:12px;color:#999;">Si prefieres no recibir más: <a href="${unsubUrl}" style="color:#999;">desuscribir</a></p>`
const FIRMA = `<p>Un saludo,<br/><b>Alberto</b><br/>ia.rest | +34 637 34 99 90</p>`

function trackingUrl(vertical: VerticalVenta, leadId: string, jwtToken: string): string {
  const cfg = CFG[vertical]
  return `https://www.iarest.es${cfg.path}?utm_source=${cfg.utm}&utm_id=${leadId}&tk=${jwtToken}`
}

// Email frío inicial (día 1) — MENSAJE TIPO GENÉRICO para todos los verticales
// (catering, restaurantes, bares, eventos, franquicia). Elegido por Alberto el
// 03/07/2026 (opción A): gancho del margen + abanico de servicios + CTA a la web.
// NO cambiar el texto sin su OK. El utm por vertical se conserva para el tracking.
export function construirEmail(
  lead: LeadVenta,
  jwtToken: string,
  unsubUrl: string
): { utm: string; subject: string; html: string } {
  const vertical = detectarVertical(lead.tipo_negocio)
  const cfg = CFG[vertical]
  const url = trackingUrl(vertical, lead.id, jwtToken)

  return {
    utm: cfg.utm,
    subject: `${lead.nombre}, ¿cuánto margen real te queda? 🍽️`,
    html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
      <p>En hostelería lo difícil no es llenar: es saber el <b>margen real que te queda</b> — de cada evento, de cada servicio, de cada mes. La mayoría lo descubre tarde, cuando ya no hay margen que salvar.</p>
      <p>En <b>ia.rest</b> lo automatizamos: escandallos, coste por ración o por comensal y beneficio al instante, sin horas de Excel.</p>
      <p>Y el margen es solo la puerta de entrada. ia.rest es una <b>plataforma completa que se adapta a tu negocio</b> — activas solo lo que necesitas:</p>
      <ul style="padding-left:18px;margin:0 0 14px;line-height:1.7;">
        <li>🎤 Comandas por voz y cocina conectada (KDS)</li>
        <li>📦 Almacén, compras y escandallos</li>
        <li>🧾 Contabilidad, facturación y VeriFactu</li>
        <li>👥 RR.HH., turnos y fichajes</li>
        <li>💍 Gestión de eventos y catering</li>
        <li>📣 CRM comercial, reservas y marketing</li>
      </ul>
      <p>Te recomiendo entrar en nuestra web y verlo con calma:<br/>
      <a href="${url}" style="color:#D9442B;font-weight:bold;">👉 ${cfg.txt}</a></p>
      ${FIRMA}${BAJA(unsubUrl)}</div>`,
  }
}

// Email de seguimiento (día 2): recordatorio corto por vertical.
export function construirSeguimiento(
  lead: LeadVenta,
  jwtToken: string,
  unsubUrl: string
): { utm: string; subject: string; html: string } {
  const vertical = detectarVertical(lead.tipo_negocio)
  const cfg = CFG[vertical]
  const url = trackingUrl(vertical, lead.id, jwtToken)
  const cta = `<p><a href="${url}" style="color:#D9442B;font-weight:bold;">👉 ${cfg.txt}</a></p>`
  const gancho =
    vertical === 'catering'
      ? 'saber el margen real de cada evento antes de aceptarlo'
      : vertical === 'eventos'
      ? 'no perder ni una solicitud de boda y llenar el calendario'
      : vertical === 'franquicia'
      ? 'unificar la operativa y ver el margen por local en tiempo real'
      : 'recuperar el margen que se pierde en gestión manual'
  return {
    utm: cfg.utm,
    subject: `${lead.nombre}, te escribí hace unos días 👋`,
    html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
      <p>Te escribí hace unos días sobre ia.rest. Sé que andáis liados, así que solo te lo recuerdo: la idea es <b>${gancho}</b>.</p>
      <p>Si te encaja, son 5 minutos de videollamada y lo ves funcionando. Si no es el momento, dímelo y no insisto.</p>
      ${cta}${FIRMA}${BAJA(unsubUrl)}</div>`,
  }
}

// Normaliza un MÓVIL español a formato internacional para wa.me (solo dígitos, prefijo 34).
// Solo móviles (empiezan por 6 o 7): un fijo no recibe WhatsApp → devuelve null.
// Lo usan pipeline-comercial y el webhook de Telegram para los botones wa.me de
// leads ACTIVOS. El contacto en frío ya no usa WhatsApp (carril retirado 05/08/2026:
// exigía un toque manual por lead; ahora esos leads reciben el email frío automático).
export function normalizarTelefonoEs(telefono?: string | null): string | null {
  if (!telefono) return null
  let d = telefono.replace(/\D/g, '')
  if (d.startsWith('0034')) d = d.slice(4)
  else if (d.startsWith('34') && d.length === 11) d = d.slice(2)
  if (d.length === 9 && /^[67]/.test(d)) return `34${d}`
  return null // no parece un MÓVIL español válido
}

// Mensaje + enlace para DM de Instagram (envío MANUAL desde la cuenta, sin API).
// El enlace abre su perfil si lo conocemos (web de IG) o, si no, una búsqueda.
export function construirInstagram(
  lead: LeadVenta & { web?: string | null }
): { texto: string; link: string } {
  const vertical = detectarVertical(lead.tipo_negocio)
  const texto =
    vertical === 'catering'
      ? `¡Hola! 👋 Soy Alberto, de ia.rest (también somos de Sevilla). Ayudamos a caterings de aquí a saber el margen real de cada evento antes de aceptarlo: escandallos, coste por comensal y presupuesto al instante, sin pelearte con el Excel. ¿Te lo enseño en 5 min por videollamada? Sin compromiso 🙌`
      : vertical === 'eventos'
      ? `¡Hola! 👋 Soy Alberto, de ia.rest (Sevilla). Para fincas/haciendas de eventos juntamos calendario, solicitudes, presupuestos y contratos en un sitio para que no se escape ni una boda. ¿Te lo enseño en 5 min? Sin compromiso 🙌`
      : `¡Hola! 👋 Soy Alberto, de ia.rest (Sevilla). Ayudamos a hostelería a ganar margen con comandas por voz e IA. ¿Te lo enseño en 5 min? Sin compromiso 🙌`
  const web = (lead.web || '').toLowerCase()
  const link = web.includes('instagram.com')
    ? (lead.web as string)
    : `https://www.google.com/search?q=${encodeURIComponent(`${lead.nombre || ''} Sevilla instagram`)}`
  return { texto, link }
}
