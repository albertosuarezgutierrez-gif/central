/**
 * Los datos de la VIVIENDA de un riesgo de hogar (30/09/2026), guardados en
 * `seguros.oportunidades.info_riesgo.datosVivienda` para verlos, editarlos y CONFIRMARLOS en la pantalla del
 * riesgo sin salir de ella. Nombres alineados con `DatosHogar` de asegura (`peticion-hogar.ts`): la pantalla de
 * pedir precio (`hogar-nuevo`) los precarga y lo que se use se anota de vuelta.
 *
 * 🚨 `null` = «no se sabe». Un `0` es un dato (p. ej. «joyas: 0 €» declarado).
 * `faltanDatosVivienda` = los obligatorios de `revisarDatosHogar` que son de la VIVIENDA (la persona se revisa
 * en su ficha). Con la referencia catastral, la pantalla de precio lee dirección, m² y año del Catastro, pero
 * aquí se siguen contando: «ante la duda, el estado conservador».
 */
import { aplicarEdicionBloque, leerBloque, validarParcial, vaciosDe, type CambioCampo, type ErrorCampo, type Espec } from './datos-riesgo-generico.ts'

/** Ramos donde el riesgo es una vivienda. */
export function admiteDatosVivienda(ramo: unknown): ramo is 'hogar' {
  return ramo === 'hogar'
}

export const ESPEC_VIVIENDA = [
  { clave: 'referenciaCatastral', etiqueta: 'Referencia catastral', tipo: { t: 'referencia' } },
  { clave: 'direccion', etiqueta: 'Dirección', tipo: { t: 'texto', max: 200 } },
  { clave: 'cp', etiqueta: 'Código postal', tipo: { t: 'cp' } },
  { clave: 'municipio', etiqueta: 'Municipio', tipo: { t: 'texto', max: 80 } },
  { clave: 'municipioId', etiqueta: 'Municipio (catálogo)', tipo: { t: 'entero', min: 1, max: 99_999_999 } },
  { clave: 'tipoViaId', etiqueta: 'Tipo de vía', tipo: { t: 'id' } },
  { clave: 'nombreVia', etiqueta: 'Nombre de la calle', tipo: { t: 'texto', max: 80 } },
  { clave: 'numeroVia', etiqueta: 'Número', tipo: { t: 'texto', max: 10 } },
  { clave: 'planta', etiqueta: 'Planta', tipo: { t: 'texto', max: 10 } },
  { clave: 'puertaVivienda', etiqueta: 'Puerta', tipo: { t: 'texto', max: 10 } },
  { clave: 'metrosCuadrados', etiqueta: 'Superficie (m²)', tipo: { t: 'numero', min: 0, max: 100_000, sobreMin: true } },
  { clave: 'anioConstruccion', etiqueta: 'Año de construcción', tipo: { t: 'entero', min: 1500, max: 'anioTope' } },
  { clave: 'habitaciones', etiqueta: 'Habitaciones', tipo: { t: 'entero', min: 1, max: 60 } },
  { clave: 'anioUltimaReforma', etiqueta: 'Año de la última reforma', tipo: { t: 'entero', min: 1500, max: 'anioTope' } },
  { clave: 'tipoVivienda', etiqueta: 'Tipo de vivienda', tipo: { t: 'id' } },
  { clave: 'uso', etiqueta: 'Régimen (propietario/inquilino)', tipo: { t: 'id' } },
  { clave: 'ocupacion', etiqueta: 'Uso (habitual/segunda residencia)', tipo: { t: 'id' } },
  { clave: 'ubicacion', etiqueta: 'Ubicación', tipo: { t: 'id' } },
  { clave: 'material', etiqueta: 'Materiales de construcción', tipo: { t: 'id' } },
  { clave: 'calidad', etiqueta: 'Calidad de la construcción', tipo: { t: 'id' } },
  { clave: 'alarma', etiqueta: 'Alarma', tipo: { t: 'id' } },
  { clave: 'puertasSecundarias', etiqueta: 'Puertas secundarias', tipo: { t: 'id' } },
  { clave: 'asentamiento', etiqueta: 'Valor de reposición (asentamiento)', tipo: { t: 'id' } },
  { clave: 'puertaPrincipalBlindada', etiqueta: 'Puerta principal blindada', tipo: { t: 'bool' } },
  { clave: 'ventanasSeguras', etiqueta: 'Ventanas seguras', tipo: { t: 'bool' } },
  { clave: 'urbanizacionCerrada', etiqueta: 'Urbanización cerrada', tipo: { t: 'bool' } },
  { clave: 'vigilante', etiqueta: 'Vigilante', tipo: { t: 'bool' } },
  { clave: 'capitalContinente', etiqueta: 'Capital de continente (€)', tipo: { t: 'numero', min: 0, max: 100_000_000 } },
  { clave: 'capitalContenido', etiqueta: 'Capital de contenido (€)', tipo: { t: 'numero', min: 0, max: 100_000_000 } },
  { clave: 'joyasEnCajaFuerte', etiqueta: 'Joyas en caja fuerte (€)', tipo: { t: 'numero', min: 0, max: 100_000 } },
  { clave: 'joyasFueraDeCaja', etiqueta: 'Joyas fuera de caja (€)', tipo: { t: 'numero', min: 0, max: 100_000 } },
  { clave: 'objetosDeValor', etiqueta: 'Objetos de valor (€)', tipo: { t: 'numero', min: 0, max: 100_000_000 } },
  { clave: 'perrosPeligrosos', etiqueta: 'Perros peligrosos', tipo: { t: 'entero', min: 0, max: 20 } },
] as const satisfies Espec

