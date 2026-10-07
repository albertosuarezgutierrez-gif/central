// PROPUESTA COMERCIAL de Grupo ASegura (07/10/2026): el documento que ve el cliente cuando hay presupuestos de
// varias compañías para una oportunidad. PURO (sin BD ni PDF): `construirPropuesta` devuelve el modelo y el PDF
// (`propuesta-comercial-pdf.ts`) solo lo pinta. NO envía nada: generar el fichero ≠ comunicarlo a nadie.
//
// 🚨 Dato que NO consta ≠ 0 ≠ «no cubre»: se pinta «No consta». Una prima sin dato nunca es `0,00€`.
// 🚨 Sin ranking inventado: las compañías van en el orden de entrada. Solo se destaca la recomendación si
//    alguien (el recomendador o el corredor) la pasa; sin ella, el documento no recomienda nada.
// 🚨 Del cliente solo nombre y referencia. Nada de DNI, teléfono, correo ni dirección.

import type { TablaComparador, CeldaComparador } from '@central/module-tarificacion'
import { MEDIADOR } from '@central/module-seguros'
import { eur } from './dinero.ts'

export const NO_CONSTA = 'No consta'

export type RecomendacionPropuesta = { compania: string; motivos: string[] }

export type DatosPropuesta = {
  referencia: string | null
  /** Solo el nombre (o razón social). */
  cliente: string
  ramo: string
  fecha: Date
  /** El comparador de fichas (module-tarificacion). La prima de cada columna se entiende ANUAL. */
  tabla: TablaComparador
  recomendacion?: RecomendacionPropuesta | null
}

export type ColumnaPropuesta = { compania: string; producto: string; primaAnual: string; primaAnualEur: number | null; recomendada: boolean }
export type FilaPropuesta = { etiqueta: string; grupo: 'capitales' | 'rc' | 'franquicia' | 'garantias'; celdas: string[] }

export type ModeloPropuesta = {
  titulo: string
  referencia: string | null
  cliente: string
  ramo: string
  fecha: Date
  companias: string[]
  columnas: ColumnaPropuesta[]
  filas: FilaPropuesta[]
  recomendacion: RecomendacionPropuesta | null
  avisos: string[]
  introduccion: string
  avisoOrientativo: string
  mediador: { marca: string; nombre: string; claveDgsfp: string; domicilio: string; email: string }
  pieLegal: string
}

const RAMOS_TXT: Record<string, string> = {
  comunidades: 'comunidad de propietarios', comercio: 'comercio', rc: 'responsabilidad civil', hogar: 'hogar', auto: 'coche',
}
export const ramoTexto = (ramo: string): string => RAMOS_TXT[ramo] ?? ramo

