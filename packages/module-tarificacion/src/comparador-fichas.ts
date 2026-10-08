// Comparador multi-compañía sobre FICHAS DE PRODUCTO (07/10/2026). PURO. Preparado para el comparador de
// Grupo ASegura (sin UI todavía).
//
// Tabla garantía × oferta: por cada garantía del catálogo del ramo, lo que dice la ficha del producto de
// cada oferta (estado, límite, franquicia) y, si es un capital, lo del presupuesto. Más las DIFERENCIAS
// como hechos (quién tiene el límite más alto, la franquicia más baja, dónde hay hueco). Sin «mejor oferta»:
// eso lo interpreta el corredor.
//
// 🚨 Tres estados: celda sin dato = `consta: false` (no se sabe), NUNCA «excluida» ni 0. Una ficha sin
//    validar se marca `sinValidar`: sus valores son de la IA, revisables, y se dice.

import { garantiasFicha, type GrupoGarantiaFicha } from './fichas-catalogo.ts'
import {
  claveProducto,
  type CondicionGarantia,
  type CondicionesProducto,
  type EstadoCobertura,
  type EstadoFicha,
  type Franquicia,
  type IdentidadProducto,
  type Limite,
  type ValoresPresupuesto,
} from './fichas.ts'

export type FichaComparable = IdentidadProducto & { id: string; estado: EstadoFicha; condiciones: CondicionesProducto }
export type OfertaComparable = IdentidadProducto & { id: string; presupuesto: ValoresPresupuesto }

export type CeldaComparador = {
  ofertaId: string
  consta: boolean
  sinValidar: boolean
  estado: EstadoCobertura | null
  limite: Limite | null
  franquicia: Franquicia | null
  /** Capital de ESTE presupuesto (garantías de tipo capital). */
  capitalEur: number | null
  /** Importe comparable del límite (importe o primer riesgo). Un porcentaje no es comparable sin base: `null`. */
  limiteEur: number | null
  /** Importe comparable de la franquicia: importe, o 0 si consta «sin franquicia». Porcentaje: `null`. */
  franquiciaEur: number | null
}

export type DiferenciasFila = {
  /** Ofertas sin dato en esta garantía (no se sabe: hueco a mirar, no «no la tiene»). */
  huecos: string[]
  /** Hay al menos dos ofertas con dato y no dicen lo mismo. */
  distintas: boolean
  limiteMaxEur: number | null
  ofertasLimiteMax: string[]
  franquiciaMinEur: number | null
  ofertasFranquiciaMin: string[]
  /** Ofertas donde consta `excluida` u `opcional` mientras otra la trae `incluida`. */
  ofertasSinIncluir: string[]
}

export type FilaComparador = { clave: string; etiqueta: string; grupo: GrupoGarantiaFicha; celdas: CeldaComparador[]; diferencias: DiferenciasFila }

export type ColumnaComparador = {
  ofertaId: string
  compania: string
  producto: string
  version: string | null
  fichaId: string | null
  /** `null` = no hay ficha de ese producto (todas sus celdas de condiciones son «no consta»). */
  fichaEstado: EstadoFicha | null
  primaTotalEur: number | null
}

export type TablaComparador = { ramo: string; columnas: ColumnaComparador[]; filas: FilaComparador[]; avisos: string[] }

const comparableLimite = (l: Limite | null): number | null => (l && (l.tipo === 'importe' || l.tipo === 'primer_riesgo') ? l.eur : null)
const comparableFranquicia = (f: Franquicia | null): number | null => (f === null ? null : f.tipo === 'importe' ? f.eur : f.tipo === 'sin_franquicia' ? 0 : null)

function firma(c: CeldaComparador): string {
  return JSON.stringify([c.estado, c.limite, c.franquicia, c.capitalEur])
}

/** Ficha de la oferta: misma compañía+ramo+producto+versión; sin versión en la oferta, la única ficha del producto. */
export function fichaDeOferta(fichas: readonly FichaComparable[], o: OfertaComparable): FichaComparable | null {
  const exacta = fichas.find((f) => claveProducto(f) === claveProducto(o))
  if (exacta) return exacta
  if (o.version !== null) return null
  const sinVersion = claveProducto({ ...o, version: null })
  const candidatas = fichas.filter((f) => claveProducto({ ...f, version: null }) === sinVersion)
  // Con varias versiones y la oferta sin versión no se adivina cuál: mejor «no consta» que la equivocada.
  return candidatas.length === 1 ? candidatas[0] : null
}

