// Variables y render del contrato de encargo. PURO (sin BD ni red; sha256 con Web Crypto).
//
// Reglas que sostiene:
//  · `variablesContrato` FALLA si falta un dato (lista «Falta: …»): nunca rellena con «N/A», «—» ni vacío. Un contrato con
//    un hueco no se emite (cepo: contrato.test.ts).
//  · `renderContrato` lanza si queda un `{{…}}` sin sustituir: nada sale con una variable a medias.
//  · Todo valor se ESCAPA antes de entrar en el HTML (la razón social la teclea el operador).
//  · Lo que se firma es el HTML EXACTO que devuelve `renderContrato` (bytes UTF-8): su sha256 es la huella del contrato.
import { bloquesAnexo, CATALOGO, dependenciasQueFaltan, type IdHerramienta } from './catalogo.ts'
import { cifValido, nifPersonaValido } from './documentos.ts'

export type Encargado = {
  marca: string
  identidad: { nombre: string; nif: string; figura: string; claveDgsfp: string; domicilio: string; email: string }
}

export type TituloRepresentacion = 'administrador' | 'apoderado'
export const TITULOS: Record<TituloRepresentacion, string> = { administrador: 'Administrador', apoderado: 'Apoderado' }
export const esTitulo = (v: unknown): v is TituloRepresentacion => v === 'administrador' || v === 'apoderado'

export type DatosCuenta = {
  razonSocial: string | null
  cif: string | null
  domicilio: { via: string | null; numero: string | null; resto?: string | null; cp: string | null; municipio: string | null; provincia: string | null }
}
export type DatosFirmante = { nombre: string | null; nif: string | null; titulo: TituloRepresentacion | null; email: string | null }

export type VariablesContrato = {
  empresa: { razon_social: string; nif: string; domicilio: string }
  firmante: { nombre: string; nif: string; cargo: string; titulo: TituloRepresentacion; email: string }
  encargado: { nombre: string; nif: string; figura: string; clave_dgsfp: string; domicilio: string; email: string; marca: string }
  herramientas: IdHerramienta[]
  contrato: { numero: string }
  plantilla: { version: string }
  version: number
  fecha: string
}

/** Valores de cajón que NO cuentan como dato (regla del monorepo: el valor de cajón se anula antes de escribir). */
const CAJON = /^(n\/?a|-+|—|\?+|null|undefined|sin dato|desconocid[oa]|x+)$/i
const dato = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t && !CAJON.test(t) ? t : null
}

/** dd/mm/aaaa en Europe/Madrid. */
export function fechaLegible(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function domicilioLegible(d: DatosCuenta['domicilio']): string | null {
  const via = dato(d.via); const num = dato(d.numero); const cp = dato(d.cp); const mun = dato(d.municipio); const prov = dato(d.provincia)
  if (!via || !num || !cp || !/^\d{5}$/.test(cp) || !mun || !prov) return null
  const resto = dato(d.resto ?? null)
  return `${via}, nº ${num}${resto ? `, ${resto}` : ''}, ${cp} ${mun} (${prov})`
}

export type ResultadoVariables = { ok: true; variables: VariablesContrato } | { ok: false; faltan: string[] }

export function variablesContrato(e: {
  cuenta: DatosCuenta
  firmante: DatosFirmante | null
  encargado: Encargado
  herramientas: readonly IdHerramienta[]
  numero: string | null
  version: number
  plantillaVersion: string
  fecha: Date
}): ResultadoVariables {
  const faltan: string[] = []
  const razon = dato(e.cuenta.razonSocial)
  if (!razon) faltan.push('razón social')
  const cif = cifValido(e.cuenta.cif)
  if (!cif) faltan.push('CIF válido de la sociedad')
  const domicilio = domicilioLegible(e.cuenta.domicilio)
  if (!domicilio) faltan.push('domicilio social completo (calle, número, CP, municipio y provincia)')
  const f = e.firmante
  if (!f) faltan.push('firmante (dueño con poderes)')
  const nombreF = dato(f?.nombre)
  if (f && !nombreF) faltan.push('nombre del firmante')
  const nifF = nifPersonaValido(f?.nif)
  if (f && !nifF) faltan.push('NIF/NIE válido del firmante')
  if (f && !f.titulo) faltan.push('título del firmante (administrador o apoderado)')
  const emailF = dato(f?.email)
  if (f && (!emailF || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailF))) faltan.push('correo del firmante')
  if (!e.herramientas.length) faltan.push('al menos una herramienta')
  faltan.push(...dependenciasQueFaltan(e.herramientas))
  const numero = dato(e.numero)
  if (!numero) faltan.push('número de contrato')
  if (!Number.isInteger(e.version) || e.version < 1) faltan.push('número de versión')
  const enc = e.encargado.identidad
  for (const [k, v] of Object.entries({ marca: e.encargado.marca, ...enc })) if (!dato(v)) faltan.push(`dato del encargado: ${k}`)
  if (faltan.length || !f) return { ok: false, faltan }
  return {
    ok: true,
    variables: {
      empresa: { razon_social: razon!, nif: cif!, domicilio: domicilio! },
      firmante: { nombre: nombreF!, nif: nifF!, cargo: TITULOS[f.titulo!], titulo: f.titulo!, email: emailF!.toLowerCase() },
      encargado: {
        nombre: enc.nombre, nif: enc.nif, figura: enc.figura.charAt(0).toLowerCase() + enc.figura.slice(1),
        clave_dgsfp: enc.claveDgsfp, domicilio: enc.domicilio, email: enc.email, marca: e.encargado.marca,
      },
      herramientas: [...e.herramientas],
      contrato: { numero: numero! },
      plantilla: { version: e.plantillaVersion },
      version: e.version,
      fecha: fechaLegible(e.fecha),
    },
  }
}

