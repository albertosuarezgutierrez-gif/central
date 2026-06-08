import { Resend } from 'resend'

// Lazy init: evita "RESEND_API_KEY is required" durante el build estático de Next.js
let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder')
  return _resend
}

const FROM = 'ia.rest <hola@iarest.es>'
const BASE = 'https://www.iarest.es'

// ── Colores del design system ────────────────────────────────
const C = {
  bg:   '#F6F1E7',
  bg2:  '#EDE8DC',
  fg:   '#1A1714',
  fg2:  '#3D342A',
  fg3:  '#7A6D5E',
  verm: '#D9442B',
  rule: '#D4CBB8',
}

// ── HTML base para todos los emails ──────────────────────────
function layout(content: string, preheader = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ia.rest</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; font-family: 'Inter', Arial, sans-serif; color: ${C.fg}; }
  a { color: ${C.verm}; text-decoration: none; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 40px 24px 60px; }
  .logo { font-family: Georgia, serif; font-style: italic; font-size: 22px; color: ${C.verm}; margin-bottom: 32px; display: block; }
  .card { background: #fff; border: 1px solid ${C.rule}; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
  h1 { font-family: Georgia, serif; font-style: italic; font-size: 26px; color: ${C.fg}; font-weight: 400; line-height: 1.2; margin-bottom: 12px; }
  p { font-size: 15px; color: ${C.fg2}; line-height: 1.6; margin-bottom: 16px; }
  .btn { display: inline-block; background: ${C.verm}; color: #fff !important; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 8px; margin: 8px 0; }
  .token-box { background: ${C.bg2}; border: 1px solid ${C.rule}; border-radius: 8px; padding: 14px 18px; font-family: 'Courier New', monospace; font-size: 14px; color: ${C.fg}; letter-spacing: .03em; margin: 16px 0; word-break: break-all; }
  .step { display: flex; gap: 12px; margin-bottom: 12px; }
  .step-n { width: 24px; height: 24px; border-radius: 50%; background: ${C.verm}; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .step-txt { font-size: 14px; color: ${C.fg2}; line-height: 1.5; }
  .footer { font-size: 12px; color: ${C.fg3}; text-align: center; padding-top: 24px; border-top: 1px solid ${C.rule}; line-height: 1.6; }
  .divider { border: none; border-top: 1px solid ${C.rule}; margin: 24px 0; }
</style>
</head>
<body>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
<div class="wrap">
  <a href="${BASE}" class="logo">ia.rest</a>
  ${content}
  <div class="footer">
    <p><a href="${BASE}">www.iarest.es</a> · <a href="mailto:hola@iarest.es">hola@iarest.es</a></p>
    <p style="margin-top:6px">ia.rest · TPV por Voz para Hostelería</p>
  </div>
</div>
</body>
</html>`
}

// ── EMAIL 1: Bienvenida con token de bridge ──────────────────
export async function enviarEmailBienvenida({
  email,
  nombreRestaurante,
  bridgeToken,
  urlAcceso,
  pinOwner,
  codigoAcceso,
}: {
  email: string
  nombreRestaurante: string
  bridgeToken: string
  urlAcceso?: string
  pinOwner?: string
  codigoAcceso?: string
}) {
  const loginUrl = urlAcceso || `${BASE}/owner`

  const html = layout(`
    <div class="card">
      <h1>Bienvenido a ia.rest, ${nombreRestaurante}.</h1>
      <p>Tu cuenta está activa. Tienes <strong>14 días de prueba gratuita</strong> para probarlo todo sin límites y sin tarjeta.</p>
      <hr class="divider">

      <p style="font-size:13px;color:${C.fg3};text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">Tu acceso al panel</p>
      <div class="token-box" style="font-size:16px">
        🔗 ${loginUrl}${pinOwner ? `<br>🔑 PIN: ${pinOwner}` : ''}
      </div>
      <a href="${loginUrl}" class="btn">Abrir mi panel →</a>
    </div>

    <div class="card">
      <p style="font-size:13px;color:${C.fg3};text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">Conecta tus impresoras</p>
      <p>Descarga el instalador en el ordenador del TPV. Detecta tus impresoras automáticamente en menos de 5 minutos.</p>
      <p style="font-size:13px;color:${C.fg3};margin-bottom:6px">Tu referencia de instalación:</p>
      <div class="token-box">${bridgeToken}</div>
      <a href="${BASE}/instalar" class="btn">Descargar instalador →</a>
    </div>

    <div class="card">
      <p style="font-size:13px;color:${C.fg3};margin-bottom:12px">Por dónde empezar:</p>
      <div class="step"><div class="step-n">1</div><div class="step-txt"><strong>Entra en tu panel</strong> y sube una foto de tu carta — la IA extrae todos los productos en segundos.</div></div>
      <div class="step"><div class="step-n">2</div><div class="step-txt"><strong>Configura tus zonas</strong> (Sala, Terraza, Barra) y añade tu equipo con sus PINs.</div></div>
      <div class="step"><div class="step-n">3</div><div class="step-txt"><strong>Instala el bridge</strong> con el instalador para conectar las impresoras de cocina.</div></div>
      <div class="step"><div class="step-n">4</div><div class="step-txt"><strong>Primer turno</strong> — el camarero habla al micro y el ticket sale en cocina en medio segundo.</div></div>
    </div>
  `, `Bienvenido a ia.rest — ${nombreRestaurante} está listo`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Bienvenido a ia.rest — tu cuenta está lista`,
    html,
  })
}