export function compararOfertas(fichas: readonly FichaComparable[], ofertas: readonly OfertaComparable[]): TablaComparador {
  const ramo = ofertas[0]?.ramo ?? fichas[0]?.ramo ?? ''
  const avisos: string[] = []
  const ofertasRamo = ofertas.filter((o) => {
    if (o.ramo === ramo) return true
    avisos.push(`La oferta ${o.id} es de otro ramo (${o.ramo}) y no se compara.`)
    return false
  })
  const conFicha = ofertasRamo.map((o) => {
    const f = fichaDeOferta(fichas, o)
    if (!f) avisos.push(`Sin ficha de producto para ${o.compania} · ${o.producto}${o.version ? ` (${o.version})` : ''}: sus coberturas no constan.`)
    else if (f.estado !== 'validada') avisos.push(`La ficha de ${o.compania} · ${o.producto} está pendiente de validar: sus valores son de la IA.`)
    return { o, f }
  })

  const columnas: ColumnaComparador[] = conFicha.map(({ o, f }) => ({
    ofertaId: o.id, compania: o.compania, producto: o.producto, version: o.version,
    fichaId: f?.id ?? null, fichaEstado: f?.estado ?? null, primaTotalEur: o.presupuesto.primaTotalEur?.valor ?? null,
  }))

  const filas: FilaComparador[] = garantiasFicha(ramo).map((gar) => {
    const celdas: CeldaComparador[] = conFicha.map(({ o, f }) => {
      const cond: CondicionGarantia | undefined = f?.condiciones.garantias[gar.clave]
      const capitalEur = gar.tipoValor === 'capital' ? (o.presupuesto.capitales[gar.clave]?.valor ?? null) : null
      const estado = cond?.estado ?? null
      const limite = cond?.limite ?? null
      const franquicia = cond?.franquicia ?? null
      const consta = estado !== null || limite !== null || franquicia !== null || capitalEur !== null
      return {
        ofertaId: o.id, consta, sinValidar: consta && f !== null && f.estado !== 'validada',
        estado, limite, franquicia, capitalEur, limiteEur: comparableLimite(limite), franquiciaEur: comparableFranquicia(franquicia),
      }
    })
    const conDato = celdas.filter((c) => c.consta)
    const limites = conDato.map((c) => c.limiteEur ?? c.capitalEur).filter((n): n is number => n !== null)
    const limiteMaxEur = limites.length > 0 ? Math.max(...limites) : null
    const franqs = conDato.map((c) => c.franquiciaEur).filter((n): n is number => n !== null)
    const franquiciaMinEur = franqs.length > 0 ? Math.min(...franqs) : null
    const algunaIncluida = conDato.some((c) => c.estado === 'incluida')
    return {
      clave: gar.clave,
      etiqueta: gar.etiqueta,
      grupo: gar.grupo,
      celdas,
      diferencias: {
        huecos: celdas.filter((c) => !c.consta).map((c) => c.ofertaId),
        distintas: conDato.length >= 2 && new Set(conDato.map(firma)).size > 1,
        limiteMaxEur,
        ofertasLimiteMax: limiteMaxEur === null || limites.length < 2 ? [] : conDato.filter((c) => (c.limiteEur ?? c.capitalEur) === limiteMaxEur).map((c) => c.ofertaId),
        franquiciaMinEur,
        ofertasFranquiciaMin: franquiciaMinEur === null || franqs.length < 2 ? [] : conDato.filter((c) => c.franquiciaEur === franquiciaMinEur).map((c) => c.ofertaId),
        ofertasSinIncluir: algunaIncluida ? conDato.filter((c) => c.estado === 'excluida' || c.estado === 'opcional').map((c) => c.ofertaId) : [],
      },
    }
  })

  return { ramo, columnas, filas, avisos }
}
