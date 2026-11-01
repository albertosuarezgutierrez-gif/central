// El CUADRO COMPARATIVO y el ANÁLISIS de los PDF de presupuesto (21/10/2026). Lo usan los dos PDF:
//   · `presupuesto-pdf-ofertas.ts` (estudio de ofertas de compañías: PDF, bots),
//   · `presupuesto-pdf.ts` (presupuesto de Avant2), que hasta hoy salía SIN cuadro, sin resumen y sin etiqueta IA.
// PURO salvo el pintado: recibe el `estudio` congelado (`compararOfertas` + narrativa validada) y no recalcula nada.
//
// 🚨 `null` = «No figura» (el dato no consta), NUNCA «no cubre» ni 0. Un precio que no es de un año (`primaPeriodo`)
//    se enseña con su periodo, nunca como «No figura» ni como «/año».
// 🏷️ El análisis lleva SIEMPRE su etiqueta (`etiquetaResumen`): IA revisada por el corredor, o plantilla.
// 🚨 El orden por prima (`ranking`) es para el corredor: aquí no se pinta. Ni avisos internos de la compañía.

import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib'
import { etiquetaResumen, etiquetasOfertas, type CeldaMatriz, type FilaMatriz, type OfertaNormalizada, type ResultadoComparacion, type ValorGarantia } from '@central/module-seguros'
import { eur } from './dinero.ts'
import { hex, paraFuente, partir } from './presupuesto-pdf-base.ts'

// ─── Datos ───────────────────────────────────────────────────────────────────

/** `fuente` decide la etiqueta visible (IA revisada por el corredor / plantilla). Ausente en estudios viejos = plantilla. */
export type NarrativaPdf = { resumen: string; recomendacion: string; fuente?: string | null; revisada?: boolean | null }

/** El `estudio` congelado del presupuesto, ya validado de forma. */
export type EstudioPdf = {
  recomendadaId: string | null
  actualId: string | null
  comparacion: ResultadoComparacion
  narrativa: NarrativaPdf
  /** `estudio.rpa.incompleto`: ofertas del bot sin garantías fiables (borrador incompleto → sin PDF). */
  incompletas?: string[]
}

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const esTxt = (v: unknown): v is string => typeof v === 'string'

/**
 * El `estudio` de la BD → lo que pinta el PDF. Una forma que no cuadra da `null`: el PDF no se genera a
 * medias con un estudio que no se entiende.
 */
export function leerEstudio(json: unknown): EstudioPdf | null {
  if (!esObj(json)) return null
  const c = json.comparacion
  const n = json.narrativa
  if (!esObj(c) || !esObj(n)) return null
  if (!Array.isArray(c.ofertas) || !Array.isArray(c.filas) || !Array.isArray(c.resumen)) return null
  if (!esTxt(n.resumen) || !esTxt(n.recomendacion)) return null
  if (!c.ofertas.every((o) => esObj(o) && esTxt(o.id) && esTxt(o.compania) && esObj(o.garantias))) return null
  if (!c.filas.every((f) => esObj(f) && esTxt(f.clave) && esTxt(f.etiqueta) && Array.isArray(f.celdas))) return null
  if (!c.resumen.every((r) => esObj(r) && esTxt(r.ofertaId))) return null
  const inc = esObj(json.rpa) && Array.isArray(json.rpa.incompleto)
    ? json.rpa.incompleto.filter(esObj).map((o) => `${esTxt(o.compania) ? o.compania : ''} · ${esTxt(o.producto) ? o.producto : ''}`.trim())
    : []
  return {
    ...(inc.length ? { incompletas: inc } : {}),
    recomendadaId: esTxt(json.recomendadaId) ? json.recomendadaId : null,
    actualId: esTxt(json.actualId) ? json.actualId : null,
    comparacion: c as unknown as ResultadoComparacion,
    narrativa: { resumen: n.resumen, recomendacion: n.recomendacion, fuente: esTxt(n.fuente) ? n.fuente : null, revisada: typeof n.revisada === 'boolean' ? n.revisada : null },
  }
}

