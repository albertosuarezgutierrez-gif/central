// Páginas HTML de las bajas públicas (campaña y recaptación).
//
// 🚨 La baja NO se ejecuta por GET (auditoría 02/11/2026): los escáneres de correo
// (antivirus, Safe Links, previsualizadores) abren todos los enlaces de un mensaje y daban de baja
// a la persona sin que lo pidiera. El GET solo muestra esta página con un botón; la baja la hace el
// POST. El POST «one-click» de Gmail/Yahoo (RFC 8058, cuerpo `List-Unsubscribe=One-Click`) sigue
// ejecutándola directamente y responde sin cuerpo; el POST del botón lleva `confirmar=1` y responde HTML.

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const ESTILO =
  `body{font-family:'Nunito Sans',system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#1b2340}` +
  `button{min-height:44px;padding:0 24px;border:0;border-radius:8px;background:#3364ee;color:#fff;font:inherit;font-weight:700;cursor:pointer}`

function documento(cuerpo: string): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>Baja</title><style>${ESTILO}</style></head><body>${cuerpo}</body></html>`
  )
}

/** Mensaje final (resultado). */
export function paginaMensajeBaja(mensaje: string): string {
  return documento(`<p>${escaparHtml(mensaje)}</p>`)
}

/** Confirmación del GET: formulario POST que conserva el token en la URL. */
export function paginaConfirmarBaja(accion: string, pregunta: string): string {
  return documento(
    `<p>${escaparHtml(pregunta)}</p>` +
      `<form method="post" action="${escaparHtml(accion)}">` +
      `<input type="hidden" name="confirmar" value="1"><button type="submit">Darme de baja</button></form>`,
  )
}

/** ¿El POST viene del botón de la página (HTML) y no del one-click de Gmail/Yahoo? */
export function esConfirmacionDeFormulario(cuerpo: string): boolean {
  return /(^|&)confirmar=1(&|$)/.test(cuerpo.trim())
}
