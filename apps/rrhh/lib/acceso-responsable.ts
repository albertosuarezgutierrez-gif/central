// Acceso del RESPONSABLE (panel /admin) por EMAIL + CÓDIGO de 6 dígitos, SIN contraseña (26/10/2026,
// decisión de Alberto: igual que el empleado en /e/entrar y que el portal de seguros).
//
// No hay lógica de código propia: usa el núcleo de `acceso-email.ts` (`pedirCodigo`/`canjearCodigo`,
// mismos topes, misma tabla `rrhh.acceso_otps`, mismo `@central/core-identity/codigo-otp`) con
// propósito 'responsable'. 🚨 El propósito va en el prefijo de los HMAC: un código pedido en
// /e/entrar nunca abre /login ni al revés (cepo en `auth-separacion.test.ts`).
//
// Reglas: respuesta IDÉNTICA exista o no el responsable (fila siempre; el correo solo si es
// responsable, y fuera de la respuesta con `after()`); el código en claro no toca la BD.
import {
  pedirCodigo, canjearCodigo, VALIDEZ_MINUTOS, type RepoOtp, type ErrorPedir, type ErrorCanjear,
} from './acceso-email'

export type EmpresaResponsable = { id: string; nombre: string }
/** `empresas` = las de `rrhh.usuario_empresas`; si no tiene ninguna, la de `usuarios_rrhh.empresa_id`. */
export type Responsable = { usuario_id: string; nombre: string; empresas: EmpresaResponsable[] }

export interface RepoResponsable extends RepoOtp {
  /** Responsable cuyo email normalizado es este, o `null`. */
  responsablePorEmail(emailNormalizado: string): Promise<Responsable | null>
}

/** `url` = dónde entrar (`RRHH_PUBLIC_URL` + /login). `marcaAsegura` = la petición vino del host propio. */
export type CorreoCodigoResponsable = { to: string; nombre: string; codigo: string; marcaAsegura: boolean; url: string }
export type EnviarCodigoResponsable = (c: CorreoCodigoResponsable) => Promise<boolean>

// ── Paso 1 ──────────────────────────────────────────────────────────────────────────────────
export async function solicitarCodigoResponsable(
  repo: RepoResponsable, enviar: EnviarCodigoResponsable,
  entrada: { email: unknown; ip: string; marcaAsegura: boolean; url: string }, ahora = new Date(),
): Promise<{ ok: true; envio: (() => Promise<boolean>) | null } | ErrorPedir> {
  const p = await pedirCodigo(repo, entrada, 'responsable', ahora)
  if (!p.ok) return p
  const r = await repo.responsablePorEmail(p.email)
  // No responsable → la fila ya está escrita (topes iguales), pero NO se envía nada a nadie.
  if (!r) return { ok: true, envio: null }
  return { ok: true, envio: () => enviar({ to: p.email, nombre: r.nombre, codigo: p.codigo, marcaAsegura: entrada.marcaAsegura, url: entrada.url }) }
}

// ── Paso 2 ──────────────────────────────────────────────────────────────────────────────────
export type ResultadoVerificarResponsable =
  | { ok: true; paso: 'sesion'; usuario_id: string; empresa_id: string }
  | { ok: true; paso: 'elegir'; usuario_id: string; empresas: EmpresaResponsable[] }
  | ErrorCanjear
  | { ok: false; error: 'sin_acceso'; status: 401 }

export async function verificarCodigoResponsable(
  repo: RepoResponsable, entrada: { email: unknown; codigo: unknown }, ahora = new Date(),
): Promise<ResultadoVerificarResponsable> {
  const c = await canjearCodigo(repo, entrada, 'responsable', ahora)
  if (!c.ok) return c
  const r = await repo.responsablePorEmail(c.email)
  // Código válido pero el responsable ya no existe (o no tiene empresa): no hay sesión.
  if (!r || r.empresas.length === 0) return { ok: false, error: 'sin_acceso', status: 401 }
  if (r.empresas.length === 1) return { ok: true, paso: 'sesion', usuario_id: r.usuario_id, empresa_id: r.empresas[0].id }
  return { ok: true, paso: 'elegir', usuario_id: r.usuario_id, empresas: r.empresas }
}

// ── Correo ──────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

/** Remitente: misma dirección verificada de `MAIL_FROM`; con marca, el nombre visible es «Grupo ASegura». */
export function remitente(mailFrom: string, marcaAsegura: boolean): string {
  if (!marcaAsegura) return mailFrom
  const m = mailFrom.match(/<([^>]+)>/)
  return `Grupo ASegura <${m ? m[1] : mailFrom.trim()}>`
}

/** Asunto, texto y HTML (sobrio; sin imágenes: Gmail no pinta SVG). Puro para testearlo. */
export function correoCodigoResponsable(c: CorreoCodigoResponsable): { subject: string; text: string; html: string } {
  const marca = c.marcaAsegura ? 'Grupo ASegura' : 'ia·rrhh'
  const panel = `el panel de RR.HH.${c.marcaAsegura ? ' de Grupo ASegura' : ''}`
  const hola = `Hola${c.nombre ? ` ${c.nombre}` : ''}:`
  const pie = `Caduca en ${VALIDEZ_MINUTOS} minutos y solo sirve una vez. Si no lo has pedido tú, ignora este mensaje: nadie podrá entrar sin el código.`
  const color = c.marcaAsegura ? '#3364ee' : '#0f766e'
  return {
    subject: `${marca} · Tu código para entrar en el panel de RR.HH.`,
    text: `${hola}\n\nTu código para entrar en ${panel} es:\n\n    ${c.codigo}\n\nEntra en ${c.url}\n\n${pie}\n`,
    html:
      `<div style="font-family:'Nunito Sans',Arial,sans-serif;color:#1f2937;max-width:480px">` +
      `<p style="font-family:Quicksand,Arial,sans-serif;font-weight:700;font-size:20px;color:${color};margin:0 0 16px">${esc(marca)}</p>` +
      `<p>${esc(hola)}</p><p>Tu código para entrar en ${esc(panel)} es:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${esc(c.codigo)}</p>` +
      `<p>Entra en <a href="${esc(c.url)}" style="color:${color}">${esc(c.url)}</a></p>` +
      `<p style="color:#6b7280;font-size:13px">${esc(pie)}</p></div>`,
  }
}