// ─── Lógica de vista (pura, con test) ────────────────────────────────────────

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export const NO_FIGURA = 'No figura'

export type MarcaCeldaPdf = 'peor' | 'mejor' | 'hueco' | null
/** El icono de la celda (se DIBUJA, no es un carácter: Nunito no trae ✓/✗). `null` = celda con cifra, sin icono. */
export type IconoCelda = 'si' | 'no' | 'nose'

/** Lo que se escribe en una celda del cuadro (`\n` separa líneas). `null`/sin dato = «No figura». */
export function textoCelda(c: CeldaMatriz | undefined): { texto: string; marca: MarcaCeldaPdf; icono: IconoCelda } {
  if (!c || !c.consta || !c.valor) return { texto: NO_FIGURA, marca: c?.hueco ? 'hueco' : null, icono: 'nose' }
  const v: ValorGarantia = c.valor
  const marca: MarcaCeldaPdf = c.hueco ? 'hueco' : c.peorQueActual ? 'peor' : c.mejorQueActual ? 'mejor' : null
  if (v.estado === 'excluida') return { texto: 'Excluida', marca, icono: 'no' }
  const l: string[] = []
  if (num(v.capital) && num(v.limite)) l.push(eur(v.capital), `Límite ${eur(v.limite)}`)
  else if (num(v.capital)) l.push(eur(v.capital))
  else if (num(v.limite)) l.push(`Límite ${eur(v.limite)}`)
  else if (v.estado === 'incluida') l.push('Incluida')
  if (num(v.franquicia)) l.push(`Franquicia ${eur(v.franquicia)}`)
  return l.length ? { texto: l.join('\n'), marca, icono: 'si' } : { texto: NO_FIGURA, marca, icono: 'nose' }
}

/**
 * 01/11/2026 (AS-26-0042): las ofertas cuya columna sería ENTERA «No figura» (con el cuadro con filas). Nunca se pinta una columna así:
 * el PDF no se genera hasta que la oferta tenga garantías (el borrador queda marcado incompleto y Alberto lo sabe). PURA.
 */
export function ofertasSinGarantias(cmp: Pick<ResultadoComparacion, 'ofertas' | 'filas'>): OfertaNormalizada[] {
  if (cmp.filas.length === 0) return []
  return cmp.ofertas.filter((o) => o.rol !== 'actual').filter((o) => cmp.filas.every((f) => textoCelda(f.celdas.find((c) => c.ofertaId === o.id)).icono === 'nose'))
}

/** El estudio tiene columnas enteras «No figura»: no se genera el PDF. */
export class EstudioIncompletoError extends Error {
  ofertas: readonly string[]
  constructor(ofertas: readonly string[]) {
    super(`Estudio incompleto: sin garantías leídas en ${ofertas.join(', ')}`)
    this.name = 'EstudioIncompletoError'
    this.ofertas = ofertas
  }
}

/**
 * Las columnas del cuadro por página: la póliza actual (si la hay) en TODAS, para poder comparar sin
 * volver atrás, y las ofertas repartidas hasta `max` columnas por tabla.
 */
export function repartirColumnas(ofertas: readonly OfertaNormalizada[], max = 4): OfertaNormalizada[][] {
  const actual = ofertas.find((o) => o.rol === 'actual') ?? null
  const resto = ofertas.filter((o) => o !== actual)
  const hueco = Math.max(1, max - (actual ? 1 : 0))
  if (resto.length === 0) return actual ? [[actual]] : []
  const trozos: OfertaNormalizada[][] = []
  for (let i = 0; i < resto.length; i += hueco) trozos.push([...(actual ? [actual] : []), ...resto.slice(i, i + hueco)])
  return trozos
}

