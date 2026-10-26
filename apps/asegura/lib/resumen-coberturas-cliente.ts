// Resumen de 3 líneas de la comparativa de coberturas para el borrador al cliente (26/10/2026). PURO, con test.
//
// Solo dice lo que la matriz PRUEBA: «incluida» / «no incluida» (estado3). Un «no se sabe» nunca se cuenta como «no incluye».
// Sin diferencias demostrables (o sin coberturas leídas) → `null`: el resumen se OMITE, no se inventa. No envía nada.
// Ordena por prima anual (solo ofertas con prima anual comparable), la más barata primero.

import { etiquetasOfertas, type ResultadoComparacion } from '@central/module-seguros'

const eurEs = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'

/** «a, b y c» (máx. 3 nombres; el resto, «y N más»). */
export function listaEs(nombres: readonly string[]): string {
  const n = nombres.map((x) => x.trim()).filter(Boolean)
  const vistas = n.slice(0, 3)
  const resto = n.length - vistas.length
  const base = vistas.length <= 1 ? (vistas[0] ?? '') : `${vistas.slice(0, -1).join(', ')} y ${vistas[vistas.length - 1]}`
  return resto > 0 ? `${base} y ${resto} más` : base
}

export function resumenCoberturasCliente(c: ResultadoComparacion): string[] | null {
  const ofs = c.ofertas
    .filter((o) => o.rol === 'oferta' && typeof o.primaTotal === 'number' && Number.isFinite(o.primaTotal))
    .sort((a, b) => (a.primaTotal as number) - (b.primaTotal as number))
  if (ofs.length < 2) return null
  const nombres = etiquetasOfertas(c.ofertas)
  const nom = (id: string) => nombres.get(id) ?? ofs.find((o) => o.id === id)?.compania ?? 'Compañía'
  const barata = ofs[0]
  const cara = ofs[ofs.length - 1]
  const medias = ofs.slice(1, -1)
  const est = (clave: string, id: string) => c.filas.find((f) => f.clave === clave)?.celdas.find((x) => x.ofertaId === id)?.estado3 ?? 'no_se_sabe'
  // Coberturas que la más barata NO incluye (probado) y otra oferta sí.
  const quePierde = (idOtra: string) => c.filas.filter((f) => est(f.clave, barata.id) === 'no_incluida' && est(f.clave, idOtra) === 'incluida').map((f) => f.etiqueta)
  const pierdeCara = quePierde(cara.id)
  const lineas: string[] = []
  const precio = (o: { id: string; primaTotal: number | null }) => `${nom(o.id)}, ${eurEs(o.primaTotal as number)}`

  const todas = new Set<string>()
  for (const o of ofs.slice(1)) for (const e of quePierde(o.id)) todas.add(e)
  if (todas.size === 0) return null
  lineas.push(`La más barata (${precio(barata)}) no incluye ${listaEs([...todas])}.`)
  for (const m of medias) {
    const q = quePierde(m.id)
    if (q.length > 0) lineas.push(`La intermedia (${precio(m)}) sí incluye ${listaEs(q)}.`)
  }
  const yaDichas = new Set(medias.flatMap((m) => quePierde(m.id)))
  const soloCara = pierdeCara.filter((e) => !yaDichas.has(e))
  if (pierdeCara.length > 0 && (medias.length === 0 || soloCara.length > 0)) {
    lineas.push(`La más cara (${precio(cara)}) ${medias.length === 0 ? 'sí incluye' : 'añade'} ${listaEs(medias.length === 0 ? pierdeCara : soloCara)}.`)
  }
  return lineas.slice(0, 3)
}

/** Añade el resumen al texto del borrador, una sola vez (si el texto ya lo lleva, no lo repite). */
export function conResumenCoberturas(resumen: string, lineas: readonly string[] | null): string {
  if (!lineas || lineas.length === 0) return resumen
  if (resumen.includes(lineas[0])) return resumen
  return `${resumen}\n\n${lineas.join('\n')}`
}
