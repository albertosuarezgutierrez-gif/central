// Lógica PURA (sin JSX) de la «Verificación antes de pedir precio» del cotizador auto embebido (13/10/2026).
// La importan `AutoNuevo.tsx` y su test directamente.
import type { RolExtra } from '../../../oportunidad/[id]/variante'

/** Ids de los bloques de la pantalla del riesgo (y de este cotizador) a los que llevan los enlaces. */
export const ANCLA = {
  intervinientes: 'intervinientes',
  vehiculo: 'datos-vehiculo',
  version: 'elegir-version-catalogo',
  historial: 'historial-riesgo',
  tomadorAqui: 'cotizador-tomador',
  seguroAqui: 'cotizador-seguro-actual',
} as const
export const anclaInterviniente = (rol: 'tomador' | RolExtra) => `interviniente-${rol}`
export const anclaFiguraAqui = (rol: RolExtra) => `cotizador-figura-${rol}`

export type EstadoVerificacion = 'ok' | 'falta' | 'aviso'
export type ItemVerificacion = {
  clave: string
  texto: string
  estado: EstadoVerificacion
  nota?: string
  /** Bloque al que lleva el enlace; `arriba` = se arregla en la pantalla del riesgo, si no, en este cotizador. */
  ancla?: string
  alternativa?: string
  arriba?: boolean
}
export type GrupoVerificacion = { titulo: string; items: ItemVerificacion[] }
export type EntradaVerificacion = {
  tomador: {
    empresa: boolean
    /** No se pudo precalificar la ficha: no se sabe qué falta (el servidor corta antes de gastar). */
    sinPrecalificar: boolean
    faltaCivil: boolean
    faltaMunicipio: boolean
    aMano: { campo: string; etiqueta: string; relleno: boolean }[]
    enFicha: { campo: string; motivo: string }[]
    sinUbicar: { campo: string; motivo: string }[]
  }
  figuras: {
    rol: RolExtra
    nombre: string | null
    empresa: boolean
    faltaCivil: boolean
    carnet: 'no_aplica' | 'ok' | 'falta'
    /** Texto de lo que falta en SU ficha (se corrige en «Intervinientes»). `null` = nada. */
    enFicha: string | null
    sinLeer: boolean
    completa: boolean
  }[]
  figuraRepetida: boolean
  ocasionalDuplicado: boolean
  personaLibreIncompleta: boolean
  vehiculo: { faltaVersion: boolean; faltaMatriculacion: boolean; faltaGaraje: boolean; kmInvalido: boolean; compraInvalida: boolean }
  historial: {
    tieneSeguro: boolean
    faltaCompania: boolean
    faltaPoliza: boolean
    faltaAniosAsegurado: boolean
    faltaAniosCompania: boolean
    faltaAniosSinSiniestros: boolean
    /** Recomendado (no bloquea: la compañía lo pide gratis si hace falta). */
    siniestros5Pendiente: boolean
    /** Incoherente: el vendor exige en la compañía / sin siniestros ≤ años asegurado (su 400 se paga). */
    companiaSuperaAsegurado?: boolean
    sinSiniestrosSuperaAsegurado?: boolean
    reparos: { campo: string; motivo: string }[]
  }
  /** El `faltaAlgo` del cotizador: si dice que falta algo y ningún ítem lo recoge, se añade uno genérico (nunca un ✓ falso). */
  faltaAlgo: boolean
}

const ROTULO_ROL_VERIF: Record<RolExtra, string> = { propietario: 'propietario', conductor_habitual: 'conductor habitual', conductor_ocasional: 'conductor ocasional' }
const estado = (falta: boolean): EstadoVerificacion => (falta ? 'falta' : 'ok')

/**
 * PURA: la checklist «Verificación antes de pedir precio» en 3 grupos y en este orden: figuras, riesgo (vehículo) e
 * historial. Cada ítem ✓/✗ sale de los mismos booleanos que apagan el botón (`faltaAlgo`).
 */