/** Las filas del cuadro para un trozo de columnas: las que NINGUNA de esas ofertas menciona se omiten. */
export function filasParaColumnas(filas: readonly FilaMatriz[], ids: readonly string[]): FilaMatriz[] {
  return filas.filter((f) => f.celdas.some((c) => ids.includes(c.ofertaId) && c.consta))
}

/** Cabecera de cada columna: compañía y, si hace falta para distinguirla, su nivel (`etiquetasOfertas`). */
export function cabecerasColumnas(ofertas: readonly OfertaNormalizada[]): Map<string, string> {
  const e = etiquetasOfertas(ofertas)
  for (const o of ofertas) if (o.rol === 'actual') e.set(o.id, `${e.get(o.id) ?? o.compania} (tu póliza actual)`)
  return e
}

const esEstimado = (o: Pick<OfertaNormalizada, 'firmeza' | 'fuente'>) => o.firmeza === 'estimado'

/**
 * El precio de una oferta tal como se escribe en el cuadro:
 *   · prima anual comparable → «291,24€/año»;
 *   · precio de otro periodo (Avant2) → «291,24€ (6 meses)» o «291,24€ (periodo no declarado)» — nunca «/año»;
 *   · nada → «No figura».
 * Con `*` si es un precio ESTIMADO (la compañía lo confirma al emitir).
 */
export function textoPrimaOferta(o: Pick<OfertaNormalizada, 'primaTotal' | 'primaPeriodo' | 'firmeza' | 'fuente'>): string {
  const marca = esEstimado(o) ? ' *' : ''
  if (num(o.primaTotal)) return `${eur(o.primaTotal)}/año${marca}`
  const pp = o.primaPeriodo
  if (pp && num(pp.importe)) return `${eur(pp.importe)} (${num(pp.meses) ? `${pp.meses} meses` : 'periodo sin confirmar'})${marca}`
  return NO_FIGURA
}

/**
 * La frase de debajo del título del cuadro, según de dónde salen los precios. «Tal como constan en los documentos»
 * solo vale para los PDF de compañía: un precio de Avant2 es un precio ESTIMADO que calcula la compañía.
 */
export function textoFuenteCuadro(ofertas: readonly Pick<OfertaNormalizada, 'rol' | 'fuente' | 'firmeza'>[]): string {
  const candidatas = ofertas.filter((o) => o.rol !== 'actual')
  const deAvant2 = candidatas.filter((o) => o.fuente === 'avant2').length
  const actual = ofertas.find((o) => o.rol === 'actual')
  const finActual = actual?.fuente === 'poliza_actual' ? ' Tu póliza actual, con la prima y las coberturas que constan en nuestra cartera.' : ''
  if (deAvant2 > 0 && deAvant2 === candidatas.length) {
    return 'Precios estimados que calcula cada compañía con tus datos: pueden variar al contratar y la compañía los confirma al emitir. ' +
      'Coberturas según la ficha de cada producto. «No figura» = la compañía no lo indica.' + finActual
  }
  if (deAvant2 > 0) {
    return 'Importes de los documentos de cada compañía; los marcados con * son precios estimados que la compañía calcula con tus datos ' +
      'y pueden variar al contratar. «No figura» = el dato no consta.' + finActual
  }
  return 'Importes tal como constan en los documentos de cada compañía. «No figura» = el dato no consta en el documento.' + finActual
}

/** Notas al pie del cuadro (estimados y precios que no son de un año). */
export function notasCuadro(ofertas: readonly Pick<OfertaNormalizada, 'primaTotal' | 'primaPeriodo' | 'firmeza' | 'fuente'>[]): string[] {
  const n: string[] = []
  if (ofertas.some((o) => esEstimado(o) && (num(o.primaTotal) || !!o.primaPeriodo))) n.push('* Precio estimado: la compañía lo confirma al emitir.')
  if (ofertas.some((o) => !num(o.primaTotal) && o.primaPeriodo)) {
    n.push('Un precio sin «/año» no es de un año completo (o la compañía no declara su periodo): no se compara como prima anual.')
  }
  return n
}

