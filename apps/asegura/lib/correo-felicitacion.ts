// El correo de cumpleaños (24/09/2026). Corto y sin nada que vender, a propósito: una felicitación
// con una oferta dentro deja de ser una felicitación y pasa a ser una comunicación comercial
// (art. 21 LSSI), que exige otro consentimiento. Tampoco nombra pólizas, compañías ni importes: el
// buzón puede ser compartido. Lo vigila `felicitaciones.test.ts`.
// La de EX-clientes (30/10/2026, decisión de Alberto) sí es comunicación comercial: se ampara en la relación
// contractual previa (art. 21.2 LSSI) y lleva el mismo mecanismo de baja. Sale siempre de hola@grupoasegura.es.
import { MEDIADOR, REMITENTE_CORREDURIA, remitenteCorreo } from '@central/module-seguros'
import { telefonoCorto, type VarianteExcliente } from './felicitaciones-exclientes-reglas.ts'

export type DatosFelicitacion = { nombre: string | null; enlace: string }

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Logo en PNG servido por la web pública (apps/asegura-web/public/brand): Gmail y Outlook no pintan
// SVG, y el portal/asegura van tras login. Colores = MARCA_ASEGURA (@central/brand) en hex: en un
// correo no hay oklch ni variables CSS.
export const LOGO_CORREO = 'https://grupoasegura.es/brand/logotipo-asegura-correo.png'
const AZUL = '#3364ee'
const TINTA = '#1b2340'

export function cuerpoFelicitacion(d: DatosFelicitacion): { asunto: string; texto: string; html: string } {
  const nombre = d.nombre?.trim() || null
  const saludo = nombre ? `¡Feliz cumpleaños, ${nombre}!` : '¡Feliz cumpleaños!'
  const p1 = 'Hoy es tu día y desde Grupo ASegura queríamos acordarnos de ti. Te deseamos un cumpleaños estupendo, rodeado de los tuyos.'
  const p2 = 'Gracias por seguir confiando en nosotros.'
  return plantilla({
    asunto: saludo, saludo, parrafos: [p1, p2], boton: { texto: 'Tu área de clientes', enlace: d.enlace },
    textoEnlace: `Tu área de clientes: ${d.enlace}`, firma: 'El equipo de Grupo ASegura',
  })
}

// ─── Ex-clientes (30/10/2026) ────────────────────────────────────────────────
// Decisión de Alberto: a quien ya no tiene la cartera con nosotros se le felicita y se le recuerda su área de
// clientes; al `ex_cliente` además se le ofrece, sin compromiso, revisar sus seguros. Al `posible_cliente` (póliza
// vigente que CIMA no trae: puede seguir siendo cliente) NO se le dice que ya no está con nosotros ni se le ofrece
// nada. Mismo envoltorio, mismo logo y mismo mecanismo de baja que la felicitación de clientes.

export type VarianteCorreoExcliente = VarianteExcliente

export function cuerpoFelicitacionExcliente(d: DatosFelicitacion & { variante: VarianteCorreoExcliente }): { asunto: string; texto: string; html: string } {
  const nombre = d.nombre?.trim() || null
  const saludo = nombre ? `¡Feliz cumpleaños, ${nombre}!` : '¡Feliz cumpleaños!'
  const p1 = 'Hoy es tu día y desde Grupo ASegura queríamos acordarnos de ti. ¡Que lo disfrutes muchísimo! 🎉'
  const area = d.variante === 'ex_cliente'
    ? 'Te recordamos que sigues teniendo acceso gratuito a tu área de clientes, aunque ahora no tengas tus seguros con nosotros: '
    : 'Te recordamos que sigues teniendo acceso gratuito a tu área de clientes: '
  const p2 = `${area}puedes guardar ahí tus pólizas de cualquier compañía y te avisamos antes de que venzan, igual que de la ITV o del carnet de conducir. Solo tienes que entrar con tu email.`
  const parrafos = [p1, p2]
  if (d.variante === 'ex_cliente') {
    parrafos.push(`Y si algún día quieres que revisemos tus seguros, sin compromiso, aquí nos tienes: ${telefonoCorto(MEDIADOR.identidad.telefono)} (también por WhatsApp).`)
  }
  const firmante = MEDIADOR.identidad.nombre.split(/\s+/).slice(0, 2).join(' ')
  return plantilla({
    asunto: `🎂 ${saludo}`, saludo, parrafos, boton: { texto: 'Entrar en mi área de clientes', enlace: d.enlace },
    textoEnlace: `Entrar en mi área de clientes: ${d.enlace}`, firma: `${firmante} — ${MEDIADOR.marca}`,
  })
}

