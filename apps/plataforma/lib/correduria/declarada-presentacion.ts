import type { PolizaDeclaradaFicha } from '../ficha-asegura'

/**
 * Cómo se presenta una póliza aportada por el cliente en «Oportunidades» (22/10/2026).
 * Lógica pura: la tarjeta solo pinta lo que sale de aquí.
 *
 * - Un documento que NO es póliza (`tipoDocumento: 'otro'`, p. ej. una ficha catastral) no es una oportunidad.
 *   `null`/ausente = no se sabe el tipo: se queda visible (estado conservador).
 * - Extracción fallida (sin compañía, ramo, número, vencimiento, matrícula ni bien) = «Documento sin leer»:
 *   no se sugiere preguntar al cliente algo que no se ha podido leer.
 * - 🚨 Declarada por el cliente como de su EMPRESA (`titularTipo==='empresa'`): NO es suya. Se
 *   sigue viendo (la oportunidad existe) pero rotulada «De X (empresa)» y sin «Abrir seguimiento»
 *   en la ficha de la persona. Sin enlace a la ficha de X: el puerto no trae su CIF y casarla por
 *   el NOMBRE sería agrupar por etiqueta. `null` = no consta de quién es (no se afirma nada).
 * - El Nº de póliza va en su línea (cuatro pólizas de la misma compañía no se distinguen sin él) y la razón
 *   social se dice UNA sola vez (no hay normalizador de nombre corto en el repo: no se inventa un mapa).
 */
export type PresentacionDeclarada = {
  /** `true` = no es una póliza: ni se pinta ni cuenta. */
  excluir: boolean
  /** `true` = la extracción no sacó nada: «Documento sin leer — revisar». */
  sinLeer: boolean
  titulo: string
  /** Compañía (una vez; `null` si ya es el título o no se leyó) y «Nº …» (`null` sin número). */
  compania: string | null
  numero: string | null
  /** Fichero subido, solo para reconocer el documento cuando no se pudo leer. */
  documento: string | null
  /** «De X (empresa)» si el cliente la declaró de su empresa; `null` si no consta que lo sea. */
  deEmpresa: string | null
}

const limpio = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function esNoPoliza(d: Pick<PolizaDeclaradaFicha, 'tipoDocumento'>): boolean {
  return limpio(d.tipoDocumento)?.toLowerCase() === 'otro'
}

/** La línea «De X (empresa)», o `null`. Un «empresa» sin nombre (fila vieja a medias) se dice igual. */
export function lineaDeEmpresa(d: Pick<PolizaDeclaradaFicha, 'titularTipo' | 'titularEmpresaNombre'>): string | null {
  if (d.titularTipo !== 'empresa') return null
  const nombre = limpio(d.titularEmpresaNombre)
  return nombre ? `De ${nombre} (empresa)` : 'De su empresa (sin nombre)'
}

export function presentarDeclarada(d: PolizaDeclaradaFicha): PresentacionDeclarada {
  const deEmpresa = lineaDeEmpresa(d)
  const compania = limpio(d.compania)
  const numero = limpio(d.numeroPoliza)
  const cosa = limpio(d.bien?.cosa)
  const ubicacion = limpio(d.bien?.ubicacion)
  const matricula = limpio(d.matricula)
  const sinLeer = !compania && !numero && !limpio(d.ramo) && !d.fechaVencimiento && !matricula && !cosa && !ubicacion
  const documento = limpio(d.documentoNombre)
  if (sinLeer) {
    return { excluir: esNoPoliza(d), sinLeer: true, titulo: 'Documento sin leer — revisar', compania: null, numero: null, documento, deEmpresa }
  }
  const bien = cosa ?? ubicacion ?? matricula
  const titulo = bien ?? compania ?? (numero ? `Póliza ${numero}` : 'Sin detalle del bien')
  return {
    excluir: esNoPoliza(d),
    sinLeer: false,
    titulo,
    compania: bien ? compania : null,
    numero: numero ? `Nº ${numero}` : null,
    documento,
    deEmpresa,
  }
}