export const LEYENDA_ICONOS = 'Incluida · Excluida · No figura (el dato no consta: no quiere decir que no esté cubierta)'

/**
 * La LLAMADA A LA ACCIÓN del PDF: cómo aceptar. 🚨 Sin enlace con token (el PDF se reenvía; el enlace del portal va solo
 * por correo/WhatsApp y caduca): se acepta contestando o llamando con la REFERENCIA propia. PURO.
 */
export function textoLlamadaAccion(c: { referencia: string | null; telefono?: string | null; email?: string | null }): { titulo: string; cuerpo: string } {
  const canales = [c.telefono ? `llámanos o escríbenos por WhatsApp al ${c.telefono}` : null, c.email ? `escríbenos a ${c.email}` : null].filter(Boolean)
  const como = canales.length ? canales.join(' o ') : 'contesta al mensaje con el que te lo enviamos'
  const ref = c.referencia ? ` y cita la referencia ${c.referencia}` : ''
  return {
    titulo: 'Acepta tu presupuesto',
    cuerpo: `¿Te encaja una opción? Para aceptarla, ${como}${ref}. También puedes aceptarla desde el enlace que te mandamos con este presupuesto. Te confirmamos el precio con la compañía antes de emitir.`,
  }
}

// ─── Pintado ─────────────────────────────────────────────────────────────────

export const A4: [number, number] = [595.28, 841.89]
export const M = 44
export const PIE = 46
const PRIMARIO = hex('#3364ee')
const SUAVE = hex('#E3EFFF')
const TEXTO = hex('#161616')
const TENUE = hex('#6B6B6B')
const BORDE = hex('#E4E4E4')
const VERDE = hex('#15803D')
const VERDE_SUAVE = hex('#E7F6EC')
const ROJO = hex('#B42318')
const ROJO_SUAVE = hex('#FDECEA')
const AMBAR = hex('#9A6700')
const AMBAR_SUAVE = hex('#FFF4D6')
/** Cobalto OSCURO para texto pequeño sobre el fondo suave: #3364ee sobre #E3EFFF no llega a 4,5:1 (AA). */
const PRIMARIO_TEXTO = hex('#2445B8')
const ESCALA_LOGO: Record<string, number> = { mapfre: 1.2, generali: 1.6, fidelidade: 0.7 }

const GRUPOS_TXT: Record<string, string> = {
  danos: 'Daños materiales', rc: 'Responsabilidad civil', asistencia: 'Asistencia', juridica: 'Defensa jurídica', otros: 'Otras garantías',
}

export type FuentesPdf = { titulo: PDFFont; normal: PDFFont; negrita: PDFFont }

/** Lo que el cuadro necesita del PDF que lo contiene: la página y la `y` VIVAS (cada PDF las lleva en sus cierres). */
export interface LienzoPdf {
  readonly f: FuentesPdf
  readonly ancho: number
  readonly pagina: PDFPage
  y: number
  nuevaPagina(): void
  cabe(alto: number): void
  linea(t: string, x: number, yy: number, font: PDFFont, tam: number, color?: RGB): void
  parrafo(t: string, font: PDFFont, tam: number, color?: RGB): void
  chip(t: string, x: number, yy: number, fondo: RGB, color: RGB): number
  /** El logo de la compañía (los mismos PNG que el portal y plataforma); `null` = no hay: se escribe el nombre. */
  logoDe?(compania: string): Promise<PDFImage | null>
}