// ── EMAIL 2: Recordatorio trial día 12 ──────────────────────
export async function enviarEmailRecordatorioTrial({
  email,
  nombreRestaurante,
  diasRestantes,
  urlFacturacion,
}: {
  email: string
  nombreRestaurante: string
  diasRestantes: number
  urlFacturacion: string
}) {
  const html = layout(`
    <div class="card">
      <h1>Tu prueba termina en ${diasRestantes} días.</h1>
      <p>Hola ${nombreRestaurante}, el periodo de prueba de ia.rest termina pronto. Para seguir usando el sistema sin interrupciones, activa tu suscripción.</p>
      <p>Si tienes cualquier pregunta antes de decidir, responde a este email y te ayudamos.</p>
      <a href="${urlFacturacion}" class="btn">Activar suscripción →</a>
    </div>
    <div class="card">
      <p style="font-size:14px;color:${C.fg3}">¿No quieres continuar? No hace falta que hagas nada — tu cuenta se pausará automáticamente al terminar el periodo de prueba, sin ningún cargo.</p>
    </div>
  `, `Tu prueba de ia.rest termina en ${diasRestantes} días`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Tu prueba de ia.rest termina en ${diasRestantes} días`,
    html,
  })
}

// ── EMAIL 3: Confirmación de pago y activación ───────────────
export async function enviarEmailConfirmacionPago({
  email,
  nombreRestaurante,
  importe,
  proximaFactura,
}: {
  email: string
  nombreRestaurante: string
  importe: number
  proximaFactura: string
}) {
  const html = layout(`
    <div class="card">
      <h1>Suscripción activa.</h1>
      <p>Hola ${nombreRestaurante}, tu suscripción a ia.rest está activa. Gracias por confiar en nosotros.</p>
      <hr class="divider">
      <p><strong>Importe:</strong> ${importe.toFixed(2)} €/mes</p>
      <p><strong>Próxima factura:</strong> ${proximaFactura}</p>
      <hr class="divider">
      <a href="${BASE}/owner" class="btn">Ir a mi panel →</a>
    </div>
  `, `Suscripción activa — ${nombreRestaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Suscripción activa — ia.rest`,
    html,
  })
}

// ── EMAIL: Incidencias al proveedor ──────────────────────────
export async function enviarEmailIncidenciasProveedor({
  email,
  nombreProveedor,
  nombreRestaurante,
  albaranNumero,
  incidencias,
}: {
  email: string
  nombreProveedor: string
  nombreRestaurante: string
  albaranNumero?: string | null
  incidencias: { nombre: string; tipo: string; cantidadPedida?: number | null; cantidadRecibida?: number; precioFacturado?: number | null }[]
}) {
  const tipoLabel = (tipo: string) => {
    if (tipo === 'merma') return '📦 Merma / cantidad diferente'
    if (tipo === 'precio_diferente') return '💰 Precio diferente al acordado'
    if (tipo === 'no_pedido') return '❓ Artículo no pedido'
    return `⚠️ Incidencia (${tipo})`
  }

  const rows = incidencias.map(it => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid ${C.rule};font-size:14px;">${it.nombre}</td>
      <td style="padding:10px 14px;border-bottom:1px solid ${C.rule};font-size:13px;color:#666;">${tipoLabel(it.tipo)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid ${C.rule};font-size:13px;font-family:monospace;">
        ${it.cantidadPedida != null ? `Pedido: ${it.cantidadPedida} → Recibido: ${it.cantidadRecibida}` : it.precioFacturado != null ? `Precio: ${it.precioFacturado} €` : '—'}
      </td>
    </tr>`).join('')

  const albaran = albaranNumero ? ` (Albarán: <strong>${albaranNumero}</strong>)` : ''

  const html = layout(`
    <div class="card">
      <h1>Incidencias en la recepción${albaran}</h1>
      <p>Hola <strong>${nombreProveedor}</strong>, hemos recibido tu entrega en <strong>${nombreRestaurante}</strong> y hemos detectado las siguientes diferencias:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid ${C.rule};border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:${C.bg2};">
            <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${C.fg3};">Artículo</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${C.fg3};">Tipo</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${C.fg3};">Detalle</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Por favor, contacta con nosotros para resolverlo. Gracias por tu colaboración.</p>
      <p style="font-size:13px;color:${C.fg3};margin-top:8px;">— ${nombreRestaurante}</p>
    </div>
  `, `Incidencias en tu entrega a ${nombreRestaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Incidencias en tu entrega a ${nombreRestaurante}`,
    html,
  })
}