export type CampoVivienda =
  | 'referenciaCatastral' | 'direccion' | 'cp' | 'municipio' | 'municipioId' | 'tipoViaId' | 'nombreVia' | 'numeroVia'
  | 'planta' | 'puertaVivienda' | 'metrosCuadrados' | 'anioConstruccion' | 'habitaciones' | 'anioUltimaReforma'
  | 'tipoVivienda' | 'uso' | 'ocupacion' | 'ubicacion' | 'material' | 'calidad' | 'alarma' | 'puertasSecundarias'
  | 'asentamiento' | 'puertaPrincipalBlindada' | 'ventanasSeguras' | 'urbanizacionCerrada' | 'vigilante'
  | 'capitalContinente' | 'capitalContenido' | 'joyasEnCajaFuerte' | 'joyasFueraDeCaja' | 'objetosDeValor' | 'perrosPeligrosos'

export type DatosViviendaRiesgo = {
  [K in CampoVivienda]: K extends
    | 'referenciaCatastral' | 'direccion' | 'cp' | 'municipio' | 'tipoViaId' | 'nombreVia' | 'numeroVia' | 'planta'
    | 'puertaVivienda' | 'tipoVivienda' | 'uso' | 'ocupacion' | 'ubicacion' | 'material' | 'calidad' | 'alarma'
    | 'puertasSecundarias' | 'asentamiento'
    ? string | null
    : K extends 'puertaPrincipalBlindada' | 'ventanasSeguras' | 'urbanizacionCerrada' | 'vigilante'
      ? boolean | null
      : number | null
} & { confirmadoAt: string | null }

export const CAMPOS_VIVIENDA: readonly CampoVivienda[] = ESPEC_VIVIENDA.map((c) => c.clave)
export const ETIQUETA_CAMPO_VIVIENDA = Object.fromEntries(ESPEC_VIVIENDA.map((c) => [c.clave, c.etiqueta])) as Record<CampoVivienda, string>

/**
 * De campo nuestro al catálogo de Codeoscopic (`GET /home/<nombre>`) del que se surte su desplegable. Es el MISMO
 * mapa que `CAMPO_DE_CATALOGO` de asegura (`resumen-hogar.ts`) invertido: un test de asegura vigila que no se
 * desalineen. Los desplegables de la pantalla del riesgo usan estos nombres, no listas propias.
 */
export const CATALOGO_HOGAR_DE_CAMPO = {
  tipoVivienda: 'property-types',
  uso: 'uses',
  ocupacion: 'occupancy-types',
  ubicacion: 'locations',
  asentamiento: 'settlement-types',
  material: 'build-materials',
  calidad: 'build-qualities',
  puertasSecundarias: 'door-types',
  alarma: 'alarm-types',
} as const satisfies Partial<Record<CampoVivienda, string>>
export type CampoCatalogoVivienda = keyof typeof CATALOGO_HOGAR_DE_CAMPO

export function datosViviendaVacios(): DatosViviendaRiesgo {
  return vaciosDe(ESPEC_VIVIENDA) as DatosViviendaRiesgo
}

export function leerDatosVivienda(bruto: unknown): DatosViviendaRiesgo | null {
  return leerBloque(ESPEC_VIVIENDA, bruto) as DatosViviendaRiesgo | null
}

export type ValidacionVivienda =
  | { ok: true; valor: Partial<Omit<DatosViviendaRiesgo, 'confirmadoAt'>> }
  | { ok: false; errores: ErrorCampo[] }

/**
 * Valida una edición PARCIAL (solo las claves que vienen). Vacío/`null` = borrar ese dato. Año de reforma no
 * anterior al de construcción se comprueba en `incoherenciaVivienda` (cuenta lo ya guardado).
 */
