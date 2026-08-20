// ────────────────────────────────────────────────────────────────────────────
// Lectura del FORMULARIO que el Portal devuelve tras el usuario+contraseña
// (la pantalla «Conexión de usuarios» que pide el código). PURO.
//
// Por qué genérico y no con los nombres de campo a pelo: el formulario de
// recuperación de contraseña del Portal lleva un `<input type="hidden"
// name="namespace" value="c69f50ca…">`. Si el del código lleva algo parecido y
// no se reenvía, el POST falla — y cada fallo es un intento quemado contra un
// Portal que bloquea cuentas. Leyendo el formulario ENTERO se reenvía lo que
// haya, incluido lo que no sabíamos que estaba.
//
// Si no se reconoce el formulario, `null`. Quien llama NO debe inventarse un
// POST «a ver si cuela»: sin formulario reconocido, no hay sesión y se dice.
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'
import { norm } from './parsing.ts'

export interface FormularioOtp {
  /** `action` tal cual viene (puede ser relativo: lo resuelve quien llama). */
  action: string
  method: string
  /** Nombre del `<input>` donde va el código. */
  campoCodigo: string
  /**
   * TODO lo demás que el formulario ya trae relleno (ocultos y el botón), listo
   * para reenviar. El código se añade encima con `campoCodigo`.
   */
  campos: Record<string, string>
}

interface Campo { name: string; value: string; type: string }

function atributo(tag: string, nombre: string): string | null {
  const re = new RegExp(`\\b${nombre}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = re.exec(tag)
  if (!m) return null
  return decodificarHtml(m[2] ?? m[3] ?? m[4] ?? '')
}

function camposDe(html: string): Campo[] {
  const out: Campo[] = []
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0]
    const name = atributo(tag, 'name')
    if (!name) continue
    out.push({ name, value: atributo(tag, 'value') ?? '', type: (atributo(tag, 'type') ?? 'text').toLowerCase() })
  }
  return out
}

/** ¿Este campo es donde va el código? Por nombre/id, no por posición. */
function esCampoDeCodigo(c: Campo, tag: string): boolean {
  if (c.type !== 'text' && c.type !== 'tel' && c.type !== 'number' && c.type !== 'password') return false
  const id = atributo(tag, 'id') ?? ''
  // `verif` a propósito: el campo REAL del Portal se llama `codVerif`, que no
  // contiene «codigo» ni «code». Aquí acertaba de rebote por su `id`
  // (`labelCodigo`), y depender de eso es depender de una casualidad.
  const PISTA = /codig|c[oó]digo|code|otp|verif/i
  return PISTA.test(c.name) || PISTA.test(id)
}

/**
 * El formulario del código, si esta página lo tiene.
 *
 * @param html respuesta del `POST /id/login.php` con las credenciales.
 */
export function formularioOtp(html: string): FormularioOtp | null {
  if (!html) return null
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const cuerpo = m[2]
    const campos = camposDe(cuerpo)

    // El campo del código: se busca por su propia etiqueta, no por ser «el
    // primer text del form» — esa heurística se rompe en cuanto el Portal
    // añada un campo delante.
    let campoCodigo: string | null = null
    for (const t of cuerpo.matchAll(/<input\b[^>]*>/gi)) {
      const tag = t[0]
      const name = atributo(tag, 'name')
      if (!name) continue
      const c = campos.find((x) => x.name === name)
      if (c && esCampoDeCodigo(c, tag)) { campoCodigo = name; break }
    }
    if (!campoCodigo) continue

    const action = atributo(`<form${m[1]}>`, 'action') ?? ''
    const method = (atributo(`<form${m[1]}>`, 'method') ?? 'post').toLowerCase()

    // Se reenvía todo lo que ya venía con valor (ocultos, el submit), menos el
    // propio campo del código, que lo rellena quien llama.
    const enviar: Record<string, string> = {}
    for (const c of campos) {
      if (c.name === campoCodigo) continue
      if (c.type === 'checkbox' || c.type === 'radio') continue // sin marcar por defecto
      if (c.value !== '') enviar[c.name] = c.value
    }
    return { action, method, campoCodigo, campos: enviar }
  }
  return null
}

/** ¿La respuesta del login está pidiendo el segundo factor? */
export function pideCodigo(html: string): boolean {
  const t = norm(decodificarHtml((html ?? '').replace(/<[^>]*>/g, ' ')))
  return /codigo de verificacion/.test(t) && formularioOtp(html) != null
}

/**
 * Redacta de un HTML los campos que llevan la credencial.
 *
 * 🚨 El formulario del código del Portal reenvía la contraseña en un
 * `<input type="hidden" name="password">` (codificada, pero derivada de ella y
 * suficiente para completar el login junto al código). Cualquier volcado de esa
 * página —un endpoint de diagnóstico, un log, un fixture de test— la publicaría
 * sin querer. Lo detectó Claude en Chrome al capturarla, no yo.
 */
export function redactarSecretos(html: string): string {
  return (html ?? '').replace(/<input\b[^>]*>/gi, (tag) => {
    const name = atributo(tag, 'name') ?? ''
    const tipo = (atributo(tag, 'type') ?? '').toLowerCase()
    if (tipo !== 'password' && !/pass|clave|secret|token/i.test(name)) return tag
    return tag.replace(/\bvalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, 'value="«REDACTADO»"')
  })
}
