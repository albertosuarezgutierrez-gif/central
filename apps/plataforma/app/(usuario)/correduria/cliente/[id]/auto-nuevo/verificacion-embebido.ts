// Lógica PURA (sin JSX) de la «Verificación antes de pedir precio» del cotizador embebido (13/10/2026: auto; el mismo
// día, moto con `ramo: 'moto'`). La importan `AutoNuevo.tsx`, `../moto-nuevo/CotizadorMoto.tsx` y sus tests.
// Moto (campos de Avant2, `apps/asegura/lib/codeoscopic/peticion-moto.ts`): SIN conductor ocasional ni remolque, CON
// experiencia de conducción (y el código de la moto anterior si viene de otra moto).
import { ultimosDigitosPoliza, type HistorialDeclaradoRiesgo } from '@central/module-seguros'
import type { RolExtra } from '../../../oportunidad/[id]/variante'

/** Ids de los bloques de la pantalla del riesgo (y de este cotizador) a los que llevan los enlaces. */
export const ANCLA = {
  intervinientes: 'intervinientes',
  vehiculo: 'datos-vehiculo',
  version: 'elegir-version-catalogo',
  historial: 'historial-riesgo',
  tomadorAqui: 'cotizador-tomador',
  seguroAqui: 'cotizador-seguro-actual',
  /** Moto: la experiencia de conducción (y el código de la moto anterior), que se elige en el propio cotizador. */
  experienciaAqui: 'cotizador-experiencia',
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
  /** Sin él, auto (el de siempre). Moto cambia el rótulo del objeto y admite `faltaMotoAnterior` / `ocasionalIgnorado`. */
  ramo?: 'auto' | 'moto'
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
  /** Moto: el riesgo trae un conductor ocasional que la compañía no admite en moto (no se declara). Aviso, no bloquea. */
  ocasionalIgnorado?: boolean
  vehiculo: {
    faltaVersion: boolean; faltaMatriculacion: boolean; faltaGaraje: boolean; kmInvalido: boolean; compraInvalida: boolean
    /** El riesgo trae un garaje que no casa con el catálogo (`garajeInicial().sinCasar`): su etiqueta. Se dice en el ✗. */
    garajeSinCasar?: string | null
    /** Moto: experiencia «viene de otra moto» sin el código Base7 de esa moto (`previousMotorcycle.code`, obligatorio). */
    faltaMotoAnterior?: boolean
  }
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
    /** La compañía declarada arriba no casa con ninguna de la lista de Codeoscopic (texto tal cual). `null` = casa o no hay. */
    companiaNoReconocida?: string | null
    /** Arriba no se ha dicho si tiene seguro ahora (ni hay póliza leída): no es «no tiene», es «no se sabe». */
    tieneSeguroSinDato?: boolean
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
  if (e.ocasionalIgnorado) figuras.push({ clave: 'ocasional-ignorado', texto: 'El riesgo tiene un conductor ocasional', estado: 'aviso', nota: 'en moto la compañía no lo admite: esta cotización no lo declara', ancla: ANCLA.intervinientes, arriba: true })

  const v = e.vehiculo
  const vehiculo: ItemVerificacion[] = [
    { clave: 'version', texto: 'Versión del catálogo', estado: estado(v.faltaVersion), ancla: ANCLA.version, alternativa: ANCLA.vehiculo, arriba: true, nota: v.faltaVersion ? '«Elegir versión del catálogo» en «Datos del vehículo» (gratis)' : undefined },
    { clave: 'matriculacion', texto: 'Fecha de matriculación (o la prevista)', estado: estado(v.faltaMatriculacion), ancla: ANCLA.vehiculo, arriba: true },
    { clave: 'garaje', texto: 'Dónde duerme (garaje)', estado: estado(v.faltaGaraje), ancla: ANCLA.vehiculo, arriba: true, nota: v.faltaGaraje && v.garajeSinCasar ? avisoGarajeSinCasar(v.garajeSinCasar) : undefined },
    { clave: 'km', texto: 'Kilómetros al año', estado: estado(v.kmInvalido), ancla: ANCLA.vehiculo, arriba: true, nota: v.kmInvalido ? 'no se entiende como kilometraje' : undefined },
    { clave: 'compra', texto: 'Fecha de compra', estado: estado(v.compraInvalida), ancla: ANCLA.vehiculo, arriba: true, nota: v.compraInvalida ? 'no puede ser anterior a la matriculación' : undefined },
  ]
  // Moto: con experiencia en OTRA moto, Avant2 exige su código (`previousMotorcycle.code`); se teclea en este cotizador.
  if (v.faltaMotoAnterior !== undefined) {
    vehiculo.push({ clave: 'moto-anterior', texto: 'Experiencia de conducción (código de la moto anterior si viene de otra)', estado: estado(v.faltaMotoAnterior), ancla: ANCLA.experienciaAqui, nota: v.faltaMotoAnterior ? 'falta el código Base7 de la moto anterior' : undefined })
  }

  const h = e.historial
  const historial: ItemVerificacion[] = []
  // 13/10/2026: todo el historial se declara ARRIBA («Historial y bonificaciones»): las compañías consultan SINCO con la
  // compañía actual + nº de póliza (Codeoscopic manda los 5 últimos); sin ellos con seguro, ✗.
  const arriba = { ancla: ANCLA.historial, arriba: true } as const
  if (!h.tieneSeguro) {
    historial.push({
      clave: 'sin-seguro', texto: h.tieneSeguroSinDato ? 'No consta si tiene seguro ahora' : 'Sin seguro en vigor declarado', estado: 'aviso',
      nota: 'se cotiza «de calle»: el precio sale estimado. Si lo tiene, decláralo arriba con su compañía y nº de póliza', ...arriba,
    })
  } else {
    historial.push(
      {
        clave: 'compania', texto: 'Compañía actual (para SINCO)', estado: estado(h.faltaCompania), ...arriba,
        nota: h.faltaCompania && h.companiaNoReconocida ? `«${h.companiaNoReconocida}» no está en la lista de compañías de Codeoscopic: elígela de la lista arriba («Historial y bonificaciones»)` : undefined,
      },
      { clave: 'poliza', texto: 'Nº de póliza actual (van los 5 últimos)', estado: estado(h.faltaPoliza), ...arriba, nota: h.faltaPoliza ? 'hace falta al menos los 5 últimos caracteres' : undefined },
      { clave: 'anios-asegurado', texto: 'Años asegurado sin interrupción', estado: estado(h.faltaAniosAsegurado), ...arriba },
      { clave: 'anios-compania', texto: 'Años en la compañía', estado: estado(h.faltaAniosCompania), ...arriba },
      { clave: 'anios-sin-siniestros', texto: 'Años sin siniestros', estado: estado(h.faltaAniosSinSiniestros), ...arriba },
    )
    if (h.companiaSuperaAsegurado) historial.push({ clave: 'compania-supera', texto: 'Años en la compañía: no pueden ser más que los años asegurado', estado: 'falta', ...arriba })
    if (h.sinSiniestrosSuperaAsegurado) historial.push({ clave: 'sin-siniestros-supera', texto: 'Años sin siniestros: no pueden ser más que los años asegurado', estado: 'falta', ...arriba })
    if (h.siniestros5Pendiente) historial.push({ clave: 'siniestros-5', texto: 'Siniestros en los últimos 5 años', estado: 'aviso', nota: 'recomendado: si la compañía lo exige lo dirá sin cobrar', ...arriba })
  }
  for (const r of h.reparos) historial.push({ clave: `reparo-${r.campo}`, texto: r.campo, estado: 'aviso', nota: r.motivo, ancla: ANCLA.seguroAqui })

  const grupos: GrupoVerificacion[] = [
    { titulo: '1 · Figuras (tomador e intervinientes)', items: figuras },
    { titulo: e.ramo === 'moto' ? '2 · Riesgo: la moto' : '2 · Riesgo: el vehículo', items: vehiculo },
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

// ── El seguro actual que usa el cotizador embebido (13/10/2026) ───────────────────────────────────────────────────
// Lo DECLARADO arriba («Historial y bonificaciones», `historialDeclarado`) manda; sin dato arriba, lo de siempre (lo
// leído de su póliza o el máximo). Aquí no se teclea: se ve en resumen con «Editar arriba».

export type OrigenDato = 'arriba' | 'leido' | 'ninguno'
export type SeguroActualEmbebido = {
  tieneSeguroActual: boolean
  /** Arriba no dice si tiene seguro y no hay póliza leída: «no se sabe», no «no tiene». */
  tieneSeguroSinDato: boolean
  companiaCodigo: string
  companiaLibre: string
  /** Lo que se teclea arriba como compañía y no casa con la lista de Codeoscopic. */
  companiaNoReconocida: string | null
  /** Lo que viaja a Codeoscopic: los 5 últimos (`ultimosDigitosPoliza`). '' = falta. */
  polizaDigitos: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
  origen: { tiene: OrigenDato; compania: OrigenDato; poliza: OrigenDato; sinSiniestros: OrigenDato; siniestros5: OrigenDato }
}

/**
 * PURA. `leido` es lo de siempre (precarga de la póliza leída / el máximo); `codigoDe` traduce un texto de compañía a su
 * código DGS de la lista de Codeoscopic (`null` = no casa o no hay lista). `conCatalogo: false` = sin lista: la compañía va
 * en libre (código DGS) tal cual.
 */
export function seguroActualEmbebido(e: {
  arriba: Partial<HistorialDeclaradoRiesgo> | null
  leido: { tiene: boolean; companiaCodigo: string; companiaLibre: string; poliza: string; aniosSinSiniestros: number; siniestrosUltimos5: number | null }
  conCatalogo: boolean
  codigoDe: (texto: string) => string | null
}): SeguroActualEmbebido {
  const a = e.arriba ?? {}
  const l = e.leido
  const tieneArriba = a.tieneSeguroActual ?? null
  const companiaArriba = a.companiaActual ?? null
  let companiaCodigo = l.companiaCodigo
  let companiaLibre = l.companiaLibre
  let companiaNoReconocida: string | null = null
  if (companiaArriba !== null) {
    if (e.conCatalogo) {
      companiaCodigo = e.codigoDe(companiaArriba) ?? ''
      companiaLibre = ''
      if (companiaCodigo === '') companiaNoReconocida = companiaArriba
    } else {
      companiaCodigo = ''
      companiaLibre = companiaArriba
    }
  }
  const codigoParaPoliza = companiaCodigo || companiaLibre
  const polizaArriba = a.numeroPoliza ?? null
  const polizaFuente = polizaArriba ?? (l.poliza.trim() === '' ? null : l.poliza)
  const sinArriba = a.aniosSinSiniestros ?? null
  const s5Arriba = a.siniestrosUltimos5 ?? null
  const s5 = s5Arriba ?? l.siniestrosUltimos5
  return {
    tieneSeguroActual: tieneArriba ?? l.tiene,
    tieneSeguroSinDato: tieneArriba === null && !l.tiene,
    companiaCodigo,
    companiaLibre,
    companiaNoReconocida,
    polizaDigitos: polizaFuente === null ? '' : ultimosDigitosPoliza(polizaFuente, codigoParaPoliza) ?? '',
    aniosSinSiniestros: String(sinArriba ?? l.aniosSinSiniestros),
    siniestrosUltimos5: s5 === null ? '' : String(s5),
    origen: {
      tiene: tieneArriba !== null ? 'arriba' : l.tiene ? 'leido' : 'ninguno',
      compania: companiaArriba !== null ? 'arriba' : l.companiaCodigo || l.companiaLibre ? 'leido' : 'ninguno',
      poliza: polizaArriba !== null ? 'arriba' : polizaFuente !== null ? 'leido' : 'ninguno',
      sinSiniestros: sinArriba !== null ? 'arriba' : 'leido',
      siniestros5: s5Arriba !== null ? 'arriba' : l.siniestrosUltimos5 !== null ? 'leido' : 'ninguno',
    },
  }
}

/** El aviso de un garaje del riesgo que no está en la lista de la compañía (15/10/2026: nunca se cambia por el defecto). */
export function avisoGarajeSinCasar(etiqueta: string): string {
  return `El riesgo dice «${etiqueta}» pero no está en la lista de la compañía: elige el equivalente. Si la lista no tiene opción de calle, avisa a Alberto en vez de declarar un garaje`
}

/**
 * «Años en esta compañía» sin dato arriba (15/10/2026): NO se lee de su póliza; es un SUPUESTO derivado de los años
 * asegurado (el máximo, 10, topado a los años asegurado). Decir «lo leído de su póliza» era falso.
 */
export function notaAniosEnCompania(o: OrigenDato): string | undefined {
  return o === 'arriba' ? undefined : 'sin dato arriba: supuesto, los años asegurado (máximo 10); lo contrasta SINCO'
}

/** La nota pequeña del resumen según de dónde sale el dato (lo declarado nunca se rotula como leído, ni al revés). */
export function notaOrigen(o: OrigenDato): string | undefined {
  return o === 'arriba' ? undefined : o === 'leido' ? 'sin dato arriba: va lo leído de su póliza o el máximo (lo contrasta SINCO)' : 'sin dato arriba'
}

/**
 * Cómo pinta el RESUMEN un dato vacío (13/10/2026). Coherente con la checklist: lo que ella trata como `aviso` (seguro
 * actual sin dato, siniestros en 5 años) va en ámbar «Sin dato», nunca en rojo «Falta» (rojo = bloquea el pago).
 */
export type NivelVacio = 'falta' | 'aviso'
export function rotuloVacioResumen(n: NivelVacio): { texto: string; color: string } {
  return n === 'aviso'
    ? { texto: 'Sin dato — complétalo arriba', color: 'var(--warning)' }
    : { texto: 'Falta — complétalo arriba', color: 'var(--negative)' }
}

/**
 * PURA (13/10/2026, moto; misma regla que el cálculo en línea de `AutoNuevo.tsx`): los años del historial que manda el
 * cotizador embebido. Lo DECLARADO arriba manda (asegurado / en la compañía); lo que no viene de arriba (lo leído de su
 * póliza o el máximo) se TOPA a los años asegurado: Avant2 exige en la compañía y sin siniestros ≤ asegurado y ese 400
 * se paga. Lo declarado arriba NO se topa: si es incoherente, la checklist lo marca ✗ y se corrige arriba.
 */
export function historialConTopes<T extends { aniosAsegurado: number; aniosEnCompania: number; aniosSinSiniestros: number }>(
  leido: T,
  arriba: Partial<HistorialDeclaradoRiesgo> | null,
): T & { origenAsegurado: OrigenDato; origenEnCompania: OrigenDato } {
  const aseguradoArriba = arriba?.aniosAsegurado ?? null
  const enCompaniaArriba = arriba?.aniosEnCompania ?? null
  const asegurado = aseguradoArriba ?? leido.aniosAsegurado
  return {
    ...leido,
    aniosAsegurado: asegurado,
    aniosEnCompania: enCompaniaArriba ?? Math.min(leido.aniosEnCompania, asegurado),
    aniosSinSiniestros: Math.min(leido.aniosSinSiniestros, asegurado),
    origenAsegurado: aseguradoArriba !== null ? 'arriba' : 'leido',
    origenEnCompania: enCompaniaArriba !== null ? 'arriba' : 'leido',
  }
}
