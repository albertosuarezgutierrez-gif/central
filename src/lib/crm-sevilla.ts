// Helpers compartidos del agente de venta de Sevilla (catering / eventos / restaurante):
// detección de vertical, plantillas de email (inicial + seguimiento día 2) y WhatsApp.

export type VerticalVenta = 'catering' | 'eventos' | 'restaurante'

export function detectarVertical(tipo?: string | null): VerticalVenta {
  const t = (tipo || '').toLowerCase()
  if (t.includes('cater')) return 'catering'
  if (t.includes('event') || t.includes('hacienda') || t.includes('finca') || t.includes('espacio') || t.includes('banquet') || t.includes('bod')) return 'eventos'
  return 'restaurante'
}

const CFG: Record<VerticalVenta, { utm: string; path: string; txt: string }> = {
  catering: { utm: 'crm_catering', path: '/catering', txt: 'iarest.es/catering' },
  eventos: { utm: 'crm_eventos', path: '/espacios', txt: 'iarest.es/espacios' },
  restaurante: { utm: 'crm_lead', path: '', txt: 'www.iarest.es' },
}

type LeadVenta = { id: string; nombre: string; tipo_negocio?: string | null }

const BAJA = (unsubUrl: string) =>
  `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/><p style="font-size:12px;color:#999;">Si prefieres no recibir más: <a href="${unsubUrl}" style="color:#999;">desuscribir</a></p>`
const FIRMA = `<p>Un saludo,<br/><b>Alberto</b><br/>ia.rest | +34 637 34 99 90</p>`

function trackingUrl(vertical: VerticalVenta, leadId: string, jwtToken: string): string {
  const cfg = CFG[vertical]
  return `https://www.iarest.es${cfg.path}?utm_source=${cfg.utm}&utm_id=${leadId}&tk=${jwtToken}`
}

// Email frío inicial (día 1) por vertical.
export function construirEmail(
  lead: LeadVenta,
  jwtToken: string,
  unsubUrl: string
): { utm: string; subject: string; html: string } {
  const vertical = detectarVertical(lead.tipo_negocio)
  const cfg = CFG[vertical]
  const url = trackingUrl(vertical, lead.id, jwtToken)
  const cta = `<p><b>¿5 minutos para verlo?</b><br/><a href="${url}" style="color:#D9442B;font-weight:bold;">👉 ${cfg.txt}</a></p>`

  if (vertical === 'catering') {
    return {
      utm: cfg.utm,
      subject: `${lead.nombre}, ¿cuánto margen real te queda en cada evento? 🍽️`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>En catering lo difícil no es cocinar: es <b>cuadrar el presupuesto y saber el margen real</b> de cada evento antes de decir que sí.</p>
        <p>Lo automatizamos: escandallos, coste por comensal y presupuesto con margen al instante. Menos horas de oficina, más eventos rentables.</p>
        ${cta}${FIRMA}${BAJA(unsubUrl)}</div>`,
    }
  }
  if (vertical === 'eventos') {
    return {
      utm: cfg.utm,
      subject: `${lead.nombre}, ¿llenas el calendario o se te escapan bodas? 💍`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>Para una finca de eventos, cada solicitud de bodas.net que se enfría es dinero que se va. Y llevar calendario, presupuestos y contratos a mano cuesta horas.</p>
        <p>Lo juntamos todo: <b>disponibilidad de espacios, embudo de solicitudes, presupuestos con margen y contratos</b>. Una solicitud no se pierde.</p>
        ${cta}${FIRMA}${BAJA(unsubUrl)}</div>`,
    }
  }
  return {
    utm: cfg.utm,
    subject: `${lead.nombre}, ¿sabes cuánto ganas de verdad? 🤔`,
    html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
      <p>La mayoría factura mucho pero gana poco: caja manual, comandas a mano, papeleo. <b>Facturar más no es ganar más.</b></p>
      <p><b>🎤 Comandas por voz</b> → cocina al instante, sin errores. <b>🤖 IA en procesos</b> → recuperas el margen que se pierde.</p>
      ${cta}${FIRMA}${BAJA(unsubUrl)}</div>`,
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

// Normaliza un teléfono español a formato internacional para wa.me (solo dígitos, prefijo 34).
export function normalizarTelefonoEs(telefono?: string | null): string | null {
  if (!telefono) return null
  let d = telefono.replace(/\D/g, '')
  if (d.startsWith('0034')) d = d.slice(4)
  else if (d.startsWith('34') && d.length === 11) d = d.slice(2)
  if (d.length === 9 && /^[6789]/.test(d)) return `34${d}`
  if (d.length === 11 && d.startsWith('34')) return d
  return null // no parece un móvil/fijo español válido
}

// Mensaje + enlace wa.me (click-to-chat, sin API de Meta) por vertical.
export function construirWhatsApp(lead: LeadVenta, telefono: string): { texto: string; link: string } | null {
  const intl = normalizarTelefonoEs(telefono)
  if (!intl) return null
  const vertical = detectarVertical(lead.tipo_negocio)
  const cfg = CFG[vertical]
  const texto =
    vertical === 'catering'
      ? `Hola, soy Alberto de ia.rest. Trabajáis catering en Sevilla y montamos algo que calcula el coste y el margen real de cada evento al instante. ¿Te viene bien que te lo enseñe en 5 min? ${cfg.txt}`
      : vertical === 'eventos'
      ? `Hola, soy Alberto de ia.rest. Para fincas/haciendas de eventos juntamos calendario, solicitudes (bodas.net), presupuestos y contratos en un sitio. ¿5 min para que te lo enseñe? ${cfg.txt}`
      : `Hola, soy Alberto de ia.rest. Ayudamos a hostelería de Sevilla a ganar margen con comandas por voz e IA. ¿Te viene bien que te lo enseñe en 5 min? ${cfg.txt}`
  const link = `https://wa.me/${intl}?text=${encodeURIComponent(texto)}`
  return { texto, link }
}
