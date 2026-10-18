// Presupuestos de origen `ofertas` en el portal (F4, 05/10/2026): PDFs de compañías leídos por IA y
// REVISADOS por el corredor, para ramos libres (comunidades, comercio…). PURO (sin BD ni React).
//
// 🚨 Lo que el portal sabe de cada oferta es lo que lleva su `presupuesto_opcion`: prima, franquicia y
// `coberturas` (nombre + incluida + «Capital X · Franquicia Y»). El estudio completo (comparación y
// narrativa) NO se concede al portal: sale en el PDF (`/api/presupuesto/pdf`).
// 🚨 «No figura» = el dato no consta en la oferta de la compañía. Nunca «No» ni 0.
// 🚨 Aquí no se calcula ningún ahorro ni se ordena por precio: el orden es el que congeló el corredor
// (la recomendada primero) y lo único que se destaca es lo que ÉL marcó.

import type { OpcionCliente } from './presupuesto'
import { montarTabla, type Celda } from './tabla-coberturas.ts'

export type OrigenVista = 'codeoscopic' | 'ofertas'

/** El origen leído de la BD. Cualquier otra cosa = `null`: no se sabe de dónde salen los precios. */
export function origenVista(v: unknown): OrigenVista | null {
  return v === 'codeoscopic' || v === 'ofertas' ? v : null
}

export const TEXTOS_OFERTAS = {
  titulo: 'Lo que te han ofrecido las compañías',
  firmeza: 'Precio según la oferta que nos ha mandado la compañía. Lo confirmo con ella antes de emitir.',
  revisaIntro:
    'Estos son tus datos de tomador y quién tramita la emisión. Comprueba que son correctos: la póliza se emite a tu nombre. Si alguno no lo es, dínoslo antes de aceptar.',
  sinDatos: 'No hemos podido leer tus datos de tomador. Llámanos y lo revisamos contigo: no se tramita nada hasta entonces.',
  casillaPista: '(tus datos, en la sección de arriba)',
  /** Título de la sección de datos en ofertas SIN tarificación detrás (PDF de compañía): no se «calculó» nada. */
  datosTitulo: 'Tus datos para este presupuesto',
  /** Ofertas del tarificador (18/10/2026): de dónde sale cada dato del bloque. */
  revisaBot: 'El código postal y la localidad son los que usó cada compañía para darte el precio (pueden no ser los de tu ficha); el conductor va en años, sin fechas.',
  nota:
    'Los importes y las garantías son los que constan en el documento de cada compañía. «No figura» significa que el dato no consta en su oferta, no que la garantía no esté cubierta. Lo que manda es el condicionado de cada compañía, y te lo paso entero antes de contratar.',
  pdf: 'Descargar el estudio comparativo (PDF)',
  pdfPista: 'Con el análisis y mi recomendación, para leerlo con calma.',
  sinOfertas: 'Este presupuesto no tiene ninguna oferta guardada. Escríbeme y lo reviso.',
  origenDesconocido:
    'No sé de dónde salen los precios de este presupuesto, así que no te los enseño ni te dejo aceptar nada. Llámanos y lo revisamos contigo.',
  comparativoTitulo: 'Cuadro comparativo',
  comparativoPlegable: 'Ver la comparativa completa de garantías',
  /** En la TARJETA, en vez de repetir la frase de supuestos (va entera en la sección de datos). */
  tarjetaSupuestos: 'Precio con supuestos · ver datos',
  sinLeer: 'Las garantías de esta oferta no se han podido leer. Eso no quiere decir que no cubra nada: pídeme su condicionado.',
} as const

/** La frase de validez de un presupuesto de ofertas. Nunca «válido hasta» a secas: la compañía no ha comprometido nada. */
export function textoValidezOfertas(recibidoEl: string, venceEl: string, caducado: boolean): string {
  return caducado
    ? `Estas ofertas las recibí el ${recibidoEl} y la fecha que me di para ellas (${venceEl}) ya ha pasado. No las doy por buenas: pídeme unas actualizadas.`
    : `Ofertas recibidas el ${recibidoEl}. Las compañías pueden cambiar su precio al emitir; me las guardo hasta el ${venceEl}.`
}

/** Lo único que se puede probar de un presupuesto de ofertas: cuántas compañías hay delante. */
export function textoCompaniasOfertas(n: number): string {
  return n === 1 ? 'Las ofertas que te pongo delante son de 1 compañía.' : `Las ofertas que te pongo delante son de ${n} compañías.`
}

/** Todo el texto FIJO de esta vista, para el cepo de copy (`copyFijo()` de `presupuesto-vista`). */
export function copyOfertas(): string[] {
  return [
    ...Object.values(TEXTOS_OFERTAS),
    textoValidezOfertas('1 de enero', '16 de enero', false),
    textoValidezOfertas('1 de enero', '16 de enero', true),
    textoCompaniasOfertas(1),
    textoCompaniasOfertas(3),
  ]
}

type OpcionMin = Pick<OpcionCliente, 'id' | 'orden' | 'compania' | 'producto' | 'papeles' | 'coberturasDetalle'>

export const esRecomendada = (o: Pick<OpcionCliente, 'papeles'>): boolean => o.papeles.includes('recomendada')

/** La recomendada primero y el resto en el orden congelado. Estable: dos iguales no se reordenan. */
export function ordenarOfertas<T extends Pick<OpcionCliente, 'papeles' | 'orden'>>(opciones: readonly T[]): T[] {
  return [...opciones].sort((a, b) => Number(esRecomendada(b)) - Number(esRecomendada(a)) || a.orden - b.orden)
}

