// El ESTUDIO tal como lo ve el CLIENTE en la página de su presupuesto (21/10/2026). PURO.
//
// Una sola fuente: el MISMO `estudio` congelado que pinta el PDF, con los MISMOS textos (`presupuesto-pdf-cuadro.ts`:
// cabeceras compañía + nivel, precio con su periodo, «precio estimado», celdas de tres estados, frase de la fuente y
// etiqueta del resumen). El portal NO recalcula nada: pinta esto.
//
// 🚨 Lista BLANCA de lo que cruza el puente: compañía, etiqueta, nivel, precio (texto y número), estimado, recomendada,
//    celdas (estado + texto) y el resumen con su etiqueta. NUNCA: `referencia` (ids internos de Avant2/ofertas),
//    `avisos` (reservas internas), `ranking`, la `evidencia` literal de los PDF ni la huella.
// 🚨 Solo las ofertas que el cliente tiene EN DOCUMENTO (`presupuesto_opcion` no oculta); la póliza actual, si la hay.

import { compararOfertas, companiaIntrusa, etiquetaResumen } from '@central/module-seguros'
import { narrativaDeterminista } from './estudio-ia.ts'
import { cabecerasColumnas, filasParaColumnas, LEYENDA_ICONOS, notasCuadro, textoCelda, textoFuenteCuadro, textoPrimaOferta, type EstudioPdf } from './presupuesto-pdf-cuadro.ts'

export type ColumnaEstudioCliente = {
  id: string
  /** La `presupuesto_opcion` que se acepta con esta columna. `null` = la póliza actual (no se acepta). */
  opcionId: string | null
  rol: 'actual' | 'oferta'
  compania: string
  etiqueta: string
  nivel: string | null
  precio: string
  /** Prima ANUAL comparable. `null` = no la hay (o es de otro periodo: lo dice `precio`). */
  primaAnual: number | null
  estimado: boolean
  recomendada: boolean
}
export type CeldaEstudioCliente = { estado: 'si' | 'no' | 'nose'; texto: string }
export type VistaEstudioCliente = {
  columnas: ColumnaEstudioCliente[]
  filas: { clave: string; etiqueta: string; grupo: string; celdas: CeldaEstudioCliente[] }[]
  narrativa: { resumen: string; recomendacion: string; etiqueta: string } | null
  textoFuente: string
  notas: string[]
  leyenda: string
}

export type OpcionEnDocumento = { id: string; precioId: string | null; ofertaId: string | null; papeles: readonly string[] }

/**
 * El estudio RECORTADO a lo que el cliente tiene EN DOCUMENTO (21/10/2026, revisión): una opción que el corredor ocultó
 * después de congelar el estudio no se ve en el cuadro, ni en el PDF ni en la página. Si se quitó alguna, o si el texto
 * nombra una compañía que ya no está (`companiaIntrusa`), el resumen pasa a la PLANTILLA de lo que queda (sin IA en una
 * lectura: el texto de la IA hablaba de otro cuadro). `null` = no queda ninguna oferta. PURO.
 */
export function estudioEnDocumento(e: EstudioPdf, opciones: readonly Pick<OpcionEnDocumento, 'precioId' | 'ofertaId'>[]): EstudioPdf | null {
  const cmp = e.comparacion
  const enDoc = (id: string) => opciones.some((o) => o.precioId === id || o.ofertaId === id)
  const quedan = cmp.ofertas.filter((o) => o.rol === 'actual' || enDoc(o.id))
  if (!quedan.some((o) => o.rol === 'oferta')) return null
  const quitadas = quedan.length !== cmp.ofertas.length
  const comparacion = quitadas ? compararOfertas({ ramo: cmp.ramo, ofertas: quedan, superficieM2: cmp.superficieM2 }) : cmp
  const recomendadaId = e.recomendadaId && quedan.some((o) => o.id === e.recomendadaId) ? e.recomendadaId : null
  const intrusa = companiaIntrusa(`${e.narrativa.resumen}\n${e.narrativa.recomendacion}`, quedan.map((o) => o.compania))
  if (!quitadas && intrusa === null && recomendadaId === e.recomendadaId) return e
  const plantilla = narrativaDeterminista(comparacion, recomendadaId)
  return {
    recomendadaId,
    actualId: e.actualId && quedan.some((o) => o.id === e.actualId) ? e.actualId : null,
    comparacion,
    narrativa: quitadas || intrusa !== null ? { resumen: plantilla.resumen, recomendacion: plantilla.recomendacion, fuente: 'determinista', revisada: null } : e.narrativa,
  }
}

export function vistaEstudioCliente(original: EstudioPdf, opciones: readonly OpcionEnDocumento[]): VistaEstudioCliente | null {
  const e = estudioEnDocumento(original, opciones)
  if (!e) return null
  const cmp = e.comparacion
  const opcionDe = (ofertaId: string) => opciones.find((o) => o.precioId === ofertaId || o.ofertaId === ofertaId) ?? null
  const visibles = cmp.ofertas.filter((o) => o.rol === 'actual' || opcionDe(o.id) !== null)
  if (!visibles.some((o) => o.rol === 'oferta')) return null
  const nombres = cabecerasColumnas(visibles)
  const columnas: ColumnaEstudioCliente[] = visibles.map((o) => {
    const op = o.rol === 'actual' ? null : opcionDe(o.id)
    return {
      id: o.id,
      opcionId: op?.id ?? null,
      rol: o.rol,
      compania: o.compania,
      etiqueta: nombres.get(o.id) ?? o.compania,
      nivel: o.nivel?.trim() || null,
      precio: textoPrimaOferta(o),
      primaAnual: typeof o.primaTotal === 'number' && Number.isFinite(o.primaTotal) ? o.primaTotal : null,
      estimado: o.firmeza === 'estimado',
      recomendada: o.rol === 'oferta' && (o.id === e.recomendadaId || (op?.papeles.includes('recomendada') ?? false)),
    }
  })
  const ids = columnas.map((c) => c.id)
  const filas = filasParaColumnas(cmp.filas, ids).map((f) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    grupo: f.grupo,
    celdas: ids.map((id) => { const t = textoCelda(f.celdas.find((c) => c.ofertaId === id)); return { estado: t.icono, texto: t.texto } }),
  }))
  const hayTexto = e.narrativa.resumen.trim() !== '' || e.narrativa.recomendacion.trim() !== ''
  return {
    columnas,
    filas,
    narrativa: hayTexto ? { resumen: e.narrativa.resumen.trim(), recomendacion: e.narrativa.recomendacion.trim(), etiqueta: etiquetaResumen(e.narrativa.fuente, e.narrativa.revisada) } : null,
    textoFuente: textoFuenteCuadro(visibles),
    notas: notasCuadro(visibles),
    leyenda: LEYENDA_ICONOS,
  }
}