/** Dibuja el icono de una celda (✓ verde, ✗ rojo, ? gris) en un hueco de 8×8 con esquina superior izquierda (x, yTop). */
function icono(L: LienzoPdf, tipo: IconoCelda, x: number, yTop: number) {
  const p = L.pagina
  if (tipo === 'si') {
    p.drawLine({ start: { x, y: yTop - 4.5 }, end: { x: x + 2.8, y: yTop - 7.2 }, thickness: 1.3, color: VERDE })
    p.drawLine({ start: { x: x + 2.8, y: yTop - 7.2 }, end: { x: x + 7.5, y: yTop - 1 }, thickness: 1.3, color: VERDE })
  } else if (tipo === 'no') {
    p.drawLine({ start: { x: x + 0.5, y: yTop - 0.8 }, end: { x: x + 6.5, y: yTop - 6.8 }, thickness: 1.3, color: ROJO })
    p.drawLine({ start: { x: x + 0.5, y: yTop - 6.8 }, end: { x: x + 6.5, y: yTop - 0.8 }, thickness: 1.3, color: ROJO })
  } else {
    p.drawCircle({ x: x + 3.6, y: yTop - 3.9, size: 3.8, borderColor: TENUE, borderWidth: 0.8 })
    L.linea('?', x + 2.1, yTop - 6.1, L.f.negrita, 6, TENUE)
  }
}

function tituloSeccion(L: LienzoPdf, t: string, tam = 14, siguiente = 40) {
  L.cabe(tam + 12 + siguiente)
  L.linea(t, M, L.y - tam, L.f.titulo, tam)
  L.y -= tam + 12
}