export const AVISO_ORIENTATIVO =
  'Presupuesto orientativo, sujeto a las condiciones de la compañía. Las primas y capitales pueden variar al contratar y ' +
  'solo obligan a la aseguradora cuando emite la póliza. Las condiciones definitivas son las de la póliza.'

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const pct = (n: number): string => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`

function textoFranquicia(f: NonNullable<CeldaComparador['franquicia']>): string {
  if (f.tipo === 'sin_franquicia') return 'Sin franquicia'
  if (f.tipo === 'importe') return `Franquicia ${eur(f.eur)}`
  const lim = [num(f.minimoEur) ? `mín. ${eur(f.minimoEur)}` : null, num(f.maximoEur) ? `máx. ${eur(f.maximoEur)}` : null].filter(Boolean).join(', ')
  return `Franquicia ${pct(f.pct)}${lim ? ` (${lim})` : ''}`
}

/** Una celda del cuadro en lenguaje llano. Sin dato → «No consta» (jamás 0 ni «no cubre»). */
export function textoCeldaPropuesta(c: CeldaComparador | undefined): string {
  if (!c || !c.consta) return NO_CONSTA
  const marca = c.sinValidar ? '*' : ''
  if (c.estado === 'excluida') return `No incluida${marca}`
  const l: string[] = []
  if (num(c.capitalEur)) l.push(eur(c.capitalEur))
  if (c.limite && c.limite.tipo === 'porcentaje') l.push(`Límite ${pct(c.limite.pct)}`)
  else if (num(c.limiteEur)) l.push(`Límite ${eur(c.limiteEur)}`)
  if (c.franquicia) l.push(textoFranquicia(c.franquicia))
  if (l.length === 0) l.push(c.estado === 'opcional' ? 'Opcional' : c.estado === 'incluida' ? 'Incluida' : NO_CONSTA)
  else if (c.estado === 'opcional') l.unshift('Opcional')
  return l.join('\n') + marca
}

const GRUPO: Record<string, FilaPropuesta['grupo']> = { rc: 'rc', danos: 'garantias', asistencia: 'garantias', juridica: 'garantias', otros: 'garantias' }

export function construirPropuesta(d: DatosPropuesta): ModeloPropuesta {
  const { tabla } = d
  const avisos: string[] = []
  const columnas: ColumnaPropuesta[] = tabla.columnas.map((c) => ({
    compania: c.compania,
    producto: c.producto,
    primaAnualEur: num(c.primaTotalEur) ? c.primaTotalEur : null,
    primaAnual: num(c.primaTotalEur) ? eur(c.primaTotalEur) : NO_CONSTA,
    recomendada: false,
  }))

  // La recomendación solo vale si apunta a una compañía analizada; si no, no se inventa otra.
  const motivos = (d.recomendacion?.motivos ?? []).map((m) => m.trim()).filter(Boolean)
  const rec = d.recomendacion
  const colRec = rec ? columnas.find((c) => c.compania === rec.compania) : undefined
  let recomendacion: RecomendacionPropuesta | null = null
  if (rec && colRec) { colRec.recomendada = true; recomendacion = { compania: colRec.compania, motivos } }

  const filas: FilaPropuesta[] = []
  const celdasDe = (celdas: CeldaComparador[]) => tabla.columnas.map((col) => textoCeldaPropuesta(celdas.find((c) => c.ofertaId === col.ofertaId)))
  for (const f of tabla.filas) {
    if (!f.celdas.some((c) => c.consta)) continue // nadie dice nada de esa garantía: no se pinta una fila de «No consta»
    const hayCapital = f.celdas.some((c) => num(c.capitalEur))
    filas.push({ etiqueta: f.etiqueta, grupo: hayCapital ? 'capitales' : (GRUPO[f.grupo] ?? 'garantias'), celdas: celdasDe(f.celdas) })
  }
  const orden = { capitales: 0, rc: 1, franquicia: 2, garantias: 3 } as const
  filas.sort((a, b) => orden[a.grupo] - orden[b.grupo]) // estable: conserva el orden del catálogo dentro de cada grupo

  // Avisos
  const sinValidar = tabla.columnas.filter((c) => c.fichaEstado === 'pendiente').map((c) => c.compania)
  if (sinValidar.length) avisos.push(`Las coberturas de ${[...new Set(sinValidar)].join(', ')} están pendientes de validar por nuestro equipo y se marcan con un asterisco (*). Confírmalas antes de decidir.`)
  const sinFicha = tabla.columnas.filter((c) => c.fichaEstado === null).map((c) => c.compania)
  if (sinFicha.length) avisos.push(`De ${[...new Set(sinFicha)].join(', ')} todavía no tenemos las condiciones del producto, así que sus coberturas figuran como «${NO_CONSTA}».`)
  if (columnas.some((c) => c.primaAnualEur === null)) avisos.push(`«${NO_CONSTA}» significa que ese dato no figura en la información que tenemos de la compañía; no quiere decir que no esté cubierto ni que cueste cero.`)
  if (rec && !colRec) avisos.push('La recomendación indicada no corresponde a ninguna de las compañías analizadas y se ha omitido.')

  const nombresCompanias = [...new Set(tabla.columnas.map((c) => c.compania))]
  return {
    titulo: `Propuesta de seguro de ${ramoTexto(d.ramo)}`,
    referencia: d.referencia,
    cliente: d.cliente.trim() || 'Cliente',
    ramo: d.ramo,
    fecha: d.fecha,
    companias: nombresCompanias,
    columnas,
    filas,
    recomendacion,
    avisos,
    introduccion: `Hemos pedido presupuesto a ${nombresCompanias.length} ${nombresCompanias.length === 1 ? 'compañía' : 'compañías'} para tu seguro de ${ramoTexto(d.ramo)} y te resumimos aquí lo más importante, con los precios por año.`,
    avisoOrientativo: AVISO_ORIENTATIVO,
    mediador: { marca: MEDIADOR.marca, nombre: MEDIADOR.identidad.nombre, claveDgsfp: MEDIADOR.identidad.claveDgsfp, domicilio: MEDIADOR.identidad.domicilio, email: MEDIADOR.identidad.email },
    pieLegal: `${MEDIADOR.marca} · ${MEDIADOR.identidad.nombre}, corredor de seguros · Clave DGSFP ${MEDIADOR.identidad.claveDgsfp} · ${MEDIADOR.identidad.domicilio}`,
  }
}

export function nombreFicheroPropuesta(m: Pick<ModeloPropuesta, 'cliente' | 'ramo' | 'fecha' | 'referencia'>): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const ref = m.referencia ? `${limpio(m.referencia)}-` : ''
  return `propuesta-${ref}${limpio(ramoTexto(m.ramo))}-${limpio(m.cliente) || 'cliente'}-${m.fecha.toISOString().slice(0, 10)}.pdf`
}