// ── EMAIL: Notificación ASN al proveedor ─────────────────────
export async function enviarEmailAsnProveedor({
  email,
  nombreProveedor,
  nombreRestaurante,
  articulo,
  cantidad,
  unidad,
  asnUrl,
  fechaEntregaEstimada,
}: {
  email: string
  nombreProveedor: string
  nombreRestaurante: string
  articulo: string
  cantidad: number
  unidad: string
  asnUrl: string
  fechaEntregaEstimada?: string
}) {
  const html = layout(`
    <div class="card">
      <h1>Nuevo pedido de ${nombreRestaurante}</h1>
      <p>Hola <strong>${nombreProveedor}</strong>, ${nombreRestaurante} ha realizado un pedido y te pedimos que confirmes el envío antes de la entrega.</p>
      <hr class="divider">
      <p><strong>Artículo:</strong> ${articulo}</p>
      <p><strong>Cantidad:</strong> ${cantidad} ${unidad}</p>
      ${fechaEntregaEstimada ? `<p><strong>Fecha estimada:</strong> ${fechaEntregaEstimada}</p>` : ''}
      <hr class="divider">
      <p>Antes de salir, notifícanos el envío en este enlace (válido 72h). Nos permite preparar la recepción y detectar incidencias automáticamente:</p>
      <div class="token-box">🔗 ${asnUrl}</div>
      <a href="${asnUrl}" class="btn">Notificar envío →</a>
      <p style="font-size:12px;color:${C.fg3};margin-top:12px;">Este enlace no requiere contraseña. Solo tienes que confirmar los items y subir tu albarán si lo deseas.</p>
    </div>
  `, `Nuevo pedido de ${nombreRestaurante} — confirma el envío`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Nuevo pedido de ${nombreRestaurante}`,
    html,
  })
}

// ── EMAIL: Alerta incidencia al responsable de compras ───────
export async function enviarEmailAlertaCompras({
  email,
  nombreResponsable,
  nombreRestaurante,
  nombreProveedor,
  albaranNumero,
  numIncidencias,
  resumen,
}: {
  email: string
  nombreResponsable: string
  nombreRestaurante: string
  nombreProveedor: string
  albaranNumero?: string | null
  numIncidencias: number
  resumen: string
}) {
  const albaran = albaranNumero ? ` — Albarán ${albaranNumero}` : ''

  const html = layout(`
    <div class="card">
      <h1>⚠️ Recepción con ${numIncidencias} incidencia${numIncidencias > 1 ? 's' : ''}${albaran}</h1>
      <p>Hola <strong>${nombreResponsable}</strong>, se ha confirmado una recepción en <strong>${nombreRestaurante}</strong> con incidencias del proveedor <strong>${nombreProveedor}</strong>.</p>
      <div class="token-box" style="font-family:inherit;white-space:pre-line;font-size:13px;">${resumen}</div>
      <p>El proveedor ha sido notificado automáticamente. El historial queda guardado en la ficha del proveedor.</p>
      <a href="${BASE}/owner" class="btn">Ver ficha proveedor →</a>
    </div>
  `, `⚠️ ${numIncidencias} incidencia${numIncidencias > 1 ? 's' : ''} — ${nombreProveedor}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `⚠️ Incidencias recepción — ${nombreProveedor}`,
    html,
  })
}

