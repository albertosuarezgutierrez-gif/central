/**
 * Los datos del COMERCIO de un riesgo de comercio (30/09/2026), guardados en
 * `seguros.oportunidades.info_riesgo.datosComercio` para verlos, editarlos y CONFIRMARLOS en la pantalla del
 * riesgo. Sustituye al riesgo libre SOLO en este ramo (RC, comunidades y otros siguen en `datosRiesgoLibre`).
 *
 * Campos = los que manda CIMA en `RiesgoComercios` del EIAC (docs/CIMA-CAMPOS.md) + los propios que CIMA no da y
 * hacen falta para tarificar (`regimenLocal`, y desde el 03/10/2026 las preguntas COMUNES de los pasos Comercio y
 * Seguro de Avant2: familia, empleados, facturación, situación, edificio, reforma, materiales, calidad,
 * conservación, instalación eléctrica, aforo y superficie exterior; docs/correduria/COMERCIO-AVANT2-VS-CIMA.md §5).
 * Las preguntas PROPIAS de cada compañía (paso Productos: Occident y Reale) van aparte, en `porCompania`.
 * Los desplegables de Avant2 de los que el doc solo recoge UN valor visto (situación, tipo de edificio, materiales,
 * calidad, familia…) son TEXTO LIBRE: no se inventa un catálogo. La modalidad de continente ya vive en
 * `capitales[CONTINENTE].modalidad`.
 *
 * Nombres alineados con lo que el mapper de CIMA ya escribe en `polizas.datos_especificos`, para que al emitir
 * no haya dos formas del mismo dato:
 *   EIAC Actividad.DescripcionActividad  → `actividad`
 *   SituacionRiesgo.NombreVia            → `direccion`        (la clave de la póliza; objeto.ts/precarga libre)
 *   SituacionRiesgo.OtrosDatosVia        → `otrosDatosVia`
 *   SituacionRiesgo.CodigoPostal         → `cp`
 *   SituacionRiesgo.Poblacion            → `localidad`
 *   SituacionRiesgo.Provincia            → `provincia`
 *   SuperficieConstruida                 → `metrosCuadrados`
 *   SuperficieTotal                      → `superficieTotal`
 *   Antiguedad                           → `anioConstruccion` (año limpio; la ingesta lo deja en `anioConstruccionCima`)
 *   Zona                                 → `zona`            (código de la compañía, tal cual)
 *   Capitales.Capital[]                  → `capitales[{bien, importe, modalidad, descripcion}]`
 *   MedidasProteccion.Proteccion[]       → `medidasProteccion[{medida, valor}]`   (la forma de `datos-compania-cima.ts`)
 *
 * 🚨 `null` = «no se sabe». En las dos LISTAS hay tres estados: `null` (nadie las ha mirado) · `[]` (revisado, no
 * hay) · con filas. Un importe de 0 es un dato («0 € declarados»). Una edición que trae la clave de una lista la
 * REEMPLAZA entera; ausente = no se toca.
 */
import {
  aplicarEdicionBloque, leerBloque, numeroDesdeTexto, validarParcial, vaciosDe,
  type CambioCampo, type ErrorCampo, type Espec,
} from './datos-riesgo-generico.ts'

/** Ramos que llevan este bloque. */
export function admiteDatosComercio(ramo: unknown): ramo is 'comercio' {
  return ramo === 'comercio'
}

export const REGIMENES_LOCAL = ['propietario', 'inquilino'] as const
export type RegimenLocal = (typeof REGIMENES_LOCAL)[number]
export const ETIQUETA_REGIMEN_LOCAL: Record<RegimenLocal, string> = { propietario: 'Propietario del local', inquilino: 'Inquilino (alquiler)' }

/** `claves_bien` del EIAC (§13.3.72) que se ofrecen en el comercio. */
export const BIENES_COMERCIO = ['CONTINENTE', 'CONTENIDO', 'MERCADERIAS', 'RC', 'OVJ', 'OTROS'] as const
export type BienComercio = (typeof BIENES_COMERCIO)[number]
export const ETIQUETA_BIEN_COMERCIO: Record<BienComercio, string> = {
  CONTINENTE: 'Continente (el local)',
  CONTENIDO: 'Contenido (mobiliario, maquinaria)',
  MERCADERIAS: 'Mercaderías',
  RC: 'Responsabilidad civil',
  OVJ: 'Objetos de valor y joyas',
  OTROS: 'Otros',
}

export const MAX_CAPITALES_COMERCIO = 30
export const MAX_MEDIDAS_COMERCIO = 30