export function gruposVerificacion(e: EntradaVerificacion): GrupoVerificacion[] {
  const t = e.tomador
  const figuras: ItemVerificacion[] = []
  if (t.sinPrecalificar) {
    figuras.push({ clave: 'tomador-precalificar', texto: 'Tomador: no se ha podido precalificar su ficha', estado: 'aviso', nota: 'no se sabe qué datos personales faltan; el servidor corta antes de gastar si falta algo', ancla: anclaInterviniente('tomador'), alternativa: ANCLA.intervinientes, arriba: true })
  }
  figuras.push(
    t.empresa
      ? { clave: 'tomador-civil', texto: 'Tomador: empresa (va con su CIF, sin estado civil)', estado: 'ok' }
      : { clave: 'tomador-civil', texto: 'Estado civil del tomador', estado: estado(t.faltaCivil), ancla: ANCLA.tomadorAqui },
  )
  figuras.push({ clave: 'tomador-municipio', texto: 'Municipio del tomador', estado: estado(t.faltaMunicipio), ancla: ANCLA.tomadorAqui })
  for (const f of t.aMano) figuras.push({ clave: `tomador-${f.campo}`, texto: `${f.etiqueta} del tomador`, estado: estado(!f.relleno), ancla: ANCLA.tomadorAqui })
  for (const f of t.enFicha) {
    figuras.push({ clave: `tomador-ficha-${f.campo}`, texto: `Ficha del tomador: ${f.campo}`, estado: 'falta', nota: `${f.motivo} — «Editar datos» del tomador en «Intervinientes»`, ancla: anclaInterviniente('tomador'), alternativa: ANCLA.intervinientes, arriba: true })
  }
  for (const f of t.sinUbicar) {
    // Aviso, no ✗: no se puede arreglar desde la pantalla y el servidor lo rechaza sin coste (no bloquea el pago).
    figuras.push({ clave: `tomador-otro-${f.campo}`, texto: `Tomador: ${f.campo}`, estado: 'aviso', nota: `${f.motivo} (esta pantalla no sabe dónde se corrige; si falta, el servidor lo rechaza sin cobrar)`, ancla: ANCLA.intervinientes, arriba: true })
  }
  for (const f of e.figuras) {
    const quien = `${ROTULO_ROL_VERIF[f.rol]}${f.nombre ? ` (${f.nombre})` : ''}`
    const antes = figuras.length
    if (f.sinLeer) {
      figuras.push({ clave: `${f.rol}-sin-leer`, texto: `No se pudo leer la ficha del ${quien}`, estado: 'aviso', nota: 'se cotiza con lo que se teclee aquí', ancla: anclaInterviniente(f.rol), alternativa: ANCLA.intervinientes, arriba: true })
    }
    figuras.push(
      f.empresa
        ? { clave: `${f.rol}-civil`, texto: `${quien[0].toUpperCase()}${quien.slice(1)}: empresa (sin estado civil)`, estado: 'ok' }
        : { clave: `${f.rol}-civil`, texto: `Estado civil del ${quien}`, estado: estado(f.faltaCivil), ancla: anclaFiguraAqui(f.rol) },
    )
    if (f.carnet !== 'no_aplica') figuras.push({ clave: `${f.rol}-carnet`, texto: `Fecha del carné del ${quien}`, estado: estado(f.carnet === 'falta'), ancla: anclaFiguraAqui(f.rol) })
    if (f.enFicha) {
      figuras.push({ clave: `${f.rol}-ficha`, texto: `Ficha del ${quien}`, estado: 'falta', nota: `${f.enFicha} — «Editar datos» en «Intervinientes»`, ancla: anclaInterviniente(f.rol), alternativa: ANCLA.intervinientes, arriba: true })
    }
    // Red: la figura no está completa y nada de lo anterior lo dice → ✗ genérico, nunca un ✓ falso.
    if (!f.completa && !figuras.slice(antes).some((i) => i.estado === 'falta')) {
      figuras.push({ clave: `${f.rol}-incompleta`, texto: `Faltan datos del ${quien}`, estado: 'falta', ancla: anclaInterviniente(f.rol), alternativa: ANCLA.intervinientes, arriba: true })
    }
  }
  if (e.figuraRepetida) figuras.push({ clave: 'figura-repetida', texto: 'La misma persona es conductor habitual y ocasional', estado: 'falta', nota: 'quita el ocasional en «Intervinientes»', ancla: ANCLA.intervinientes, arriba: true })
  if (e.ocasionalDuplicado) figuras.push({ clave: 'ocasional-duplicado', texto: 'El conductor ocasional tiene el mismo DNI que el habitual', estado: 'falta', ancla: ANCLA.intervinientes, arriba: true })
  if (e.personaLibreIncompleta) figuras.push({ clave: 'persona-libre', texto: 'Faltan datos de un propietario o conductor distinto del tomador', estado: 'falta', ancla: ANCLA.intervinientes, arriba: true })

  const v = e.vehiculo
  const vehiculo: ItemVerificacion[] = [
    { clave: 'version', texto: 'Versión del catálogo', estado: estado(v.faltaVersion), ancla: ANCLA.version, alternativa: ANCLA.vehiculo, arriba: true, nota: v.faltaVersion ? '«Elegir versión del catálogo» en «Datos del vehículo» (gratis)' : undefined },
    { clave: 'matriculacion', texto: 'Fecha de matriculación (o la prevista)', estado: estado(v.faltaMatriculacion), ancla: ANCLA.vehiculo, arriba: true },
    { clave: 'garaje', texto: 'Dónde duerme (garaje)', estado: estado(v.faltaGaraje), ancla: ANCLA.vehiculo, arriba: true },
    { clave: 'km', texto: 'Kilómetros al año', estado: estado(v.kmInvalido), ancla: ANCLA.vehiculo, arriba: true, nota: v.kmInvalido ? 'no se entiende como kilometraje' : undefined },
    { clave: 'compra', texto: 'Fecha de compra', estado: estado(v.compraInvalida), ancla: ANCLA.vehiculo, arriba: true, nota: v.compraInvalida ? 'no puede ser anterior a la matriculación' : undefined },
  ]

  const h = e.historial
  const historial: ItemVerificacion[] = []
  if (!h.tieneSeguro) {
    historial.push({ clave: 'sin-seguro', texto: 'Sin seguro en vigor declarado', estado: 'aviso', nota: 'se cotiza «de calle»: el precio sale estimado. Si lo tiene, márcalo en «Seguro en vigor»', ancla: ANCLA.seguroAqui })
  } else {
    historial.push(
      { clave: 'compania', texto: 'Compañía actual', estado: estado(h.faltaCompania), ancla: ANCLA.seguroAqui },
      { clave: 'poliza', texto: 'Nº de póliza actual (últimos 5 dígitos)', estado: estado(h.faltaPoliza), ancla: ANCLA.seguroAqui },
      { clave: 'anios-asegurado', texto: 'Años asegurado sin interrupción', estado: estado(h.faltaAniosAsegurado), ancla: ANCLA.historial, arriba: true },
      { clave: 'anios-compania', texto: 'Años en la compañía', estado: estado(h.faltaAniosCompania), ancla: ANCLA.historial, arriba: true },
      { clave: 'anios-sin-siniestros', texto: 'Años sin siniestros', estado: estado(h.faltaAniosSinSiniestros), ancla: ANCLA.seguroAqui },
    )
    if (h.companiaSuperaAsegurado) historial.push({ clave: 'compania-supera', texto: 'Años en la compañía: no pueden ser más que los años asegurado', estado: 'falta', ancla: ANCLA.historial, arriba: true })
    if (h.sinSiniestrosSuperaAsegurado) historial.push({ clave: 'sin-siniestros-supera', texto: 'Años sin siniestros: no pueden ser más que los años asegurado', estado: 'falta', ancla: ANCLA.seguroAqui })
    if (h.siniestros5Pendiente) historial.push({ clave: 'siniestros-5', texto: 'Siniestros en los últimos 5 años', estado: 'aviso', nota: 'recomendado: si la compañía lo exige lo dirá sin cobrar', ancla: ANCLA.seguroAqui })
  }
  for (const r of h.reparos) historial.push({ clave: `reparo-${r.campo}`, texto: r.campo, estado: 'aviso', nota: r.motivo, ancla: ANCLA.seguroAqui })

  const grupos: GrupoVerificacion[] = [
    { titulo: '1 · Figuras (tomador e intervinientes)', items: figuras },
    { titulo: '2 · Riesgo: el vehículo', items: vehiculo },
    { titulo: '3 · Historial y bonificaciones', items: historial },
  ]
  if (e.faltaAlgo && verificacionCompleta(grupos)) {
    figuras.push({ clave: 'otro', texto: 'Falta algún dato más del formulario', estado: 'falta', nota: 'revisa los campos marcados «falta» en este cotizador' })
  }
  return grupos
}

/** Todo en ✓ (los avisos no bloquean). Sin grupos (pantalla completa) no hay verificación que exigir. */
export function verificacionCompleta(grupos: GrupoVerificacion[]): boolean {
  return grupos.every((g) => g.items.every((i) => i.estado !== 'falta'))
}