/** Número legible del contrato marco de una cuenta (uno por empresa). */
export const numeroContrato = (cif: string) => `ENC-${cif}`

// ─── Markdown mínimo → HTML (solo lo que usa la plantilla: títulos, párrafos, listas, tablas, citas, hr, <sub>, **, *) ──
export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function enLinea(s: string): string {
  // Se escapa TODO y luego se reponen solo las marcas conocidas (nada de HTML del texto pasa crudo salvo <sub>).
  let h = escHtml(s)
  h = h.replace(/&lt;sub&gt;([\s\S]*?)&lt;\/sub&gt;/g, '<sub>$1</sub>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
  return h
}

export function markdownAHtml(md: string): string {
  const lineas = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i]
    if (!l.trim()) { i++; continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    if (h) { out.push(`<h${h[1].length}>${enLinea(h[2])}</h${h[1].length}>`); i++; continue }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    if (l.startsWith('|')) {
      const filas: string[][] = []
      while (i < lineas.length && lineas[i].startsWith('|')) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!celdas.every((c) => /^:?-+:?$/.test(c))) filas.push(celdas)
        i++
      }
      const [cab, ...cuerpo] = filas
      const vacia = cab.every((c) => !c)
      out.push('<table>' + (vacia ? '' : `<thead><tr>${cab.map((c) => `<th>${enLinea(c)}</th>`).join('')}</tr></thead>`) +
        `<tbody>${cuerpo.map((f) => `<tr>${f.map((c, k) => (vacia && k === 0 ? `<th scope="row">${enLinea(c)}</th>` : `<td>${enLinea(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    if (/^\s*(\d+\.|-)\s+/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l)
      const items: string[] = []
      while (i < lineas.length && lineas[i].trim() && !/^#{1,4}\s/.test(lineas[i]) && !lineas[i].startsWith('|')) {
        const m = /^\s*(?:\d+\.|-)\s+(.*)$/.exec(lineas[i])
        if (m) items.push(m[1]); else items[items.length - 1] += ' ' + lineas[i].trim()
        i++
      }
      const inicio = ordenada ? Number(/^\s*(\d+)\./.exec(l)![1]) : 1
      out.push(`<${ordenada ? `ol${inicio !== 1 ? ` start="${inicio}"` : ''}` : 'ul'}>${items.map((x) => `<li>${enLinea(x)}</li>`).join('')}</${ordenada ? 'ol' : 'ul'}>`)
      continue
    }
    if (l.startsWith('>')) {
      const partes: string[] = []
      while (i < lineas.length && lineas[i].startsWith('>')) { partes.push(lineas[i].replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${enLinea(partes.join(' '))}</blockquote>`)
      continue
    }
    const partes: string[] = []
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|\||---\s*$|>)/.test(lineas[i]) && !/^\s*(\d+\.|-)\s+/.test(lineas[i])) {
      partes.push(lineas[i].trim()); i++
    }
    out.push(`<p>${enLinea(partes.join(' '))}</p>`)
  }
  return out.join('\n')
}

// ─── Sustitución de variables ──────────────────────────────────────────────────────────────────────────────────────
/** Escapa los caracteres que el markdown mínimo interpreta, para que un dato tecleado no se convierta en formato. */
const literalMd = (s: string) => s.replace(/[*|<>]/g, (c) => ({ '*': '∗', '|': '¦', '<': '‹', '>': '›' }[c]!))

function anexoMd(lista: readonly IdHerramienta[]): string {
  return bloquesAnexo(lista).map((b) => `### ${b.id} ${b.titulo}\n\n| | |\n|---|---|\n${b.filas.map(([k, v]) => `| **${k}** | ${v} |`).join('\n')}`).join('\n\n')
}