/** Envoltorio ÚNICO de las felicitaciones (logo PNG, colores de marca, pie y baja). */
function plantilla(c: { asunto: string; saludo: string; parrafos: string[]; boton: { texto: string; enlace: string }; textoEnlace: string; firma: string }): { asunto: string; texto: string; html: string } {
  if (!/^https:\/\//.test(c.boton.enlace)) throw new Error('enlace_no_https')
  const baja = 'Si prefieres no recibir estas felicitaciones, contesta a este correo y dejamos de enviarlas.'
  const texto = [c.saludo, '', ...c.parrafos.flatMap((p) => [p, '']), c.textoEnlace, '', 'Un abrazo,', c.firma, '', `Grupo ASegura · ${REMITENTE_CORREDURIA}`, baja].join('\n')
  const cuerpo = 'font-family:\'Nunito Sans\',system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const html = [
    `<div style="background:#f3f5fc;padding:24px 12px">`,
    `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:28px 32px 20px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:26px;line-height:1.25;color:${AZUL};margin:0 0 14px">${escapar(c.saludo)} 🎂</p>`,
    ...c.parrafos.map((p, i) => `<p style="font-size:16px;line-height:1.6;margin:0 0 ${i === c.parrafos.length - 1 ? 22 : 14}px">${escapar(p)}</p>`),
    `<a href="${escapar(c.boton.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:16px;padding:12px 22px;border-radius:10px">${escapar(c.boton.texto)}</a>`,
    `<p style="font-size:16px;line-height:1.5;margin:26px 0 0">Un abrazo,<br><strong>${escapar(c.firma)}</strong></p>`,
    `</div>`,
    `<div style="background:#f3f5fc;padding:16px 32px;font-size:12px;line-height:1.5;color:#5a6280">Grupo ASegura · ${REMITENTE_CORREDURIA}<br>${escapar(baja)}</div>`,
    `</div></div>`,
  ].join('')
  return { asunto: c.asunto, texto, html }
}

export type ResultadoFelicitacion = 'enviado' | 'sin_proveedor' | 'rechazado'

export async function enviarFelicitacion(
  destino: string,
  d: DatosFelicitacion,
  quien: { correduriaId: string; clienteId: string },
): Promise<ResultadoFelicitacion> {
  // Import dinámico: el cepo del cuerpo corre con `node --test`, que no resuelve Prisma ni `@central/core-email`.
  const { enviarCorreoCliente } = await import('./correo-envio')
  const { asunto, texto, html } = cuerpoFelicitacion(d)
  // Sale por el punto único con seguimiento: queda en `correo_envio` y sus eventos en la ficha.
  return enviarCorreoCliente({ ...quien, tipo: 'felicitacion', to: destino, asunto, texto, html })
}

export async function enviarFelicitacionExcliente(
  destino: string,
  d: DatosFelicitacion & { variante: VarianteCorreoExcliente },
  quien: { correduriaId: string; clienteId: string; anio: number },
): Promise<ResultadoFelicitacion> {
  const { enviarCorreoCliente } = await import('./correo-envio')
  const { asunto, texto, html } = cuerpoFelicitacionExcliente(d)
  // Idempotencia de Resend (24 h): un doble ✅ que se colara no manda dos correos.
  return enviarCorreoCliente({
    correduriaId: quien.correduriaId, clienteId: quien.clienteId, tipo: 'felicitacion', to: destino, asunto, texto, html,
    idempotencia: `felicitacion-excliente:${quien.clienteId}:${quien.anio}`,
    // Alberto (30/10/2026): felicitaciones y reconquista salen de hola@grupoasegura.es, pase lo que pase con la env.
    remitente: remitenteCorreo(REMITENTE_CORREDURIA),
  })
}