export function validarDatosViviendaRiesgo(parcial: unknown, opciones: { hoy?: string } = {}): ValidacionVivienda {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_VIVIENDA, parcial, { hoy, nombreBloque: 'Los datos de la vivienda' })
  return v.ok ? { ok: true, valor: v.valor as Partial<Omit<DatosViviendaRiesgo, 'confirmadoAt'>> } : v
}

export function incoherenciaVivienda(d: DatosViviendaRiesgo): string | null {
  if (d.anioUltimaReforma !== null && d.anioConstruccion !== null && d.anioUltimaReforma < d.anioConstruccion) {
    return 'La reforma no puede ser anterior a la construcción.'
  }
  return null
}

/**
 * Lo que FALTA para pedir precio: los obligatorios de `revisarDatosHogar` que son de la vivienda. `null` (sin
 * ficha) = «falta todo». Capital: hace falta continente O contenido mayor que 0 (un inquilino asegura solo
 * contenido); si no hay ninguno, se marca `capitalContinente`. Joyas/objetos/perros son opcionales (`null` = 0
 * para el vendor).
 */
export function faltanDatosVivienda(datos: Partial<DatosViviendaRiesgo> | null | undefined): CampoVivienda[] {
  const d = datos ?? {}
  const f: CampoVivienda[] = []
  const txt = (k: CampoVivienda) => { if (!d[k]) f.push(k) }
  for (const k of ['cp', 'tipoViaId', 'nombreVia', 'numeroVia'] as const) txt(k)
  if (d.municipioId === null || d.municipioId === undefined) f.push('municipioId')
  for (const k of ['metrosCuadrados', 'anioConstruccion', 'habitaciones'] as const) {
    if (d[k] === null || d[k] === undefined) f.push(k)
  }
  for (const k of ['tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento'] as const) txt(k)
  for (const k of ['puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada'] as const) {
    if (typeof d[k] !== 'boolean') f.push(k)
  }
  if (!((d.capitalContinente ?? 0) > 0) && !((d.capitalContenido ?? 0) > 0)) f.push('capitalContinente')
  return f
}

export function textoFaltanVivienda(faltan: readonly CampoVivienda[] | null | undefined): string | null {
  if (faltan === null || faltan === undefined || faltan.length === 0) return null
  const etiqueta = (c: CampoVivienda) => (c === 'capitalContinente' ? 'capital de continente o de contenido' : ETIQUETA_CAMPO_VIVIENDA[c].toLowerCase())
  return `Falta para pedir precio: ${faltan.map(etiqueta).join(', ')}.`
}

export function aplicarEdicionVivienda(
  actual: DatosViviendaRiesgo | null,
  valor: Partial<Omit<DatosViviendaRiesgo, 'confirmadoAt'>>,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosViviendaRiesgo; cambios: CambioCampo[] } {
  const r = aplicarEdicionBloque(ESPEC_VIVIENDA, actual as Record<string, never> | null, valor as Record<string, never>, opciones)
  return { datos: r.datos as DatosViviendaRiesgo, cambios: r.cambios }
}

/** Sin nada que afirmar no hay nada que confirmar: un sello sobre una ficha vacía afirmaría lo que no se ha mirado. */
export function motivoNoConfirmableVivienda(d: DatosViviendaRiesgo): string | null {
  const alguno = CAMPOS_VIVIENDA.some((k) => d[k] !== null)
  return alguno ? null : 'No se puede confirmar una vivienda sin ningún dato.'
}

/**
 * Precarga desde `polizas.datos_especificos` cuando la oportunidad nace de una póliza (sin inventar: lo que no
 * hay, `null`; el cifrado (`v1:`) y los valores de cajón, también). La dirección de la póliza es texto libre.
 * NUNCA cuenta como confirmado.
 */
export function precargaViviendaDePoliza(datos: unknown): Partial<Omit<DatosViviendaRiesgo, 'confirmadoAt'>> {
  const d = typeof datos === 'object' && datos !== null && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {}
  const t = (k: string): string | null => {
    const v = d[k]
    const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : ''
    if (s === '' || s.startsWith('v1:') || /^(N\/A|NA|NULL|NONE|OTRO|OTROS|DESCONOCIDO|SIN DATOS?|NO INFORMADO|NO CONSTA|0|00000000|-+)$/i.test(s)) return null
    return s
  }
  const n = (k: string): number | null => {
    const v = d[k]
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v
    return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null
  }
  const candidato: Record<string, unknown> = {
    direccion: t('direccion'),
    municipio: t('localidad'),
    cp: t('cp'),
    metrosCuadrados: n('metrosCuadrados'),
    // `anioConstruccionCima` es el de la compañía (Antigüedad del EIAC): no se precarga como dato declarado.
    anioConstruccion: n('anioConstruccion'),
    referenciaCatastral: t('referenciaCatastral'),
  }
  for (const k of Object.keys(candidato)) if (candidato[k] === null) delete candidato[k]
  for (let i = 0; i < CAMPOS_VIVIENDA.length; i++) {
    const v = validarDatosViviendaRiesgo(candidato)
    if (v.ok) return v.valor
    for (const e of v.errores) delete candidato[e.campo]
  }
  return {}
}

