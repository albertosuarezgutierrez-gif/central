// Allianz HOGAR 0.1.11 (01/11/2026) · GARANTÍAS por modalidad leídas de la tabla comparativa de la pantalla «Precio» (`epac-price-page` → `nx-comparison-table`).
// Antes: `coberturas: []` + «lector pendiente». Alberto: el presupuesto nunca puede mostrar «No figura». Mismo formato que Allianz auto / Mapfre.
//
// 🚨 Solo LECTURA (no se pulsa «Seleccionar», ni desplegables, ni radios). Nunca se inventa un estado, un límite ni una franquicia.
// 🚨 SUPUESTO SIN VALIDAR con el portal real: la cabecera de hogar es la vista en el job 03b0d6f5; las FILAS de cobertura se leen con los mismos selectores del
//    componente `nx-comparison-table` que ya funcionan en Allianz auto (`.is-content-row`, `.nx-comparison-table__description-cell`, `.nx-comparison-table__cell`,
//    `.common-coverages li`), sin captura de hogar. Si una fila no encaja, queda fuera y, sin ninguna, el aviso es «coberturas no leídas».
// 🚨 PDF: el adaptador de hogar NO guarda presupuesto ni tiene identificado el botón de descarga del proyecto (termina en «Precio» sin pulsar nada): sin PDF.
//    Cuando se autorice y se identifique «Guardar presupuesto»/«Descargar» de hogar, engancharlo a `descargarProyectoAuto` y leer de ahí con `pdf-texto.ts`.
// 🚨 Sin datos personales en avisos ni logs.
import { importeEs, type CoberturaOferta, type FranquiciaOferta, type OfertaNormalizada } from '@central/module-tarificacion'
import { valorDeTextoEnFila } from '../mapfre/garantias.ts'

export const AVISO_GARANTIAS_HOGAR_LEIDAS = 'Garantías leídas de la tabla comparativa de la pantalla «Precio» de Allianz Hogar (solo lectura).'
export const AVISO_GARANTIAS_HOGAR_SIN_LEER = 'Garantías de Allianz Hogar NO leídas (la tabla de coberturas de «Precio» no trae filas legibles; no hay PDF del proyecto): coberturas no leídas.'

export type CeldaHogar = { icono: string | null; texto: string }
export type OpcionHogar = { texto: string; marcada: boolean; adicional: string }
export type FilaGarantiaHogar = { descripcion: string; celdas: CeldaHogar[]; opciones: OpcionHogar[]; comunes: string[] }

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim()
const plano = (s: string) => limpiar(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

type Salida = { coberturas: CoberturaOferta[]; franquicias: FranquiciaOferta[] }

const valorDeFila = valorDeTextoEnFila

/**
 * Garantías de cada modalidad (`n` columnas) desde las filas leídas. PURA. Una fila cuyas celdas no son `n` ni trae opciones/comunes se ignora (no se
 * reparte a ojo). Icono check/minus = incluida/excluida; texto reconocible (Sí/No, «Hasta 6.000 €», «Franquicia 150 €»…) = su valor; texto no reconocible
 * (nivel de un desplegable) = incluida con el literal. Sin repetidas por modalidad (gana la primera).
 */
export function garantiasPorModalidadHogar(filas: readonly FilaGarantiaHogar[], n: number): Salida[] {
  const salida: Salida[] = Array.from({ length: n }, () => ({ coberturas: [], franquicias: [] }))
  const vistas: Set<string>[] = Array.from({ length: n }, () => new Set<string>())
  const anotar = (i: number, clave: string, literal: string, estado: CoberturaOferta['estado'], limite: number | null, franquicia: number | null, capital: number | null, franqTexto: string | null) => {
    const k = plano(clave)
    if (k === '' || vistas[i]!.has(k)) return
    vistas[i]!.add(k)
    salida[i]!.coberturas.push({ clave: limpiar(clave), literal: limpiar(literal), estado, capital, limite, franquicia })
    if (franquicia !== null || franqTexto) salida[i]!.franquicias.push({ ambito: limpiar(clave), importeEur: franquicia, literal: franquicia === null ? franqTexto : null })
  }
  for (const f of filas) {
    const desc = limpiar(f.descripcion)
    for (const c of f.comunes) { const t = limpiar(c); if (t !== '') for (let i = 0; i < n; i++) anotar(i, t, t, 'incluida', null, null, null, null) }
    if (desc === '') continue
    for (const o of f.opciones.filter((x) => x.marcada && limpiar(x.texto) !== '')) {
      const v = valorDeFila(desc, o.texto) // solo el texto de la opción: el suplemento (`adicional`) es precio
      const estado: CoberturaOferta['estado'] = /^no\s+incluid|^no$/i.test(limpiar(o.texto)) ? 'excluida' : v?.estado ?? 'incluida'
      // Como en Allianz auto: el importe de la opción marcada es el capital; el suplemento (`adicional`) es precio y nunca un límite.
      const capital = v?.capital ?? importeEs(o.texto)
      const limite = v?.limite !== undefined && v.limite !== capital ? v.limite : null
      for (let i = 0; i < n; i++) anotar(i, desc, `${desc}: ${limpiar(o.texto)}`, estado, limite, v?.franquicia ?? null, capital, v?.franquiciaTexto ?? null)
    }
    if (f.celdas.length !== n || f.opciones.length > 0 || f.comunes.length > 0) continue
    f.celdas.forEach((c, i) => {
      const t = limpiar(c.texto)
      const v = t === '' ? null : valorDeFila(desc, t)
      if (v) {
        anotar(i, desc, `${desc}: ${t}`, c.icono === 'minus' ? 'excluida' : v.estado ?? 'incluida', v.limite, v.franquicia, v.capital, v.franquiciaTexto)
      } else if (t !== '') {
        anotar(i, desc, `${desc}: ${t}`, c.icono === 'minus' ? 'excluida' : 'incluida', null, null, null, null)
      } else if (c.icono === 'check') anotar(i, desc, desc, 'incluida', null, null, null, null)
      else if (c.icono === 'minus') anotar(i, desc, desc, 'excluida', null, null, null, null)
    })
  }
  return salida
}

/** Pone las garantías en cada oferta (mismo orden que las modalidades). Sin ninguna por modalidad → aviso «coberturas no leídas». PURA. */
export function ofertasConGarantiasHogar(ofertas: readonly OfertaNormalizada[], porModalidad: readonly Salida[]): OfertaNormalizada[] {
  return ofertas.map((o, i) => {
    const g = porModalidad[i]
    const avisos = o.avisos.filter((a) => !/^Coberturas no leídas \(la tabla/.test(a))
    if (!g || g.coberturas.length === 0) return { ...o, avisos: [...avisos, AVISO_GARANTIAS_HOGAR_SIN_LEER] }
    return { ...o, coberturas: g.coberturas, franquicias: g.franquicias, avisos: [...avisos, AVISO_GARANTIAS_HOGAR_LEIDAS] }
  })
}