export function sustituir(plantilla: string, v: VariablesContrato): string {
  const planos: Record<string, string> = {
    'empresa.razon_social': v.empresa.razon_social, 'empresa.nif': v.empresa.nif, 'empresa.domicilio': v.empresa.domicilio,
    'firmante.nombre': v.firmante.nombre, 'firmante.nif': v.firmante.nif, 'firmante.cargo': v.firmante.cargo,
    'encargado.nombre': v.encargado.nombre, 'encargado.nif': v.encargado.nif, 'encargado.figura': v.encargado.figura,
    'encargado.clave_dgsfp': v.encargado.clave_dgsfp, 'encargado.domicilio': v.encargado.domicilio,
    'encargado.email': v.encargado.email, 'encargado.marca': v.encargado.marca,
    'contrato.numero': v.contrato.numero, 'plantilla.version': v.plantilla.version,
    version: String(v.version), fecha: v.fecha,
  }
  const estructurales: Record<string, string> = {
    herramientas: v.herramientas.map((h) => `   - **${CATALOGO[h].nombre}** (Anexo I, bloque ${CATALOGO[h].anexo.id})`).join('\n'),
    anexo_i: anexoMd(v.herramientas),
  }
  const texto = plantilla.replace(/\{\{([a-z_.]+)\}\}/g, (m, k: string) =>
    k in estructurales ? estructurales[k] : k in planos ? literalMd(planos[k]) : m)
  const resto = texto.match(/\{\{[^}]*\}\}/g)
  if (resto) throw new Error(`Variables sin sustituir en el contrato: ${[...new Set(resto)].join(', ')}`)
  return texto
}

/** Nº de marcas «pendiente de confirmar» (borrador sin revisión de abogado). */
export const marcasPendientes = (texto: string) => (texto.match(/pendiente de confirmar/gi) ?? []).length

const ESTILO = 'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1b2340;line-height:1.55;font-size:15px}' +
  'h1{font-size:22px}h2{font-size:18px;margin-top:28px}h3{font-size:15px;margin-top:20px}table{border-collapse:collapse;width:100%;margin:12px 0;display:block;overflow-x:auto}' +
  'th,td{border:1px solid #d5d9e6;padding:6px 8px;text-align:left;vertical-align:top}blockquote{color:#5a6280;margin:8px 0;padding-left:12px;border-left:3px solid #d5d9e6}sub{color:#5a6280}'

/** Documento HTML COMPLETO y autocontenido que se firma. Determinista: mismos datos → mismos bytes. */
export function renderContrato(plantilla: string, v: VariablesContrato): string {
  const cuerpo = markdownAHtml(sustituir(plantilla, v))
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Contrato de encargo del tratamiento ${escHtml(v.contrato.numero)} v${v.version}</title><style>${ESTILO}</style></head><body>\n${cuerpo}\n</body></html>`
}

export async function sha256Hex(texto: string | Uint8Array): Promise<string> {
  const bytes = typeof texto === 'string' ? new TextEncoder().encode(texto) : texto
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Certificado de firma (documento aparte, también inmutable y con hash). Sin datos más allá de los de la firma. */
export function certificadoHtml(c: {
  numero: string; version: number; documentoSha256: string; firmante: string; nifFirmante: string; titulo: string; email: string
  empresa: string; cif: string; firmadoEn: Date; ip: string; userAgent: string; metodo: string; consentimiento: string; marca: string
}): string {
  const fila = (k: string, v: string) => `<tr><th scope="row">${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Certificado de firma ${escHtml(c.numero)} v${c.version}</title><style>${ESTILO}</style></head><body>` +
    `<h1>Certificado de firma electrónica</h1><p>Firma electrónica avanzada (Reglamento eIDAS, art. 26) del contrato de encargo del tratamiento.</p><table><tbody>` +
    fila('Contrato', `${c.numero} · versión ${c.version}`) +
    fila('Huella SHA-256 del documento firmado', c.documentoSha256) +
    fila('Responsable', `${c.empresa} (${c.cif})`) +
    fila('Firmante', `${c.firmante} · NIF ${c.nifFirmante} · ${c.titulo}`) +
    fila('Correo verificado del firmante', c.email) +
    fila('Método', c.metodo === 'otp_email' ? 'Código de un solo uso enviado al correo del firmante en el momento de firmar' : c.metodo) +
    fila('Fecha y hora (UTC)', c.firmadoEn.toISOString()) +
    fila('Dirección IP', c.ip) +
    fila('Navegador', c.userAgent) +
    fila('Consentimiento aceptado', c.consentimiento) +
    `</tbody></table><p><sub>Emitido por ${escHtml(c.marca)}. Para comprobar la integridad, el sha256 del contrato descargado debe coincidir con la huella de arriba.</sub></p></body></html>`
}
