// La marca en TODOS los correos al cliente (29/09/2026). Idea de Alberto: que el cliente aprenda
// que lo que llega con el «AS» de Grupo ASegura es de sus seguros.
//
// ⚠️ Lo que esto NO hace: autenticar. Un logo en el cuerpo lo copia cualquiera que imite el correo;
// lo único que el cliente puede comprobar de verdad es la dirección del remitente. Por eso el pie
// nombra el dominio (`@grupoasegura.es`) y no promete nada más. El avatar de la bandeja de entrada
// (el círculo con la inicial en Gmail) NO se pinta desde el HTML: sale de la cuenta de Google del
// remitente (foto de `public/brand/avatar-asegura.png` de asegura-web) o de BIMI en el DNS.
//
// Se aplica en el punto de salida, no en cada plantilla: así un correo nuevo la lleva sin acordarse.
// Los que ya traen su cabecera con el logo (felicitación, emisión, presupuesto…) se dejan tal cual.
import { MEDIADOR, REMITENTE_CORREDURIA } from './mediador.ts'

/** PNG (Gmail/Outlook no pintan SVG) servido por la web pública, que no va tras login. */
export const LOGO_CORREO_URL = 'https://grupoasegura.es/brand/logotipo-asegura-correo.png'

// Hex de MARCA_ASEGURA (@central/brand): en un correo no hay oklch ni variables CSS.
const AZUL = '#3364ee'
const TINTA = '#1b2340'
const FONDO = '#f3f5fc'

export const PIE_MARCA_CORREO = `Nuestros correos salen siempre de una dirección @${REMITENTE_CORREDURIA.split('@')[1]} y llevan esta marca. Si te llega uno con nuestro nombre desde otra dirección, no es nuestro.`

/** Envuelve el HTML en la cabecera con el logotipo y un pie de marca. Idempotente. */
export function conMarcaCorreo(html: string): string {
  if (html.includes(LOGO_CORREO_URL)) return html
  const cuerpo = "font-family:'Nunito Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  return [
    `<div style="background:${FONDO};padding:24px 12px">`,
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:24px 28px 18px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO_URL}" width="220" height="32" alt="${MEDIADOR.marca}" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:24px 28px">${html}</div>`,
    `<div style="background:${FONDO};padding:14px 28px;font-size:12px;line-height:1.5;color:#5a6280">${MEDIADOR.marca} · ${REMITENTE_CORREDURIA}<br>${PIE_MARCA_CORREO}</div>`,
    `</div></div>`,
  ].join('')
}