// ── EMAIL: RECADV — Confirmación de recepción al proveedor ───────────────────
export async function enviarEmailRecadvProveedor({
  email,
  nombreProveedor,
  nombreRestaurante,
  albaranNumero,
  fechaPago,
  importe,
  numArticulos,
}: {
  email: string
  nombreProveedor: string
  nombreRestaurante: string
  albaranNumero?: string | null
  fechaPago?: string | null
  importe?: number | null
  numArticulos?: number
}) {
  const albaran = albaranNumero ? ` (Albarán: <strong>${albaranNumero}</strong>)` : ''
  const pagoInfo = fechaPago && importe
    ? `<p>✅ Pago previsto: <strong>${importe.toFixed(2)} €</strong> el <strong>${fechaPago}</strong></p>`
    : fechaPago
    ? `<p>✅ Pago previsto el <strong>${fechaPago}</strong></p>`
    : ''

  const html = layout(`
    <div class="card">
      <h1>✅ Recepción confirmada${albaran}</h1>
      <p>Hola <strong>${nombreProveedor}</strong>, confirmamos que hemos recibido correctamente tu envío en <strong>${nombreRestaurante}</strong>.</p>
      ${numArticulos ? `<p><strong>${numArticulos} artículo${numArticulos > 1 ? 's' : ''}</strong> recibidos sin incidencias.</p>` : ''}
      ${pagoInfo}
      <hr class="divider">
      <p>Si no has subido aún tu factura, puedes hacerlo respondiendo a este email o usando el mismo link de notificación de envío. El pago se ejecutará una vez validada la factura.</p>
      <p style="font-size:13px;color:${C.fg3};">— ${nombreRestaurante}</p>
    </div>
  `, `Recepción confirmada — ${nombreRestaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `✅ Recepción confirmada — ${nombreRestaurante}`,
    html,
  })
}

// ── EMAIL: Solicitud de factura al proveedor ─────────────────────────────────
export async function enviarEmailSolicitarFactura({
  email,
  nombreProveedor,
  nombreRestaurante,
  albaranNumero,
  importe,
  uploadUrl,
}: {
  email: string
  nombreProveedor: string
  nombreRestaurante: string
  albaranNumero?: string | null
  importe?: number | null
  uploadUrl: string
}) {
  const albaran = albaranNumero ? ` correspondiente al albarán <strong>${albaranNumero}</strong>` : ''

  const html = layout(`
    <div class="card">
      <h1>Necesitamos tu factura</h1>
      <p>Hola <strong>${nombreProveedor}</strong>, hemos confirmado la recepción de tu envío${albaran} en <strong>${nombreRestaurante}</strong>.</p>
      ${importe ? `<p>Importe pendiente de facturar: <strong>${importe.toFixed(2)} €</strong></p>` : ''}
      <p>Para procesar el pago necesitamos tu factura. Puedes subirla en este enlace en menos de 1 minuto:</p>
      <div class="token-box">🔗 ${uploadUrl}</div>
      <a href="${uploadUrl}" class="btn">Subir factura →</a>
      <p style="font-size:12px;color:${C.fg3};margin-top:12px;">
        Acepta PDF, foto o imagen. La IA la procesa automáticamente y valida el importe contra la recepción.<br>
        Sin contraseña ni registro.
      </p>
    </div>
  `, `Sube tu factura — ${nombreRestaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Factura pendiente — ${nombreRestaurante}`,
    html,
  })
}

// ── EMAIL: Confirmación de pago ejecutado al proveedor ───────────────────────
export async function enviarEmailPagoEjecutado({
  email,
  nombreProveedor,
  nombreRestaurante,
  importe,
  canal,
  referencia,
  concepto,
}: {
  email: string
  nombreProveedor: string
  nombreRestaurante: string
  importe: number
  canal: 'sepa' | 'stripe'
  referencia?: string | null
  concepto?: string | null
}) {
  const canalLabel = canal === 'sepa'
    ? '🏦 Transferencia SEPA (recibirás en 1-2 días hábiles)'
    : '⚡ Stripe Connect (pago instantáneo)'

  const html = layout(`
    <div class="card">
      <h1>Pago ejecutado</h1>
      <p>Hola <strong>${nombreProveedor}</strong>, confirmamos que se ha procesado el siguiente pago desde <strong>${nombreRestaurante}</strong>:</p>
      <hr class="divider">
      <p><strong>Importe:</strong> ${importe.toFixed(2)} €</p>
      <p><strong>Canal:</strong> ${canalLabel}</p>
      ${concepto ? `<p><strong>Concepto:</strong> ${concepto}</p>` : ''}
      ${referencia ? `<p><strong>Referencia:</strong> ${referencia}</p>` : ''}
      <hr class="divider">
      <p style="font-size:13px;color:${C.fg3};">Si tienes alguna pregunta sobre este pago, responde a este email.</p>
    </div>
  `, `Pago de ${importe.toFixed(2)} € — ${nombreRestaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Pago de ${importe.toFixed(2)} € recibido — ${nombreRestaurante}`,
    html,
  })
}

// ── EMAIL: RECADV — Confirmación de recepción al proveedor ───────────────────

// ── EMAIL: Alerta error técnico al owner ─────────────────────────────────────
export async function enviarEmailErrorTecnicoOwner({
  email,
  nombreRestaurante,
  tipo,
  descripcion,
  accion,
}: {
  email: string
  nombreRestaurante: string
  tipo: string
  descripcion: string
  accion: string
}) {
  const html = layout(`
    <div class="card">
      <h1>⚠️ Incidencia técnica detectada</h1>
      <p>Hemos detectado un problema técnico en <strong>${nombreRestaurante}</strong> que puede estar afectando al uso de ia.rest.</p>
      <hr class="divider">
      <p><strong>Tipo:</strong> ${tipo}</p>
      <p><strong>Qué ha pasado:</strong> ${descripcion}</p>
      <hr class="divider">
      <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;">Qué debes hacer</h2>
      <p>${accion}</p>
      <hr class="divider">
      <p style="font-size:13px;color:${C.fg3};">Si el problema persiste tras seguir los pasos, responde a este email o escríbenos a <a href="mailto:hola@iarest.es">hola@iarest.es</a> y lo resolvemos de inmediato.</p>
    </div>
  `, `Incidencia en ${nombreRestaurante} — acción requerida`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `⚠️ Incidencia en ${nombreRestaurante} — acción requerida`,
    html,
  })
}

// ── EMAIL: Nuevo lead desde landing ──────────────────────────
export async function enviarEmailNuevoLead({
  nombre,
  restaurante,
  email,
  telefono,
  usuarios,
}: {
  nombre: string
  restaurante: string
  email: string
  telefono?: string | null
  usuarios?: string | null
}) {
  const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  const html = layout(`
    <div class="card">
      <h1>🔥 Nuevo lead — landing</h1>
      <hr class="divider">
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Restaurante:</strong> ${restaurante}</p>
      <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      <p><strong>Teléfono:</strong> ${telefono || '—'}</p>
      <p><strong>Usuarios:</strong> ${usuarios || '—'}</p>
      <hr class="divider">
      <p style="font-size:13px;color:${C.fg3};">${fecha}</p>
      <a href="${BASE}/super" class="btn">Ver en /super →</a>
    </div>
  `, `Nuevo lead: ${nombre} — ${restaurante}`)

  return getResend().emails.send({
    from: FROM,
    to: 'hola@iarest.es',
    subject: `🔥 Nuevo lead: ${nombre} — ${restaurante}`,
    html,
  })
}

// ── Función genérica de envío (para propuestas y otros usos internos) ─────────
// ── EMAIL: Cierre de un portal de cobros de grupo (resumen al dueño) ──
export async function enviarEmailCierreCobros({
  email,
  nombreRestaurante,
  titulo,
  totalPagado,
  pagados,
  pendientes,
}: {
  email: string
  nombreRestaurante: string
  titulo: string
  totalPagado: number
  pagados: Array<{ nombre: string; concepto: string; importe: number }>
  pendientes: Array<{ nombre: string; concepto: string; telefono?: string | null }>
}) {
  const td = `padding:6px 8px;border-bottom:1px solid ${C.rule};font-size:13px;color:${C.fg2}`
  const filasPag = pagados.length
    ? pagados.map(p => `<tr><td style="${td}">${p.nombre}</td><td style="${td}">${p.concepto}</td><td style="${td};text-align:right;white-space:nowrap">${p.importe.toFixed(2)} €</td></tr>`).join('')
    : `<tr><td style="${td}" colspan="3">Sin pagos registrados</td></tr>`
  const filasPend = pendientes.length
    ? pendientes.map(p => `<tr><td style="${td}">${p.nombre}</td><td style="${td}">${p.concepto}</td><td style="${td}">${p.telefono || '—'}</td></tr>`).join('')
    : `<tr><td style="${td}" colspan="3">Ninguno 🎉</td></tr>`

  const html = layout(`
    <div class="card">
      <h1>Cierre de “${titulo}”.</h1>
      <p>Hola ${nombreRestaurante}, el portal de cobro ha cerrado. Aquí tienes el resumen para organizar.</p>
      <p><strong>Total cobrado:</strong> ${totalPagado.toFixed(2)} € · ${pagados.length} pago${pagados.length !== 1 ? 's' : ''}</p>
      <hr class="divider">
      <p style="font-weight:700;margin-bottom:6px">Pagados</p>
      <table style="width:100%;border-collapse:collapse">${filasPag}</table>
      <hr class="divider">
      <p style="font-weight:700;margin-bottom:6px">Pendientes <span style="font-weight:400;color:${C.fg3}">(por si quieres llamarles)</span></p>
      <table style="width:100%;border-collapse:collapse">${filasPend}</table>
    </div>
  `, `Resumen de cobros — ${titulo}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Resumen de cobros — ${titulo}`,
    html,
  })
}

// ── EMAIL: Recordatorio a un invitado que dejó el pago a medias ──
export async function enviarEmailRecordatorioPagoCobro({
  email,
  nombre,
  titulo,
  link,
}: {
  email: string
  nombre: string
  titulo: string
  link: string
}) {
  const html = layout(`
    <div class="card">
      <h1>Te queda un pago pendiente.</h1>
      <p>Hola ${nombre || ''}, dejaste tu pago a medias para <strong>${titulo}</strong> y el plazo termina pronto. Puedes completarlo en un minuto:</p>
      <a href="${link}" class="btn">Completar mi pago →</a>
    </div>
  `, `Pago pendiente — ${titulo}`)

  return getResend().emails.send({
    from: FROM,
    to: email,
    subject: `Te queda pendiente tu pago — ${titulo}`,
    html,
  })
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo = 'hola@iarest.es',
}: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to,
    subject,
    html,
    ...(text && { text }),
    replyTo,
  })
  if (error) throw new Error(error.message)
  return data
}