/**
 * Lo que una cotización de hogar con `?oportunidad=` deja anotado en el riesgo (write-back). Lee el cuerpo de
 * `hogar-nuevo` (`referencia`, `resueltos`, `correcciones`) y, si viene, lo que dio el Catastro (m², año, CP).
 * SOLO claves con valor: un dato que la cotización no trae NUNCA borra el guardado. Un catálogo que la pantalla
 * marcó como SUPUESTO (`resueltos.supuestos[campo] === true`) no es un dato del cliente y no se anota. Lo que no
 * valida se descarta (mejor no anotarlo que anotarlo mal).
 */
export function datosViviendaDeCotizacion(
  cuerpo: unknown,
  catastro?: { metrosCuadrados?: number | null; anioConstruccion?: number | null; codigoPostal?: string | null } | null,
  opciones: { hoy?: string } = {},
): Partial<Omit<DatosViviendaRiesgo, 'confirmadoAt'>> {
  const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const c = obj(cuerpo)
  const res = obj(c.resueltos)
  const cor = obj(c.correcciones)
  const sup = obj(res.supuestos)
  const declarado = (campo: string, clave = campo) => (sup[clave] === true ? undefined : res[campo])
  const candidato: Record<string, unknown> = {
    referenciaCatastral: c.referencia,
    municipioId: res.municipioId,
    tipoViaId: declarado('tipoViaId', 'tipoVia'),
    tipoVivienda: declarado('tipoVivienda'),
    uso: declarado('uso'),
    ocupacion: declarado('ocupacion'),
    ubicacion: declarado('ubicacion'),
    material: declarado('material'),
    calidad: declarado('calidad'),
    alarma: declarado('alarma'),
    puertasSecundarias: declarado('puertasSecundarias'),
    asentamiento: declarado('asentamiento'),
    // Lo tecleado manda sobre el Catastro; el Catastro, sobre nada.
    metrosCuadrados: cor.metrosCuadrados ?? catastro?.metrosCuadrados,
    anioConstruccion: cor.anioConstruccion ?? catastro?.anioConstruccion,
    cp: cor.cp ?? catastro?.codigoPostal,
  }
  for (const k of ['nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'habitaciones', 'anioUltimaReforma', 'puertaPrincipalBlindada', 'ventanasSeguras',
    'urbanizacionCerrada', 'vigilante', 'capitalContinente', 'capitalContenido', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos'] as const) {
    candidato[k] = cor[k]
  }
  for (const k of Object.keys(candidato)) {
    const v = candidato[k]
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) delete candidato[k]
  }
  for (let i = 0; i < CAMPOS_VIVIENDA.length; i++) {
    const v = validarDatosViviendaRiesgo(candidato, opciones)
    if (v.ok) return v.valor
    for (const e of v.errores) delete candidato[e.campo]
  }
  return {}
}

/**
 * De lo que el riesgo sabe a lo que la pantalla de precio (`hogar-nuevo`) recibe ya puesto: los catálogos y los
 * ids van a `resueltos`; el resto, a `correcciones` por su nombre de `DatosHogar`. Lo del Catastro (m², año, CP,
 * dirección) solo se siembra si NO hay referencia catastral —con ella el Catastro es más fresco— o si el corredor
 * lo CONFIRMÓ. Solo claves con valor. Los booleanos sí/no y los euros a 0 son datos y se siembran.
 */
export function inicialesHogarDeRiesgo(
  d: DatosViviendaRiesgo | null,
): { resueltos: Record<string, unknown>; correcciones: Record<string, unknown> } {
  const resueltos: Record<string, unknown> = {}
  const correcciones: Record<string, unknown> = {}
  if (!d) return { resueltos, correcciones }
  const delCatastro = d.referenciaCatastral === null || d.confirmadoAt !== null
  const R = ['municipioId', 'tipoViaId', 'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento'] as const
  for (const k of R) if (d[k] !== null) resueltos[k] = d[k]
  const C = ['nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'habitaciones', 'anioUltimaReforma', 'puertaPrincipalBlindada', 'ventanasSeguras',
    'urbanizacionCerrada', 'vigilante', 'capitalContinente', 'capitalContenido', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos'] as const
  for (const k of C) if (d[k] !== null) correcciones[k] = d[k]
  if (delCatastro) {
    for (const k of ['metrosCuadrados', 'anioConstruccion', 'cp'] as const) if (d[k] !== null) correcciones[k] = d[k]
  }
  return { resueltos, correcciones }
}
