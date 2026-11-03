// Mapfre NSEI · diálogo «Controles técnicos» (v0.8.47). Tras «Continuar» desde «Datos básicos» el portal puede abrir un diálogo
// (`.controles-tecnicos-dialog`, en el cdk-overlay) con «Resultado · Código NNN · Controles técnicos · <motivo del rechazo>» y un
// botón «Cerrar». El diálogo trae además un formulario propio y vacío (Matrícula, Nº Bastidor, Teléfono Móvil, Email) cuyos
// «Campo obligatorio» NO son del paso. Aquí solo hay lógica PURA (sin Playwright ni red): detección, extracción y fecha de efecto.
// Sin datos personales: el texto del rechazo lo sanea quien llama (`limpiarMensajePortalDiagnosticoHasta`).

/** Diálogo de controles técnicos (DOM real). */
export const SEL_DIALOGO_CONTROLES_TECNICOS = '.controles-tecnicos-dialog'
/** Todo lo que vive en un overlay/diálogo: sus `mat-error` no son errores del paso del stepper. */
export const SEL_OVERLAY_EXCLUIDO = '.controles-tecnicos-dialog, .cdk-overlay-container, mat-dialog-container'

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** ¿El texto de un diálogo es el de controles técnicos (rótulo «Controles técnicos» + «Código NNN»)? PURA. */
export function esTextoControlesTecnicos(texto: string): boolean {
  const p = plano(texto)
  return p.includes('controles tecnicos') && /\bcodigo\s*\d{1,5}\b/.test(p)
}

export type RechazoControlesTecnicos = { codigo: string; texto: string }

/**
 * Código y motivo del rechazo: lo que sigue a «Código NNN» (y a «Controles técnicos»), cortado en el formulario propio del
 * diálogo (Matrícula / Nº Bastidor / Teléfono / Email) o en «Cerrar». `limpiar` sanea el motivo. `null` = no es el diálogo. PURA.
 */
export function extraerRechazoControlesTecnicos(texto: string, limpiar: (t: string) => string = (t) => t): RechazoControlesTecnicos | null {
  if (!esTextoControlesTecnicos(texto)) return null
  const t = texto.replace(/\s+/g, ' ').trim()
  const m = /c[oó]digo\s*(\d{1,5})\b/i.exec(t)
  if (!m) return null
  let resto = t.slice(m.index + m[0].length)
  resto = resto.replace(/^\s*[:·\-–]?\s*controles\s+t[eé]cnicos\s*[:·\-–]?\s*/i, '')
  const corte = /\b(Matr[ií]cula|N[º°o]\.?\s*Bastidor|Bastidor|Tel[eé]fono|Email|Cerrar)\b/i.exec(resto)
  if (corte) resto = resto.slice(0, corte.index)
  return { codigo: m[1]!, texto: limpiar(resto.replace(/^[\s:·\-–]+|[\s·]+$/g, '')) }
}

/** Mensaje de error de tipo portal para el rechazo. PURA. */
export function mensajeRechazoControlesTecnicos(r: RechazoControlesTecnicos): string {
  return `Mapfre rechaza (Código ${r.codigo}): ${r.texto || 'sin motivo legible'}`
}

/** Código 232: fecha de efecto anterior a la fecha de mecanización de la póliza. PURA. */
export function esRechazoFechaEfectoAnteriorMecanizacion(r: RechazoControlesTecnicos): boolean {
  return r.codigo === '232' || (/fecha de efecto/.test(plano(r.texto)) && /mecaniz/.test(plano(r.texto)))
}

type Ymd = { a: number; m: number; d: number }
function parseFechaEs(s: string): Ymd | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const d = Number(m[1])
  const mes = Number(m[2])
  const a = Number(m[3])
  const f = new Date(Date.UTC(a, mes - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d ? { a, m: mes, d } : null
}
const claveFecha = (f: Ymd) => f.a * 10_000 + f.m * 100 + f.d
const textoFecha = (f: Ymd) => `${String(f.d).padStart(2, '0')}/${String(f.m).padStart(2, '0')}/${f.a}`

/** Hoy en dd/mm/aaaa (Europe/Madrid) o el `Date` inyectado. */
export function hoyEs(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(ahora)
  const g = (t: string) => p.find((x) => x.type === t)!.value
  return `${g('day')}/${g('month')}/${g('year')}`
}

/**
 * Fecha de efecto a probar para el código 232: max(efecto, mecanización, hoy), dd/mm/aaaa. `null` = no se puede decidir con
 * seguridad (alguna ilegible o inválida: no se inventa). `cambia: false` = el efecto ya era esa (reintentar no arregla nada). PURA.
 */
export function fechaEfectoTrasMecanizacion(efecto: string | null, mecanizacion: string | null, hoy: string): { fecha: string; cambia: boolean } | null {
  if (efecto === null || mecanizacion === null) return null
  const e = parseFechaEs(efecto)
  const m = parseFechaEs(mecanizacion)
  const h = parseFechaEs(hoy)
  if (!e || !m || !h) return null
  const mayor = [e, m, h].reduce((x, y) => (claveFecha(y) > claveFecha(x) ? y : x))
  return { fecha: textoFecha(mayor), cambia: claveFecha(mayor) !== claveFecha(e) }
}

/** Aviso de supuesto (precio estimado) con la fecha de efecto usada. PURA. */
export function avisoFechaEfectoSupuesta(fecha: string): string {
  return `Precio estimado con la fecha de efecto ${fecha}: Mapfre rechazó la inicial (Código 232, anterior a la fecha de mecanización de la póliza) y el robot usó la mayor entre efecto, mecanización y hoy; confirma la fecha real antes de emitir.`
}