/** El cuadro de garantías (y precios) de un estudio, con la póliza actual en cada tabla y su leyenda. */
export async function pintarCuadroComparativo(L: LienzoPdf, cmp: ResultadoComparacion, opts: { titulo?: string; recomendadaId?: string | null } = {}): Promise<void> {
  const { f } = L
  const trozos = repartirColumnas(cmp.ofertas, 4)
  if (trozos.length === 0 || cmp.filas.length === 0) return
  const vacias = ofertasSinGarantias(cmp)
  if (vacias.length > 0) throw new EstudioIncompletoError(vacias.map((o) => `${o.compania} · ${o.producto ?? ''}`.trim()))
  const actual = cmp.ofertas.find((o) => o.rol === 'actual') ?? null
  const nombres = cabecerasColumnas(cmp.ofertas)
  if (L.y - 200 < M + PIE) L.nuevaPagina()
  tituloSeccion(L, opts.titulo ?? 'Cuadro comparativo de garantías', 14, 90)
  L.parrafo(textoFuenteCuadro(cmp.ofertas), f.normal, 8.5, TENUE)
  L.y -= 6
  const wEt = 128
  const tamC = 8
  for (const [n, cols] of trozos.entries()) {
    const ids = cols.map((o) => o.id)
    const filas = filasParaColumnas(cmp.filas, ids)
    if (filas.length === 0) continue
    const wC = (L.ancho - wEt) / cols.length
    const ALTO_LOGO = 16
    const cabecera = async () => {
      const logos = await Promise.all(cols.map((o) => (L.logoDe ? L.logoDe(o.compania) : Promise.resolve(null))))
      const conLogo = logos.some(Boolean)
      // Con logo, el nombre debajo es el nivel/la etiqueta (la compañía ya la dice el logo); sin logo, el nombre entero.
      const lineas = cols.map((o) => partir(f.negrita, paraFuente(f.negrita, nombres.get(o.id) ?? o.compania), 8, wC - 8).slice(0, 3))
      const precios = cols.map((o) => partir(f.negrita, paraFuente(f.negrita, textoPrimaOferta(o)), 8.5, wC - 8).slice(0, 2))
      const rec = cols.map((o) => o.id === opts.recomendadaId)
      const nPrecio = Math.max(...precios.map((l) => l.length))
      const alto = 10 + (conLogo ? ALTO_LOGO + 6 : 0) + Math.max(...lineas.map((l) => l.length)) * 10 + (rec.some(Boolean) ? 13 : 0) + nPrecio * 11 + 6
      L.cabe(alto + 40)
      L.pagina.drawRectangle({ x: M, y: L.y - alto, width: L.ancho, height: alto, color: SUAVE })
      for (const [i, o] of cols.entries()) {
        const x = M + wEt + i * wC + 4
        let yy = L.y - 8
        if (rec[i]) L.pagina.drawRectangle({ x: x - 4, y: L.y - alto, width: wC, height: alto, borderColor: PRIMARIO, borderWidth: 1.2 })
        const img = logos[i]
        if (img) {
          const k = ESCALA_LOGO[(o.compania.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().split(/[\s,.]+/)[0] ?? '')] ?? 1
          const h = Math.min(ALTO_LOGO * k, ((wC - 10) * img.height) / img.width)
          L.pagina.drawImage(img, { x, y: yy - h, width: (img.width / img.height) * h, height: h })
        }
        if (conLogo) yy -= ALTO_LOGO + 6
        lineas[i].forEach((l, k) => L.linea(l, x, yy - 8 - k * 10, f.negrita, 8, PRIMARIO_TEXTO))
        yy -= lineas[i].length * 10
        if (rec[i]) { L.chip('Recomendada', x, yy - 10, PRIMARIO, hex('#FFFFFF')); }
        precios[i].forEach((l, k) => L.linea(l, x, L.y - alto + 6 + (nPrecio - 1 - k) * 11, f.negrita, 8.5, TEXTO))
      }
      L.linea('Precio', M + 6, L.y - alto + 6, f.normal, 8, TENUE)
      L.y -= alto
    }
    if (trozos.length > 1) {
      L.cabe(60)
      L.linea(`Tabla ${n + 1} de ${trozos.length}`, M, L.y - 8, f.normal, 8, TENUE)
      L.y -= 14
    }
    await cabecera()
    let grupoActual: string | null = null
    for (const fila of filas) {
      const celdas = cols.map((o) => textoCelda(fila.celdas.find((c) => c.ofertaId === o.id)))
      // Hueco de 11 pt a la izquierda para el icono (✓ ✗ ?).
      const lc = celdas.map((c) => partir(f.normal, paraFuente(f.normal, c.texto), tamC, wC - 19))
      const le = partir(f.negrita, paraFuente(f.negrita, fila.etiqueta), 8, wEt - 12)
      const nl = Math.max(le.length, ...lc.map((l) => l.length))
      const alto = 8 + nl * 10
      const altoGrupo = fila.grupo !== grupoActual ? 16 : 0
      if (L.y - (alto + altoGrupo) < M + PIE) { L.nuevaPagina(); await cabecera(); grupoActual = null }
      if (fila.grupo !== grupoActual) {
        grupoActual = fila.grupo
        L.linea(GRUPOS_TXT[fila.grupo] ?? 'Otras garantías', M + 6, L.y - 11, f.titulo, 8.5, PRIMARIO_TEXTO)
        L.y -= 16
      }
      celdas.forEach((c, i) => {
        const x = M + wEt + i * wC
        if (c.marca === 'peor') L.pagina.drawRectangle({ x, y: L.y - alto, width: wC, height: alto, color: ROJO_SUAVE })
        else if (c.marca === 'mejor') L.pagina.drawRectangle({ x, y: L.y - alto, width: wC, height: alto, color: VERDE_SUAVE })
        else if (c.marca === 'hueco') L.pagina.drawRectangle({ x, y: L.y - alto, width: wC, height: alto, color: AMBAR_SUAVE })
        const color = c.texto === NO_FIGURA ? TENUE : c.marca === 'peor' ? ROJO : c.marca === 'mejor' ? VERDE : TEXTO
        icono(L, c.icono, x + 4, L.y - 3)
        lc[i].forEach((l, k) => L.linea(l, x + 15, L.y - 9.5 - k * 10, f.normal, tamC, color))
      })
      le.forEach((l, k) => L.linea(l, M + 6, L.y - 9 - k * 10, f.negrita, 8))
      L.y -= alto
      L.pagina.drawRectangle({ x: M, y: L.y, width: L.ancho, height: 0.5, color: BORDE })
    }
    L.y -= 10
  }
  // Leyenda de los iconos (siempre) y de los colores (solo con póliza actual con la que comparar).
  L.cabe(16)
  {
    let x = M
    for (const [t, txt] of [['si', 'Incluida'], ['no', 'Excluida'], ['nose', 'No figura (el dato no consta: no quiere decir que no esté cubierta)']] as const) {
      icono(L, t, x, L.y - 2)
      L.linea(txt, x + 11, L.y - 8.5, f.normal, 7.5, TENUE)
      x += 11 + f.normal.widthOfTextAtSize(paraFuente(f.normal, txt), 7.5) + 12
    }
    L.y -= 16
  }
  if (actual) {
    L.cabe(20)
    let x = M
    x += L.chip('Menos cobertura que la actual', x, L.y - 8, ROJO_SUAVE, ROJO) + 6
    x += L.chip('Más cobertura que la actual', x, L.y - 8, VERDE_SUAVE, VERDE) + 6
    L.chip('Figura en la actual y no en la oferta', x, L.y - 8, AMBAR_SUAVE, AMBAR)
    L.y -= 22
  }
  for (const nota of notasCuadro(cmp.ofertas)) L.parrafo(nota, f.normal, 7.5, TENUE)
  L.y -= 4
}