export const ESPEC_COMERCIO = [
  { clave: 'actividad', etiqueta: 'Actividad', tipo: { t: 'texto', max: 200 } },
  { clave: 'direccion', etiqueta: 'Calle y número', tipo: { t: 'texto', max: 200 } },
  { clave: 'otrosDatosVia', etiqueta: 'Otros datos de la vía', tipo: { t: 'texto', max: 100 } },
  { clave: 'cp', etiqueta: 'Código postal', tipo: { t: 'cp' } },
  { clave: 'localidad', etiqueta: 'Población', tipo: { t: 'texto', max: 80 } },
  { clave: 'provincia', etiqueta: 'Provincia', tipo: { t: 'texto', max: 60 } },
  { clave: 'metrosCuadrados', etiqueta: 'Superficie construida (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000, sobreMin: true } },
  { clave: 'superficieTotal', etiqueta: 'Superficie total (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000, sobreMin: true } },
  { clave: 'anioConstruccion', etiqueta: 'Año de construcción (antigüedad)', tipo: { t: 'entero', min: 1500, max: 'anioTope' } },
  { clave: 'zona', etiqueta: 'Zona (código de la compañía)', tipo: { t: 'texto', max: 40 } },
  { clave: 'regimenLocal', etiqueta: 'Local en propiedad o alquiler', tipo: { t: 'id' } },
  // ─── Comunes de Avant2 (03/10/2026). sí/no = boolean|null: `null` es «no se sabe», nunca `false` por defecto. ───
  { clave: 'familiaActividad', etiqueta: 'Familia de actividad', tipo: { t: 'texto', max: 80 } },
  { clave: 'numeroEmpleados', etiqueta: 'Número de empleados', tipo: { t: 'entero', min: 0, max: 100_000 } },
  { clave: 'facturacionAnual', etiqueta: 'Facturación anual (€)', tipo: { t: 'numero', min: 0, max: 10_000_000_000 } },
  { clave: 'situacion', etiqueta: 'Situación del local', tipo: { t: 'texto', max: 80 } },
  { clave: 'tipoEdificio', etiqueta: 'Tipo de edificio', tipo: { t: 'texto', max: 120 } },
  { clave: 'soloPlantaBaja', etiqueta: 'El edificio solo tiene planta baja', tipo: { t: 'bool' } },
  { clave: 'reformado', etiqueta: 'Reformado', tipo: { t: 'bool' } },
  { clave: 'anioReforma', etiqueta: 'Año de la reforma', tipo: { t: 'entero', min: 1500, max: 'anioTope' } },
  { clave: 'materiales', etiqueta: 'Materiales de construcción', tipo: { t: 'texto', max: 80 } },
  { clave: 'calidadConstruccion', etiqueta: 'Calidad de la construcción', tipo: { t: 'texto', max: 80 } },
  { clave: 'conservacionBuena', etiqueta: 'Buen estado de conservación', tipo: { t: 'bool' } },
  { clave: 'instalacionElectricaRevisada', etiqueta: 'Instalación eléctrica revisada', tipo: { t: 'bool' } },
  { clave: 'aforo', etiqueta: 'Aforo (personas)', tipo: { t: 'entero', min: 1, max: 100_000 } },
  { clave: 'superficieExterior', etiqueta: 'Superficie exterior / terraza (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000 } },
] as const satisfies Espec

// ─── Preguntas PROPIAS de cada compañía (paso «Productos» de Avant2, §5.2 del doc) ───────────────────────────
// Solo se piden al cotizar con esa compañía; no cuentan para «falta para tarificar». Los desplegables de los que
// el doc solo recoge un valor visto son texto libre.

export const COMPANIAS_COMERCIO = ['occident', 'reale'] as const
export type CompaniaComercio = (typeof COMPANIAS_COMERCIO)[number]
export const ETIQUETA_COMPANIA_COMERCIO: Record<CompaniaComercio, string> = { occident: 'Occident', reale: 'Reale' }

/** Occident: 17 campos (la fila de basculantes del doc son 2 preguntas). */
export const ESPEC_OCCIDENT = [
  { clave: 'descuento', etiqueta: 'Descuento (%)', tipo: { t: 'numero', min: 0, max: 100 } },
  { clave: 'colectivo', etiqueta: 'Forma parte de un colectivo con condiciones especiales', tipo: { t: 'bool' } },
  { clave: 'actividadSecundaria', etiqueta: 'Actividad secundaria', tipo: { t: 'bool' } },
  { clave: 'basculantesConPuertaPeatonal', etiqueta: 'Basculantes con anclajes laterales y cerradura de seguridad, con puerta peatonal', tipo: { t: 'bool' } },
  { clave: 'basculantesSinPuertaPeatonal', etiqueta: 'Basculantes con anclajes laterales y cerradura de seguridad, sin puerta peatonal', tipo: { t: 'bool' } },
  { clave: 'actividadTemporada', etiqueta: 'Actividad de temporada', tipo: { t: 'bool' } },
  { clave: 'aforoMaximo', etiqueta: 'Aforo máximo autorizado (local y terraza)', tipo: { t: 'entero', min: 1, max: 100_000 } },
  { clave: 'contratarRoboContenido', etiqueta: 'Contratar robo del contenido', tipo: { t: 'bool' } },
  { clave: 'superficieLocal', etiqueta: 'Superficie de local (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000, sobreMin: true } },
  { clave: 'superficieExterior', etiqueta: 'Superficie de zona exterior (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000 } },
  { clave: 'superficieAlmacen', etiqueta: 'Superficie de almacenamiento (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000 } },
  { clave: 'superficieZonaComun', etiqueta: 'Superficie de zona común (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000 } },
  { clave: 'bienesTercerosIncluidos', etiqueta: 'Bienes de terceros incluidos en los capitales', tipo: { t: 'bool' } },
  { clave: 'capitalObjetosValor', etiqueta: 'Capital de objetos de valor (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'periodosMercancias', etiqueta: 'Tiene períodos de mercancías', tipo: { t: 'bool' } },
  { clave: 'formaAseguramientoExterior', etiqueta: 'Forma de aseguramiento (zona exterior)', tipo: { t: 'texto', max: 80 } },
  { clave: 'capitalArbolado', etiqueta: 'Capital de arbolado, jardines y plantas', tipo: { t: 'texto', max: 80 } },
] as const satisfies Espec

/** Reale: 21 campos (el robo de continente a primer riesgo son 2: sí/no + capital). */
export const ESPEC_REALE = [
  { clave: 'campana', etiqueta: 'Campaña comercial', tipo: { t: 'texto', max: 80 } },
  { clave: 'sotano', etiqueta: 'Tiene sótano', tipo: { t: 'bool' } },
  { clave: 'almacen', etiqueta: 'Tiene almacén', tipo: { t: 'bool' } },
  { clave: 'aforo', etiqueta: 'Aforo', tipo: { t: 'entero', min: 1, max: 100_000 } },
  { clave: 'huecosAltosOInaccesibles', etiqueta: 'Huecos a más de 5 m de altura o sin huecos accesibles', tipo: { t: 'bool' } },
  { clave: 'centroComercial', etiqueta: 'Ubicado en centro comercial', tipo: { t: 'bool' } },
  { clave: 'franquicia', etiqueta: 'Franquicia', tipo: { t: 'texto', max: 80 } },
  { clave: 'roboContinentePrimerRiesgo', etiqueta: 'Robo de continente a primer riesgo', tipo: { t: 'bool' } },
  { clave: 'capitalRoboContinente', etiqueta: 'Capital de robo de continente (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'desperfectosRoboContinente', etiqueta: 'Desperfectos por robo al continente', tipo: { t: 'bool' } },
  { clave: 'roboContenido', etiqueta: 'Robo de contenido', tipo: { t: 'bool' } },
  { clave: 'tipoCoberturaRobo', etiqueta: 'Tipo de cobertura de robo', tipo: { t: 'texto', max: 80 } },
  { clave: 'capitalMetalicoFueraCaja', etiqueta: 'Capital de robo y expoliación de metálico fuera de caja (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'capitalMetalicoCajaFuerte', etiqueta: 'Capital de robo y expoliación de metálico en caja fuerte (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'capitalTransporteFondos', etiqueta: 'Capital de expoliación durante transporte de fondos (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'rcIntoxicacionesAlimenticias', etiqueta: 'RC intoxicaciones alimenticias', tipo: { t: 'bool' } },
  { clave: 'indemnizacionDiariaPrimerRiesgo', etiqueta: 'Indemnización diaria a primer riesgo', tipo: { t: 'bool' } },
  { clave: 'capitalRcObjetosConfiados', etiqueta: 'Capital RC objetos confiados', tipo: { t: 'texto', max: 80 } },
  { clave: 'rcTrabajosFuera', etiqueta: 'RC trabajos fuera', tipo: { t: 'bool' } },
  { clave: 'capitalDanosEsteticos', etiqueta: 'Capital de daños estéticos (€)', tipo: { t: 'numero', min: 0, max: 1_000_000_000 } },
  { clave: 'transporteMercancias', etiqueta: 'Capital de transporte de mercancías (sí/no)', tipo: { t: 'bool' } },
] as const satisfies Espec

export const ESPEC_POR_COMPANIA = { occident: ESPEC_OCCIDENT, reale: ESPEC_REALE } as const satisfies Record<CompaniaComercio, Espec>

type ValorBloque = string | number | boolean | null
/** Un bloque de compañía: TODAS sus claves, `null` = no se sabe. */
export type BloqueCompania<E extends Espec> = { [K in E[number]['clave']]: ValorBloque }
export type PorCompaniaComercio = { occident?: BloqueCompania<typeof ESPEC_OCCIDENT>; reale?: BloqueCompania<typeof ESPEC_REALE> }
/** Edición parcial: por compañía, solo las claves que vienen; la compañía a `null` = borrar su bloque. */
export type EdicionPorCompania = { [C in CompaniaComercio]?: Partial<BloqueCompania<(typeof ESPEC_POR_COMPANIA)[C]>> | null }

export type CampoComercio = (typeof ESPEC_COMERCIO)[number]['clave'] | 'capitales' | 'medidasProteccion' | 'porCompania'

export type CapitalComercio = { bien: BienComercio; importe: number; modalidad: string | null; descripcion: string | null }
export type MedidaComercio = { medida: string; valor: string | null }

export type DatosComercioRiesgo = {
  actividad: string | null
  direccion: string | null
  otrosDatosVia: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  metrosCuadrados: number | null
  superficieTotal: number | null
  anioConstruccion: number | null
  zona: string | null
  regimenLocal: RegimenLocal | null
  familiaActividad: string | null
  numeroEmpleados: number | null
  facturacionAnual: number | null
  situacion: string | null
  tipoEdificio: string | null
  soloPlantaBaja: boolean | null
  reformado: boolean | null
  anioReforma: number | null
  materiales: string | null
  calidadConstruccion: string | null
  conservacionBuena: boolean | null
  instalacionElectricaRevisada: boolean | null
  aforo: number | null
  superficieExterior: number | null
  /** `null` = sin mirar · `{}`/bloques = lo de cada compañía (preguntas propias del paso Productos). */
  porCompania: PorCompaniaComercio | null
  /** `null` = sin mirar · `[]` = revisado, no hay · filas. */
  capitales: CapitalComercio[] | null
  medidasProteccion: MedidaComercio[] | null
  confirmadoAt: string | null
}

export const CAMPOS_COMERCIO: readonly CampoComercio[] = [...ESPEC_COMERCIO.map((c) => c.clave), 'capitales', 'medidasProteccion', 'porCompania']
export const ETIQUETA_CAMPO_COMERCIO: Record<CampoComercio, string> = {
  ...(Object.fromEntries(ESPEC_COMERCIO.map((c) => [c.clave, c.etiqueta])) as Record<(typeof ESPEC_COMERCIO)[number]['clave'], string>),
  capitales: 'Capitales asegurados',
  medidasProteccion: 'Medidas de protección',
  porCompania: 'Preguntas propias de cada compañía',
}

export const AVISO_COMERCIO = 'Este ramo se cotiza fuera: por ahora los datos quedan para el expediente y para tarificar con la compañía.'

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const compactar = (s: string) => s.replace(/\s+/g, ' ').trim()
const textoLeido = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const regimenLeido = (v: unknown): RegimenLocal | null => (v === 'propietario' || v === 'inquilino' ? v : null)
const bienLeido = (v: unknown): BienComercio | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return (BIENES_COMERCIO as readonly string[]).includes(s) ? (s as BienComercio) : null
}

// ─── Lectura (sin fiarse de lo guardado) ─────────────────────────────────────

function leerCapitales(bruto: unknown): CapitalComercio[] | null {
  if (!Array.isArray(bruto)) return null
  const out: CapitalComercio[] = []
  for (const x of bruto) {
    if (!esObj(x)) continue
    const bien = bienLeido(x.bien)
    // Un importe que no es número es «no se sabe»: la fila no se inventa un 0.
    if (bien === null || typeof x.importe !== 'number' || !Number.isFinite(x.importe)) continue
    out.push({ bien, importe: x.importe, modalidad: textoLeido(x.modalidad), descripcion: textoLeido(x.descripcion) })
  }
  return out
}

function leerMedidas(bruto: unknown): MedidaComercio[] | null {
  if (!Array.isArray(bruto)) return null
  const out: MedidaComercio[] = []
  for (const x of bruto) {
    if (!esObj(x)) continue
    const medida = textoLeido(x.medida)
    if (medida === null) continue
    out.push({ medida, valor: textoLeido(x.valor) })
  }
  return out
}

/**
 * Lo guardado en `porCompania`: solo las compañías conocidas, cada bloque leído sin fiarse (campo de otro tipo =
 * `null`). `null` si no es un objeto. Una compañía ausente sigue ausente (no se inventa un bloque de `null`s).
 */
/** Un bloque con todas las claves `null` no es dato («no se sabe» ≠ revisado): se descarta. Sin compañías, `null`. */
const bloqueVacio = (b: unknown): boolean => !esObj(b) || Object.values(b).every((v) => v === null || v === undefined)
function podarPorCompania(o: Record<string, unknown>): PorCompaniaComercio | null {
  const out: Record<string, unknown> = {}
  for (const c of COMPANIAS_COMERCIO) if (c in o && !bloqueVacio(o[c])) out[c] = o[c]
  return Object.keys(out).length === 0 ? null : (out as PorCompaniaComercio)
}

function leerPorCompania(bruto: unknown): PorCompaniaComercio | null {
  if (!esObj(bruto)) return null
  const out: Record<string, unknown> = {}
  for (const c of COMPANIAS_COMERCIO) {
    if (!esObj(bruto[c])) continue
    const { confirmadoAt: _ignorado, ...bloque } = leerBloque(ESPEC_POR_COMPANIA[c], bruto[c]) as Record<string, ValorBloque>
    out[c] = bloque
  }
  return podarPorCompania(out)
}

export function datosComercioVacios(): DatosComercioRiesgo {
  return { ...(vaciosDe(ESPEC_COMERCIO) as Omit<DatosComercioRiesgo, 'capitales' | 'medidasProteccion' | 'porCompania'>), capitales: null, medidasProteccion: null, porCompania: null }
}

/** Lo guardado en `info_riesgo.datosComercio`. Un campo de otro tipo es «no se sabe»; lo que no se reconoce se ignora. */
export function leerDatosComercio(bruto: unknown): DatosComercioRiesgo | null {
  if (!esObj(bruto)) return null
  const base = leerBloque(ESPEC_COMERCIO, bruto) as Record<string, string | number | boolean | null>
  return {
    ...(base as unknown as Omit<DatosComercioRiesgo, 'capitales' | 'medidasProteccion' | 'regimenLocal' | 'porCompania'>),
    regimenLocal: regimenLeido(bruto.regimenLocal),
    porCompania: leerPorCompania(bruto.porCompania),
    capitales: leerCapitales(bruto.capitales),
    medidasProteccion: leerMedidas(bruto.medidasProteccion),
  }
}

// ─── Validación de una edición PARCIAL ───────────────────────────────────────

export type ValorEdicionComercio = Partial<Omit<DatosComercioRiesgo, 'confirmadoAt' | 'porCompania'>> & { porCompania?: EdicionPorCompania | null }
export type ValidacionComercio = { ok: true; valor: ValorEdicionComercio } | { ok: false; errores: ErrorCampo[] }

function textoOpcional(v: unknown, max: number): string | null | 'invalido' {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'invalido'
  const t = compactar(v)
  if (t === '') return null
  return t.length > max ? 'invalido' : t
}

/** Valida la lista de capitales entera. Cada fila con su motivo; `null` = borrar (sin mirar). */
export function validarCapitalesComercio(v: unknown): { ok: true; valor: CapitalComercio[] | null } | { ok: false; errores: ErrorCampo[] } {
  if (v === null) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, errores: [{ campo: 'capitales', motivo: 'Capitales: tiene que ser una lista.' }] }
  if (v.length > MAX_CAPITALES_COMERCIO) return { ok: false, errores: [{ campo: 'capitales', motivo: `Capitales: como mucho ${MAX_CAPITALES_COMERCIO}.` }] }
  const errores: ErrorCampo[] = []
  const valor: CapitalComercio[] = []
  v.forEach((x, i) => {
    const mal = (motivo: string) => errores.push({ campo: 'capitales', motivo: `Capital ${i + 1}: ${motivo}` })
    if (!esObj(x)) return mal('tiene que ser un objeto.')
    const bien = bienLeido(x.bien)
    if (bien === null) return mal('elige de qué es el capital.')
    const importe = numeroDesdeTexto(x.importe)
    if (x.importe === null || x.importe === undefined || (typeof x.importe === 'string' && x.importe.trim() === '')) return mal('falta el importe.')
    if (!Number.isFinite(importe) || importe < 0 || importe > 1_000_000_000) return mal('el importe tiene que ser un número entre 0 y 1.000.000.000.')
    const modalidad = textoOpcional(x.modalidad, 40)
    const descripcion = textoOpcional(x.descripcion, 120)
    if (modalidad === 'invalido') return mal('modalidad de valoración no válida o demasiado larga.')
    if (descripcion === 'invalido') return mal('descripción no válida o demasiado larga.')
    if (bien === 'OTROS' && descripcion === null) return mal('«Otros» necesita una descripción.')
    valor.push({ bien, importe: Math.round(importe * 100) / 100, modalidad, descripcion })
  })
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

export function validarMedidasComercio(v: unknown): { ok: true; valor: MedidaComercio[] | null } | { ok: false; errores: ErrorCampo[] } {
  if (v === null) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, errores: [{ campo: 'medidasProteccion', motivo: 'Medidas de protección: tiene que ser una lista.' }] }
  if (v.length > MAX_MEDIDAS_COMERCIO) return { ok: false, errores: [{ campo: 'medidasProteccion', motivo: `Medidas de protección: como mucho ${MAX_MEDIDAS_COMERCIO}.` }] }
  const errores: ErrorCampo[] = []
  const valor: MedidaComercio[] = []
  v.forEach((x, i) => {
    const mal = (motivo: string) => errores.push({ campo: 'medidasProteccion', motivo: `Medida ${i + 1}: ${motivo}` })
    if (!esObj(x)) return mal('tiene que ser un objeto.')
    const medida = textoOpcional(x.medida, 120)
    const val = textoOpcional(x.valor, 80)
    if (medida === 'invalido' || val === 'invalido') return mal('texto no válido o demasiado largo.')
    if (medida === null) return mal('falta la descripción de la medida.')
    valor.push({ medida, valor: val })
  })
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

/** Valida `porCompania`: `null` = borrar todo; por compañía, `null` = borrar su bloque u objeto parcial de sus claves. */
export function validarPorCompania(v: unknown): { ok: true; valor: EdicionPorCompania | null } | { ok: false; errores: ErrorCampo[] } {
  if (v === null) return { ok: true, valor: null }
  if (!esObj(v)) return { ok: false, errores: [{ campo: 'porCompania', motivo: 'Preguntas de compañía: tiene que ser un objeto.' }] }
  const errores: ErrorCampo[] = []
  const valor: Record<string, unknown> = {}
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  for (const c of COMPANIAS_COMERCIO) {
    if (!Object.prototype.hasOwnProperty.call(v, c)) continue
    const x = v[c]
    if (x === null) { valor[c] = null; continue }
    const r = validarParcial(ESPEC_POR_COMPANIA[c], x, { hoy, nombreBloque: ETIQUETA_COMPANIA_COMERCIO[c] })
    if (r.ok) valor[c] = r.valor
    else errores.push(...r.errores.map((e) => ({ campo: `porCompania.${c}.${e.campo}`, motivo: `${ETIQUETA_COMPANIA_COMERCIO[c]} · ${e.motivo}` })))
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor: valor as EdicionPorCompania }
}

/**
 * Valida una edición PARCIAL (solo las claves que vienen). Vacío/`null` = borrar ese dato. Las claves que no son
 * del bloque se ignoran (no se cuelan al JSON guardado).
 */
export function validarDatosComercioRiesgo(parcial: unknown, opciones: { hoy?: string } = {}): ValidacionComercio {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_COMERCIO, parcial, { hoy, nombreBloque: 'Los datos del comercio' })
  if (!esObj(parcial)) return v as { ok: false; errores: ErrorCampo[] }
  const errores: ErrorCampo[] = v.ok ? [] : [...v.errores]
  const valor: Record<string, unknown> = v.ok ? { ...v.valor } : {}
  if (v.ok && valor.regimenLocal !== undefined && valor.regimenLocal !== null && regimenLeido(valor.regimenLocal) === null) {
    errores.push({ campo: 'regimenLocal', motivo: 'Local en propiedad o alquiler: elige propietario o inquilino.' })
  }
  if (Object.prototype.hasOwnProperty.call(parcial, 'capitales')) {
    const c = validarCapitalesComercio(parcial.capitales === undefined ? null : parcial.capitales)
    if (c.ok) valor.capitales = c.valor
    else errores.push(...c.errores)
  }
  if (Object.prototype.hasOwnProperty.call(parcial, 'medidasProteccion')) {
    const m = validarMedidasComercio(parcial.medidasProteccion === undefined ? null : parcial.medidasProteccion)
    if (m.ok) valor.medidasProteccion = m.valor
    else errores.push(...m.errores)
  }
  if (Object.prototype.hasOwnProperty.call(parcial, 'porCompania')) {
    const p = validarPorCompania(parcial.porCompania === undefined ? null : parcial.porCompania)
    if (p.ok) valor.porCompania = p.valor
    else errores.push(...p.errores)
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor: valor as ValorEdicionComercio }
}

// ─── «Qué falta» para tarificar ──────────────────────────────────────────────

export type CampoFaltaComercio = 'actividad' | 'familiaActividad' | 'numeroEmpleados' | 'situacion' | 'superficie' | 'regimenLocal' | 'capitales' | 'modalidadContinente'

const ETIQUETA_FALTA: Record<CampoFaltaComercio, string> = {
  actividad: 'la actividad',
  familiaActividad: 'la familia de actividad',
  numeroEmpleados: 'el número de empleados',
  situacion: 'la situación del local (calle, código postal y población)',
  superficie: 'la superficie construida',
  regimenLocal: 'si el local es en propiedad o en alquiler',
  capitales: 'al menos un capital asegurado (mayor que 0)',
  modalidadContinente: 'la modalidad de valoración del continente',
}

/**
 * Lo que FALTA para tarificar un comercio: actividad, familia, empleados, situación (calle + CP + población), superficie construida,
 * régimen del local, al menos un capital y la modalidad si hay continente. Lo de cada compañía NO cuenta. `null` (sin ficha) = «falta todo». Un capital de 0 no basta (no hay
 * nada que tarificar), pero sí cuenta como dato en la ficha.
 */
export function faltanDatosComercio(datos: Partial<DatosComercioRiesgo> | null | undefined): CampoFaltaComercio[] {
  const d = datos ?? {}
  const f: CampoFaltaComercio[] = []
  if (!d.actividad) f.push('actividad')
  if (!d.familiaActividad) f.push('familiaActividad')
  // 0 empleados es un dato (autónomo); solo `null` = no se sabe. Avant2 lo exige.
  if (d.numeroEmpleados === null || d.numeroEmpleados === undefined) f.push('numeroEmpleados')
  if (!d.direccion || !d.cp || !d.localidad) f.push('situacion')
  if (d.metrosCuadrados === null || d.metrosCuadrados === undefined) f.push('superficie')
  if (!d.regimenLocal) f.push('regimenLocal')
  if (!(d.capitales ?? []).some((c) => c.importe > 0)) f.push('capitales')
  // Con capital de CONTINENTE (> 0) Avant2 exige la modalidad (valor de reposición, real…).
  if ((d.capitales ?? []).some((c) => c.bien === 'CONTINENTE' && c.importe > 0 && !c.modalidad)) f.push('modalidadContinente')
  return f
}

export function textoFaltanComercio(faltan: readonly CampoFaltaComercio[] | null | undefined): string | null {
  if (faltan === null || faltan === undefined || faltan.length === 0) return null
  return `Falta para tarificar: ${faltan.map((c) => ETIQUETA_FALTA[c]).join(', ')}.`
}

// ─── Edición ─────────────────────────────────────────────────────────────────

const eurTexto = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`

/** Una lista como texto corto para el historial de cambios («ninguno» = revisada y vacía; `null` = sin mirar). */
export function textoCapitalesComercio(c: readonly CapitalComercio[] | null): string | null {
  if (c === null) return null
  if (c.length === 0) return 'ninguno'
  return c.map((x) => `${x.bien}${x.descripcion ? ` (${x.descripcion})` : ''} ${eurTexto(x.importe)}${x.modalidad ? ` [${x.modalidad}]` : ''}`).join(' · ')
}
export function textoMedidasComercio(m: readonly MedidaComercio[] | null): string | null {
  if (m === null) return null
  if (m.length === 0) return 'ninguna'
  return m.map((x) => (x.valor ? `${x.medida}: ${x.valor}` : x.medida)).join(' · ')
}

export function aplicarEdicionComercio(
  actual: DatosComercioRiesgo | null,
  valor: ValorEdicionComercio,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosComercioRiesgo; cambios: CambioCampo[] } {
  const previo = actual ?? datosComercioVacios()
  const escalares: Record<string, never> = {}
  for (const c of ESPEC_COMERCIO) if (Object.prototype.hasOwnProperty.call(valor, c.clave)) escalares[c.clave] = (valor as Record<string, never>)[c.clave]
  const r = aplicarEdicionBloque(ESPEC_COMERCIO, previo as unknown as Record<string, never>, escalares, opciones)
  const datos = { ...previo, ...(r.datos as object) } as DatosComercioRiesgo
  const cambios = [...r.cambios]

  if (Object.prototype.hasOwnProperty.call(valor, 'capitales')) {
    const nuevo = valor.capitales ?? null
    if (JSON.stringify(nuevo) !== JSON.stringify(previo.capitales)) {
      cambios.push({ campo: 'capitales', antes: textoCapitalesComercio(previo.capitales), despues: textoCapitalesComercio(nuevo) })
      datos.capitales = nuevo
    }
  }
  if (Object.prototype.hasOwnProperty.call(valor, 'medidasProteccion')) {
    const nuevo = valor.medidasProteccion ?? null
    if (JSON.stringify(nuevo) !== JSON.stringify(previo.medidasProteccion)) {
      cambios.push({ campo: 'medidasProteccion', antes: textoMedidasComercio(previo.medidasProteccion), despues: textoMedidasComercio(nuevo) })
      datos.medidasProteccion = nuevo
    }
  }
  if (Object.prototype.hasOwnProperty.call(valor, 'porCompania')) {
    const ed = valor.porCompania ?? null
    const previoPC = previo.porCompania
    if (ed === null) {
      if (previoPC !== null) { cambios.push({ campo: 'porCompania', antes: 'con datos', despues: null }); datos.porCompania = null }
    } else {
      const nuevo: Record<string, unknown> = { ...(previoPC ?? {}) }
      let toco = false
      for (const c of COMPANIAS_COMERCIO) {
        if (!Object.prototype.hasOwnProperty.call(ed, c)) continue
        const e = ed[c]
        const bloquePrevio = previoPC?.[c]
        if (e === null || e === undefined) {
          if (bloquePrevio !== undefined) { delete nuevo[c]; toco = true; cambios.push({ campo: `porCompania.${c}`, antes: 'con datos', despues: null }) }
          continue
        }
        const r = aplicarEdicionBloque(ESPEC_POR_COMPANIA[c], (bloquePrevio ?? null) as Record<string, never> | null, e as Record<string, never>, { confirmar: false, ahora: '' })
        if (r.cambios.length === 0) continue
        const { confirmadoAt: _ignorado, ...bloque } = r.datos
        nuevo[c] = bloque
        toco = true
        cambios.push(...r.cambios.map((x) => ({ ...x, campo: `porCompania.${c}.${x.campo}` })))
      }
      if (toco) datos.porCompania = podarPorCompania(nuevo)
    }
  }
  // Mismo sello que el resto: se confirma → `ahora`; cualquier cambio sin confirmar (también de las listas) → se borra.
  if (opciones.confirmar) datos.confirmadoAt = opciones.ahora
  else if (cambios.length > 0) datos.confirmadoAt = null
  return { datos, cambios }
}

/** Sin nada que afirmar no hay nada que confirmar. Una lista `[]` (revisada, vacía) sí es algo que afirmar. */
export function motivoNoConfirmableComercio(d: DatosComercioRiesgo): string | null {
  return CAMPOS_COMERCIO.some((k) => (k === 'porCompania' ? d.porCompania !== null && podarPorCompania(d.porCompania) !== null : d[k] !== null)) ? null : 'No se puede confirmar un comercio sin ningún dato.'
}

// ─── Precarga desde la póliza ────────────────────────────────────────────────

const CAJON = /^(N\/A|NA|NULL|NONE|OTRO|OTROS|DESCONOCIDO|SIN DATOS?|NO INFORMADO|NO CONSTA|0|00000000|-+)$/i

/**
 * Precarga desde `polizas.datos_especificos` cuando la oportunidad nace de una póliza (lo que escribe el mapper
 * de CIMA). Sin inventar: lo que no hay, no se pone; el cifrado (`v1:`) y los valores de cajón, tampoco. Los
 * capitales `OTROS` de la ingesta son partidas de COBERTURA (513 medidos), no capitales del bien: no se precargan.
 * Una lista sin ninguna fila válida no se precarga (`[]` sería afirmar «revisado, no hay»). NUNCA confirmado.
 */
export function precargaComercioDePoliza(datos: unknown): ValorEdicionComercio {
  const d = esObj(datos) ? datos : {}
  const t = (v: unknown): string | null => {
    const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : ''
    return s === '' || s.startsWith('v1:') || CAJON.test(s) ? null : s
  }
  const n = (v: unknown): number | null => {
    const x = numeroDesdeTexto(v)
    return Number.isFinite(x) && x > 0 ? x : null
  }
  const candidato: Record<string, unknown> = {
    actividad: t(d.actividad),
    direccion: t(d.direccion),
    otrosDatosVia: t(d.otrosDatosVia),
    cp: t(d.cp),
    localidad: t(d.localidad),
    provincia: t(d.provincia),
    metrosCuadrados: n(d.metrosCuadrados),
    superficieTotal: n(d.superficieTotal),
    // La antigüedad de CIMA (año limpio) es lo único que hay de este dato: se enseña «de la póliza, sin confirmar».
    anioConstruccion: n(d.anioConstruccion) ?? n(d.anioConstruccionCima),
    zona: t(d.zona),
  }
  for (const k of Object.keys(candidato)) if (candidato[k] === null) delete candidato[k]
  for (let i = 0; i < CAMPOS_COMERCIO.length; i++) {
    const v = validarDatosComercioRiesgo(candidato)
    if (v.ok) break
    for (const e of v.errores) delete candidato[e.campo]
  }

  const capitales = (Array.isArray(d.capitales) ? d.capitales : []).flatMap((x): CapitalComercio[] => {
    if (!esObj(x) || bienLeido(x.bien) === 'OTROS') return []
    const fila = { bien: x.bien, importe: x.importe, modalidad: t(x.modalidad ?? x.modalidadValoracion), descripcion: t(x.descripcion) }
    const v = validarCapitalesComercio([fila])
    return v.ok && v.valor ? v.valor : []
  })
  const medidas = (Array.isArray(d.medidasProteccion) ? d.medidasProteccion : []).flatMap((x): MedidaComercio[] => {
    if (!esObj(x)) return []
    const v = validarMedidasComercio([{ medida: t(x.medida), valor: t(x.valor) }])
    return v.ok && v.valor ? v.valor : []
  })
  const final = validarDatosComercioRiesgo(candidato)
  const out: ValorEdicionComercio = final.ok ? { ...final.valor } : {}
  if (capitales.length > 0) out.capitales = capitales
  if (medidas.length > 0) out.medidasProteccion = medidas
  return out
}