/**
 * Las garantías que la oferta INCLUYE, para la tarjeta (`Etiqueta: Capital 200.000,00€`). `sinLeer` =
 * no constan (no se leyeron); es distinto de una lista vacía, que es «leída y sin garantías».
 */
export function garantiasTarjeta(o: Pick<OpcionCliente, 'coberturasDetalle'>, max = 5): { items: string[]; resto: number; sinLeer: boolean } {
  const lista = o.coberturasDetalle.lista
  if (lista === null) return { items: [], resto: 0, sinLeer: true }
  const incluidas = lista.filter((c) => c.incluida === true).map((c) => (c.texto ? `${c.nombre}: ${c.texto}` : c.nombre))
  return { items: incluidas.slice(0, max), resto: Math.max(0, incluidas.length - max), sinLeer: false }
}

/** Las coberturas CLAVE de la tarjeta (Alberto, 18/10/2026: «3-4 coberturas clave con ✔/✘»): solo las que la oferta
 *  AFIRMA (cubre ✔ / excluye ✘), en el orden de la compañía. Una «sin estado» no es ✘: no entra. `sinLeer` = no constan. */
export function garantiasClave(o: Pick<OpcionCliente, 'coberturasDetalle'>, max = 4): { items: { texto: string; incluida: boolean }[]; resto: number; sinLeer: boolean } {
  const lista = o.coberturasDetalle.lista
  if (lista === null) return { items: [], resto: 0, sinLeer: true }
  const afirmadas = lista
    .filter((c): c is typeof c & { incluida: boolean } => c.incluida !== null)
    .map((c) => ({ texto: c.incluida && c.texto ? `${c.nombre}: ${c.texto}` : c.nombre, incluida: c.incluida }))
  return { items: afirmadas.slice(0, max), resto: Math.max(0, afirmadas.length - max), sinLeer: false }
}

/** Los SUPUESTOS ya en lenguaje claro (los escribe asegura: «Precio calculado con…»), sin repetir, para «Datos con los
 *  que hemos calculado tu precio». Lo que no tiene esa forma no entra: aquí no se traduce ni se inventa nada. */
export function supuestosDeOpciones(opciones: readonly Pick<OpcionCliente, 'avisos'>[]): string[] {
  const out: string[] = []
  for (const o of opciones) for (const a of o.avisos) {
    const t = typeof a === 'string' ? a.trim() : ''
    if (esSupuesto(t) && !out.includes(t)) out.push(t)
  }
  return out
}

/** El `id` de la sección «datos con los que hemos calculado tu precio». Vive aquí (no en `AceptarOpcion`, que es
 *  'use client') para que una pieza de SERVIDOR pueda enlazarlo: una constante importada de un módulo cliente llega como
 *  referencia de cliente, no como texto. */
export const ID_DATOS_CALCULO = 'datos-calculo'

/** ¿Es un aviso de SUPUESTOS («Precio calculado con…»)? Misma forma que recoge `supuestosDeOpciones`. */
export const esSupuesto = (a: unknown): boolean => typeof a === 'string' && a.trim().startsWith('Precio calculado con')

/** Los avisos de la TARJETA (revisión 18/10/2026): la frase de supuestos NO se repite si ya sale entera en la sección de
 *  datos (`supuestosEnDatos`); en su lugar, `conSupuestos` = la tarjeta pone el aviso corto. Si la sección de datos NO se
 *  pinta, la frase se queda en la tarjeta: quitarla dejaría el supuesto sin decir en ningún sitio. */
export function avisosDeTarjeta(avisos: readonly string[], supuestosEnDatos: boolean): { avisos: string[]; conSupuestos: boolean } {
  if (!supuestosEnDatos) return { avisos: [...avisos], conSupuestos: false }
  const resto = avisos.filter((a) => !esSupuesto(a))
  return { avisos: resto, conSupuestos: resto.length !== avisos.length }
}

export type TonoCelda = 'si' | 'no' | 'no_figura'
export type CeldaVista = { texto: string; tono: TonoCelda }

/** Una celda del cuadro: lo que dice la oferta, y «No figura» cuando no dice nada. */
export function valorCelda(c: Celda): CeldaVista {
  if (c.estado === 'si') return { texto: c.texto ?? 'Incluida', tono: 'si' }
  if (c.estado === 'no') return { texto: 'Excluida', tono: 'no' }
  return { texto: c.estado === 'ver_texto' && c.texto ? c.texto : 'No figura', tono: 'no_figura' }
}

export type FilaCuadro = { clave: string; nombre: string; celdas: CeldaVista[] }
export type CuadroOfertas = {
  columnas: { id: string; compania: string; producto: string; recomendada: boolean }[]
  filas: FilaCuadro[]
  /** Compañías cuyas garantías no se han podido leer. Se dice en pantalla. */
  sinLeer: string[]
}

/** El cuadro garantía × compañía, con el orden de las columnas = el de las tarjetas. */
export function cuadroOfertas(opciones: readonly OpcionMin[]): CuadroOfertas {
  const orden = ordenarOfertas(opciones)
  const t = montarTabla(orden.map((o) => ({ id: o.id, compania: o.compania, producto: o.producto, coberturas: o.coberturasDetalle })))
  return {
    columnas: t.columnas.map((c, i) => ({ ...c, recomendada: esRecomendada(orden[i]) })),
    filas: t.filas.map((f) => ({ clave: f.clave, nombre: f.nombre, celdas: f.celdas.map(valorCelda) })),
    sinLeer: t.sinLeer,
  }
}

/** ¿Se ofrece el PDF? Solo de un presupuesto de ofertas que ya salió hacia el cliente. */
export function puedeDescargarPdf(p: { origen: OrigenVista | null; enviadoAt: Date | null }): boolean {
  return p.origen === 'ofertas' && p.enviadoAt !== null
}