/** «Análisis y recomendación» con la etiqueta SIEMPRE visible de quién lo redactó. No pinta nada si no hay texto. */
export function pintarAnalisis(L: LienzoPdf, narrativa: NarrativaPdf): void {
  const { f } = L
  const hayTexto = narrativa.resumen.trim() !== '' || narrativa.recomendacion.trim() !== ''
  if (!hayTexto) return
  L.y -= 6
  tituloSeccion(L, 'Análisis y recomendación', 14, 60)
  L.parrafo(etiquetaResumen(narrativa.fuente, narrativa.revisada), f.negrita, 8.5, TENUE)
  L.y -= 6
  if (narrativa.resumen.trim()) {
    L.linea('Análisis', M, L.y - 10, f.titulo, 10.5, PRIMARIO)
    L.y -= 18
    L.parrafo(narrativa.resumen.trim(), f.normal, 9.5)
    L.y -= 8
  }
  if (narrativa.recomendacion.trim()) {
    L.cabe(40)
    L.linea('Recomendación', M, L.y - 10, f.titulo, 10.5, PRIMARIO)
    L.y -= 18
    L.parrafo(narrativa.recomendacion.trim(), f.normal, 9.5)
    L.y -= 8
  }
}


/** La llamada a la acción: una caja cobalto, visible, con cómo aceptar y la referencia (`textoLlamadaAccion`). */
export function pintarLlamadaAccion(L: LienzoPdf, c: { referencia: string | null; telefono?: string | null; email?: string | null }): void {
  const { f } = L
  const t = textoLlamadaAccion(c)
  const pad = 14
  const lineas = partir(f.normal, paraFuente(f.normal, t.cuerpo), 9.5, L.ancho - pad * 2)
  const alto = pad * 2 + 18 + lineas.length * 13
  L.cabe(alto + 12)
  const arriba = L.y
  L.pagina.drawRectangle({ x: M, y: arriba - alto, width: L.ancho, height: alto, color: PRIMARIO })
  const blanco = hex('#FFFFFF')
  L.linea(t.titulo, M + pad, arriba - pad - 12, f.titulo, 13, blanco)
  lineas.forEach((l, k) => L.linea(l, M + pad, arriba - pad - 30 - k * 13, f.normal, 9.5, blanco))
  L.y = arriba - alto - 14
}
