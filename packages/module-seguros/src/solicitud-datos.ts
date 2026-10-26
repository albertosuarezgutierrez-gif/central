/**
 * «Pídele los datos al cliente» (24/09/2026). Alberto: un cliente de la base le
 * escribe para un presupuesto de moto; él abre la oportunidad y le manda un
 * enlace para que rellene lo que falta (fecha del carné, matrícula, la moto…);
 * al completarlo le llega el aviso para tarificar.
 *
 * Aquí solo se decide QUÉ se pide y se valida lo que llega. Reglas del enlace
 * (decisión de Alberto: enlace directo, sin código):
 *   - La página NO enseña ningún dato del cliente: solo pide.
 *   - Lo que llega es «declarado por quien tenía el enlace»: sirve para
 *     presupuestar y se verifica al emitir. NO se escribe en la ficha.
 */
import { normalizarCp, normalizarDni, normalizarFechaNacimiento } from './cliente-edicion.ts'
import { RAMOS_OPORTUNIDAD, type RamoOportunidad } from './oportunidad-seguimiento.ts'
import { MAX_NUMERO_ASEGURADOS, edadesNormalizadas } from './datos-capital-riesgo.ts'

/**
 * 25/10/2026 (Alberto: «el lead web de CUALQUIER ramo, igual que coche/moto»): el enlace vale para
 * todo ramo de oportunidad. Qué se pide lo decide la definición DECLARATIVA por grupo de ramo
 * (`camposSolicitud`); auto y moto conservan exactamente lo de antes.
 * 🚨 La BD tiene un CHECK de `ramo` en `seguros.solicitud_datos` (SQL `2026-10-25_solicitud_datos_todos_ramos.sql`):
 * sin aplicarlo, solo auto/moto se pueden insertar (el resto falla con 23514 y se degrada a «sin enlace»).
 */
export const RAMOS_SOLICITUD = RAMOS_OPORTUNIDAD
export type RamoSolicitud = RamoOportunidad

export function ramoSolicitud(v: unknown): RamoSolicitud | null {
  return RAMOS_SOLICITUD.find((r) => r === v) ?? null
}

/** Cómo se agrupan los ramos para decidir qué se pide. */
export type GrupoSolicitud = 'vehiculo' | 'hogar' | 'personas' | 'mascota' | 'generico'

export function grupoSolicitud(ramo: RamoSolicitud): GrupoSolicitud {
  if (ramo === 'auto' || ramo === 'moto') return 'vehiculo'
  if (ramo === 'hogar') return 'hogar'
  if (ramo === 'vida' || ramo === 'salud' || ramo === 'decesos' || ramo === 'accidentes') return 'personas'
  if (ramo === 'mascotas') return 'mascota'
  return 'generico'
}

/**
 * Cómo se nombra el riesgo en los textos al cliente. `tuyo` = «tu coche»; `del` = «del coche» (para un tercero);
 * `seguro` = «seguro de coche». Sin datos del cliente.
 */
const NOMBRE_RAMO: Record<RamoSolicitud, { tuyo: string; del: string; seguro: string }> = {
  auto: { tuyo: 'tu coche', del: 'el coche', seguro: 'coche' },
  moto: { tuyo: 'tu moto', del: 'la moto', seguro: 'moto' },
  hogar: { tuyo: 'tu seguro de hogar', del: 'el seguro de hogar', seguro: 'hogar' },
  vida: { tuyo: 'tu seguro de vida', del: 'el seguro de vida', seguro: 'vida' },
  salud: { tuyo: 'tu seguro de salud', del: 'el seguro de salud', seguro: 'salud' },
  decesos: { tuyo: 'tu seguro de decesos', del: 'el seguro de decesos', seguro: 'decesos' },
  accidentes: { tuyo: 'tu seguro de accidentes', del: 'el seguro de accidentes', seguro: 'accidentes' },
  mascotas: { tuyo: 'el seguro de tu mascota', del: 'el seguro de la mascota', seguro: 'mascota' },
  responsabilidad_civil: { tuyo: 'tu seguro de responsabilidad civil', del: 'el seguro de responsabilidad civil', seguro: 'responsabilidad civil' },
  comercio: { tuyo: 'el seguro de tu negocio', del: 'el seguro del negocio', seguro: 'comercio' },
  comunidades: { tuyo: 'el seguro de tu comunidad', del: 'el seguro de la comunidad', seguro: 'comunidad' },
  empresas: { tuyo: 'el seguro de tu empresa', del: 'el seguro de la empresa', seguro: 'empresa' },
  rc_profesional: { tuyo: 'tu seguro de RC profesional', del: 'el seguro de RC profesional', seguro: 'RC profesional' },
  dyo: { tuyo: 'tu seguro de D&O', del: 'el seguro de D&O', seguro: 'D&O' },
  flotas: { tuyo: 'el seguro de tu flota', del: 'el seguro de la flota', seguro: 'flota' },
  transporte_mercancias: { tuyo: 'tu seguro de transporte de mercancías', del: 'el seguro de transporte de mercancías', seguro: 'transporte de mercancías' },
  ciberriesgos: { tuyo: 'tu seguro de ciberriesgos', del: 'el seguro de ciberriesgos', seguro: 'ciberriesgos' },
  decenal: { tuyo: 'tu seguro decenal', del: 'el seguro decenal', seguro: 'decenal' },
  embarcaciones: { tuyo: 'el seguro de tu embarcación', del: 'el seguro de la embarcación', seguro: 'embarcación' },
  impago_alquiler: { tuyo: 'tu seguro de impago de alquiler', del: 'el seguro de impago de alquiler', seguro: 'impago de alquiler' },
  viaje: { tuyo: 'tu seguro de viaje', del: 'el seguro de viaje', seguro: 'viaje' },
  caucion: { tuyo: 'tu seguro de caución', del: 'el seguro de caución', seguro: 'caución' },
  otros: { tuyo: 'tu seguro', del: 'el seguro', seguro: 'seguro' },
}

/** «coche», «moto», «hogar»… para títulos, tareas e historial (texto de la casa, no del cliente). */
export function nombreRamoSolicitud(ramo: RamoSolicitud): string {
  return NOMBRE_RAMO[ramo].seguro
}

/** Título de la página del enlace. */
export function tituloSolicitud(ramo: RamoSolicitud, tercero: boolean): string {
  if (tercero) return `Datos de la persona que figurará en ${grupoSolicitud(ramo) === 'vehiculo' ? 'el seguro de ' : ''}${NOMBRE_RAMO[ramo].del}`
  if (grupoSolicitud(ramo) === 'vehiculo') return `Datos para tu presupuesto de ${NOMBRE_RAMO[ramo].seguro}`
  return `Datos para el presupuesto de ${NOMBRE_RAMO[ramo].tuyo}`
}

/** Qué documentos tiene sentido subir en el enlace, para el texto de ayuda. */
export function ayudaDocumentosSolicitud(ramo: RamoSolicitud): string {
  if (grupoSolicitud(ramo) === 'vehiculo') return 'DNI, carné de conducir, permiso de circulación o ficha técnica (y tu póliza actual si la tienes).'
  return 'Tu DNI y, si ya tienes un seguro de esto, la póliza o el último recibo.'
}

/**
 * `vehiculo_catalogo` (26/10/2026, fase 2): el buscador marca → modelo → combustible → versión del catálogo GRATIS de
 * Codeoscopic (los mismos GET que la pantalla de precio). Es una AYUDA: lo que manda es marca y modelo en texto; si el
 * cliente encuentra su versión, viajan los ids (`SUBCLAVES_VEHICULO`) y asegura los comprueba contra el catálogo antes
 * de escribirlos. Nunca es obligatorio ni admite «No lo sé».
 */
export type TipoCampo = 'texto' | 'fecha' | 'opcion' | 'numero' | 'si_no' | 'texto_largo' | 'direccion' | 'vehiculo_catalogo'

export type CampoSolicitud = {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  obligatorio: boolean
  ayuda?: string
  opciones?: readonly { valor: string; etiqueta: string }[]
  /** Solo se enseña si el campo `si_no` indicado vale `true`. */
  siMarcado?: string
  /** Lo que ya consta en su ficha: el formulario lo trae relleno y el cliente lo puede corregir. */
  actual?: string
  /** Fecha: admite el futuro (vencimientos). Sin esto, una fecha futura no vale. */
  admiteFutura?: boolean
  /** Fecha: solo hoy o después (fecha de efecto deseada). */
  soloFutura?: boolean
  /** Número: tope (por defecto 1.000.000). */
  max?: number
  /**
   * Título del bloque al que pertenece (26/10/2026): el formulario pinta un encabezado cada vez que cambia. Solo
   * agrupa; no cambia la validación. Los enlaces guardados antes no lo traen (= sin encabezados).
   */
  seccion?: string
  /**
   * 26/10/2026 (menos abandono): `esencial` = lo mínimo para tarificar (vendor o compañía), va primero; `opcional` =
   * afina el precio, va después del aviso «Con esto ya podemos calcular tu precio…». Lo pone `camposSolicitud`
   * (por defecto: obligatorio → esencial).
   */
  nivel?: 'esencial' | 'opcional'
  /** Admite «No lo sé» (= `null`, «no se sabe»; nunca false ni 0). Nunca en identidad ni dirección. */
  admiteNoLoSe?: boolean
  /**
   * Hogar: depende de lo que el Catastro diga de la dirección (consulta en vivo del formulario).
   * `tarjeta` = «¿Es esta tu vivienda?»; `tipo_vivienda`, `metros`, `anio` = solo si el Catastro no lo da (o se corrige);
   * `ventanas` = solo en bajo o casa (o si no se sabe el tipo).
   */
  catastro?: 'tarjeta' | 'tipo_vivienda' | 'metros' | 'anio' | 'ventanas'
}

/**
 * Claves que NUNCA admiten «No lo sé» (26/10/2026, revisión del PR #5068): identidad, lo que la ley pide para
 * identificar y lo ESENCIAL que el vendor (`revisarDatos*` de asegura) o la compañía exigen para tarificar. Un «No lo
 * sé» ahí es un presupuesto que no se puede hacer: se contesta o no se envía. Manda sobre lo guardado en un enlace ya
 * enviado (`camposAlDia` → `conNiveles`), que pudo guardarse con `admiteNoLoSe: true`.
 */
export const SIN_NO_LO_SE: ReadonlySet<string> = new Set([
  // Identidad y riesgo genérico.
  'dni', 'fechaNacimiento', 'codigoPostal', 'descripcionRiesgo', 'confirmaCatastro',
  // Auto y moto (`revisarDatosAuto`/`revisarDatosMoto`: código de vehículo = marca + modelo, matriculación, carné, garaje).
  'matricula', 'marca', 'modelo', 'fechaMatriculacion', 'fechaCarnet', 'tipoCarnet', 'garaje',
  // Hogar (`revisarDatosHogar`: tipo, m², año, habitaciones, régimen, uso, alarma y los cuatro sí/no).
  'tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'habitaciones', 'regimen', 'usoVivienda', 'alarma',
  'propietarioEsTomador', 'urbanizacionCerrada', 'puertaPrincipalBlindada', 'ventanasSeguras', 'tramoContenido',
  // Personas y mascota: lo que la compañía pide para dar precio (cuántos, a qué se dedica; raza y PPP).
  'personasAsegurar', 'profesion', 'razaMascota', 'ppp', 'especieMascota',
  // El buscador del catálogo es una ayuda opcional: ni «No lo sé» ni obligatorio.
  'versionCatalogo',
])

/**
 * Claves que, si se piden, son OBLIGATORIAS para tarificar aunque un enlace ya enviado las guardara como opcionales
 * (la fecha de matriculación se pedía «si no la sabes, déjala en blanco»; el vendor la exige).
 */
const OBLIGATORIAS_TARIFICAR: Readonly<Record<string, { ayuda?: string }>> = {
  fechaMatriculacion: { ayuda: 'Está en el permiso de circulación (casilla B).' },
}

/** Clave reservada en las respuestas: los campos que el cliente marcó «No lo sé», separados por comas. */
export const CLAVE_NO_LO_SE = '_noLoSe'

/** Nivel y «No lo sé» por defecto, iguales en todos los ramos. `SIN_NO_LO_SE` manda sobre lo guardado. */
export function conNiveles(campos: readonly CampoSolicitud[]): CampoSolicitud[] {
  return campos.map((c) => {
    const forzada = Object.hasOwn(OBLIGATORIAS_TARIFICAR, c.clave) ? OBLIGATORIAS_TARIFICAR[c.clave] : null
    const base: CampoSolicitud = forzada && !c.obligatorio ? { ...c, obligatorio: true, nivel: 'esencial', ...(forzada.ayuda ? { ayuda: forzada.ayuda } : {}) } : c
    return {
      ...base,
      nivel: base.nivel ?? (base.obligatorio ? 'esencial' : 'opcional'),
      admiteNoLoSe: base.tipo === 'direccion' || base.tipo === 'vehiculo_catalogo' || SIN_NO_LO_SE.has(base.clave) ? false : (base.admiteNoLoSe ?? true),
    }
  })
}

const CATASTRO_TIPO_M2_ANIO = new Set(['tipo_vivienda', 'metros', 'anio'])
const TIPOS_SIN_REJAS = new Set(['piso', 'atico'])

/**
 * Hogar: los esenciales que dependen del Catastro (`catastro`) no son `obligatorio` (el servidor no ve la tarjeta), pero
 * tampoco admiten «No lo sé». ¿Hay que exigirlos en ESTA respuesta?
 *  - tipo, m² y año: sí, salvo que el cliente CONFIRMÓ la tarjeta del Catastro (entonces viajan con la confirmación; si
 *    aun así faltan, quedan `null` y salen «a preguntar» en `camposAPreguntar`).
 *  - rejas (`ventanas`): sí, salvo en un piso o ático (no se pregunta) o si confirmó sin tipo (el Catastro lo sabe).
 */
function exigidoPorCatastro(c: CampoSolicitud, entrada: Record<string, unknown>): boolean {
  if (!c.catastro || !SIN_NO_LO_SE.has(c.clave)) return false
  const confirmo = entrada.confirmaCatastro === true
  if (CATASTRO_TIPO_M2_ANIO.has(c.catastro)) return !confirmo
  if (c.catastro === 'ventanas') {
    const tipo = typeof entrada.tipoVivienda === 'string' && entrada.tipoVivienda !== '' ? entrada.tipoVivienda : null
    if (tipo !== null) return !TIPOS_SIN_REJAS.has(tipo)
    return !confirmo
  }
  return false
}

/**
 * CAPITALES POR TRAMOS (26/10/2026). Cada tramo se anota en `datosVivienda` por su TECHO (asegurar de menos es
 * infraseguro, regla proporcional del art. 30 LCS); el abierto por arriba y «que me lo calculen» → `null` (no se sabe:
 * lo calcula la correduría, p. ej. con `recommend-limits` de Codeoscopic). Nunca se inventa un número sin techo.
 */
export type TramoCapital = { valor: string; etiqueta: string; importe: number | null }
export const TRAMOS_CONTENIDO: readonly TramoCapital[] = [
  { valor: 'hasta_15000', etiqueta: 'Menos de 15.000€', importe: 15_000 },
  { valor: '15000_30000', etiqueta: 'Entre 15.000€ y 30.000€', importe: 30_000 },
  { valor: '30000_60000', etiqueta: 'Entre 30.000€ y 60.000€', importe: 60_000 },
  { valor: 'mas_60000', etiqueta: 'Más de 60.000€', importe: null },
  { valor: 'calcular', etiqueta: 'No lo sé: que me lo calculen', importe: null },
]
export const TRAMOS_CONTINENTE: readonly TramoCapital[] = [
  { valor: 'hasta_80000', etiqueta: 'Menos de 80.000€', importe: 80_000 },
  { valor: '80000_150000', etiqueta: 'Entre 80.000€ y 150.000€', importe: 150_000 },
  { valor: '150000_250000', etiqueta: 'Entre 150.000€ y 250.000€', importe: 250_000 },
  { valor: 'mas_250000', etiqueta: 'Más de 250.000€', importe: null },
  { valor: 'calcular', etiqueta: 'No lo sé: que me lo calculen', importe: null },
]
/** El importe que se anota por un tramo; `null` = sin techo o «que me lo calculen» (no se sabe). */
export function importeDeTramo(tramos: readonly TramoCapital[], valor: unknown): number | null {
  return tramos.find((t) => t.valor === valor)?.importe ?? null
}

/**
 * Un campo `direccion` se contesta con estas SUBCLAVES escalares (`<clave>Cp`, `<clave>Provincia`…): CP primero →
 * provincia → municipio (de la lista del CP) → calle (callejero del Catastro) → número, planta y puerta.
 * `ViaTipo`/`ViaNombre` = la calle OFICIAL elegida del callejero; ausentes = texto libre (queda «por validar»).
 */
export const SUBCLAVES_DIRECCION = ['Cp', 'Provincia', 'Municipio', 'Calle', 'Numero', 'Planta', 'Puerta', 'ViaTipo', 'ViaNombre'] as const
export type SubclaveDireccion = (typeof SUBCLAVES_DIRECCION)[number]
export function claveDireccion(clave: string, sub: SubclaveDireccion): string {
  return `${clave}${sub}`
}

/** Subclaves del buscador del catálogo de vehículos: los ids de la cascada y el texto de la versión elegida. */
export const SUBCLAVES_VEHICULO = ['MarcaId', 'ModeloId', 'MotorId', 'Codigo', 'Version'] as const
export type SubclaveVehiculo = (typeof SUBCLAVES_VEHICULO)[number]
export function claveVehiculo(clave: string, sub: SubclaveVehiculo): string {
  return `${clave}${sub}`
}

/** Las claves escalares con las que se contesta un campo compuesto (dirección, buscador del catálogo); `null` = simple. */
export function subclavesDeCampo(c: Pick<CampoSolicitud, 'clave' | 'tipo'>): string[] | null {
  if (c.tipo === 'direccion') return SUBCLAVES_DIRECCION.map((s) => claveDireccion(c.clave, s))
  if (c.tipo === 'vehiculo_catalogo') return SUBCLAVES_VEHICULO.map((s) => claveVehiculo(c.clave, s))
  return null
}

/** Lo que la ficha YA tiene: eso no se le vuelve a pedir. */
export type ConocidoFicha = {
  dni: boolean
  fechaNacimiento: boolean
  codigoPostal: boolean
  carnetMoto: boolean
  carnetCoche: boolean
}

/** Nada conocido: lo que se usa cuando el enlace no debe revelar qué tiene la ficha (lead web de una ficha que ya existía). */
export const NADA_CONOCIDO: ConocidoFicha = { dni: false, fechaNacimiento: false, codigoPostal: false, carnetMoto: false, carnetCoche: false }

export const CARNETS_MOTO_SOLICITUD = [
  { valor: 'A', etiqueta: 'A (sin límite de potencia)' },
  { valor: 'A2', etiqueta: 'A2' },
  { valor: 'A1', etiqueta: 'A1 (hasta 125 cc)' },
  { valor: 'AM', etiqueta: 'AM (ciclomotor)' },
  { valor: 'B', etiqueta: 'Solo el de coche (B), para motos de 125 cc' },
] as const

export const GARAJES_SOLICITUD = [
  { valor: 'garaje_privado', etiqueta: 'Garaje particular (solo para tu vehículo)' },
  { valor: 'garaje_comunitario', etiqueta: 'Garaje comunitario' },
  { valor: 'calle', etiqueta: 'En la calle' },
] as const

export const REGIMENES_HOGAR_SOLICITUD = [
  { valor: 'propietario', etiqueta: 'Propietario' },
  { valor: 'inquilino', etiqueta: 'Inquilino' },
] as const

export const USOS_HOGAR_SOLICITUD = [
  { valor: 'habitual', etiqueta: 'Vivienda habitual (vivo en ella)' },
  { valor: 'secundaria', etiqueta: 'Segunda residencia' },
  { valor: 'alquilada', etiqueta: 'La tengo alquilada a otros' },
] as const

/**
 * Tipo de vivienda (26/10/2026). Los cinco de Allianz Hogar y del contrato de datos (`contrato-datos.ts`: «piso,
 * ático, bajo, adosado o casa independiente»), con las claves canónicas del bot (`TIPOS_VIVIENDA` de
 * `@central/module-tarificacion`). `planta_baja` = bajo o piso con ventanas a menos de 3 m del suelo (así lo agrupa Allianz).
 */
export const TIPOS_VIVIENDA_SOLICITUD = [
  { valor: 'piso', etiqueta: 'Piso (planta intermedia)' },
  { valor: 'planta_baja', etiqueta: 'Bajo, o piso con ventanas a menos de 3 m del suelo' },
  { valor: 'atico', etiqueta: 'Ático' },
  { valor: 'adosada', etiqueta: 'Casa adosada o pareada' },
  { valor: 'independiente', etiqueta: 'Casa independiente' },
] as const

const CAMPOS_IDENTIDAD_SOLICITUD: readonly CampoSolicitud[] = [
  { clave: 'dni', etiqueta: 'DNI o NIE del conductor principal', tipo: 'texto', obligatorio: true },
  { clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha', obligatorio: true },
]

/** Identidad para lo que no es un vehículo: quien contrata (el tomador); una empresa o comunidad da su CIF. */
function camposIdentidadTomador(grupo: GrupoSolicitud): CampoSolicitud[] {
  return [
    { clave: 'dni', etiqueta: grupo === 'generico' ? 'DNI, NIE o CIF de quien contrata' : 'DNI o NIE de quien contrata', tipo: 'texto', obligatorio: true },
    {
      clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha',
      // Una empresa o una comunidad no nace: en los genéricos no se exige.
      obligatorio: grupo !== 'generico',
      ...(grupo === 'generico' ? { ayuda: 'Si contrata una empresa o una comunidad, déjala en blanco.' } : {}),
    },
  ]
}

/**
 * Los campos de un enlace ya creado + DNI y nacimiento si le faltan (los enlaces
 * anteriores al 24/09/2026 no los pedían cuando la ficha ya los tenía).
 */
export function conIdentidad(campos: readonly CampoSolicitud[]): CampoSolicitud[] {
  const faltan = CAMPOS_IDENTIDAD_SOLICITUD.filter((c) => !campos.some((x) => x.clave === c.clave))
  return [...faltan, ...campos]
}

const CAMPO_COMENTARIO: CampoSolicitud = { clave: 'comentario', etiqueta: '¿Algo más que debamos saber?', tipo: 'texto_largo', obligatorio: false }

/** Seguro actual del riesgo: si lo tiene, compañía y vencimiento (el vencimiento sí puede ser futuro). */
function camposSeguroActual(pregunta: string): CampoSolicitud[] {
  return [
    { clave: 'tieneSeguro', etiqueta: pregunta, tipo: 'si_no', obligatorio: true },
    { clave: 'companiaActual', etiqueta: 'Compañía actual', tipo: 'texto', obligatorio: false, siMarcado: 'tieneSeguro' },
    { clave: 'vencimientoActual', etiqueta: 'Fecha en que vence', tipo: 'fecha', obligatorio: false, siMarcado: 'tieneSeguro', admiteFutura: true },
  ]
}

const CAMPO_FECHA_EFECTO: CampoSolicitud = {
  clave: 'fechaEfecto', etiqueta: '¿Desde qué día quieres el seguro?', tipo: 'fecha', obligatorio: false, soloFutura: true,
  ayuda: 'Si no lo tienes claro, déjalo en blanco.',
}

/** Hipoteca → ¿el seguro lo pide el banco? + entidad. `null` = no contestado (nunca «no»). */
const CAMPOS_HIPOTECA: readonly CampoSolicitud[] = [
  { clave: 'hipoteca', etiqueta: '¿Tiene hipoteca?', tipo: 'si_no', obligatorio: true },
  {
    clave: 'paraBanco', etiqueta: '¿Necesitas el seguro para el banco (te piden un certificado)?', tipo: 'si_no', obligatorio: true, siMarcado: 'hipoteca',
    ayuda: 'Si el banco es beneficiario de la póliza, hay que ponerlo en ella.',
  },
  { clave: 'entidadHipoteca', etiqueta: 'Banco de la hipoteca', tipo: 'texto', obligatorio: false, siMarcado: 'hipoteca' },
]

function campoCp(conocido: ConocidoFicha, etiqueta: string): CampoSolicitud[] {
  return conocido.codigoPostal ? [] : [{ clave: 'codigoPostal', etiqueta, tipo: 'texto', obligatorio: true }]
}

/** Lo de antes, sin tocar: auto y moto. */
function camposVehiculo(ramo: 'auto' | 'moto', conocido: ConocidoFicha): CampoSolicitud[] {
  const moto = ramo === 'moto'
  const campos: CampoSolicitud[] = []
  // DNI y nacimiento se piden SIEMPRE (Alberto, 24/09/2026): si la ficha los tiene, llegan
  // rellenos (`actual`) para que el cliente los confirme o los corrija.
  campos.push(...CAMPOS_IDENTIDAD_SOLICITUD)
  campos.push(...campoCp(conocido, `Código postal donde duerme ${moto ? 'la moto' : 'el coche'}`))
  if (moto && !conocido.carnetMoto) {
    campos.push({ clave: 'tipoCarnet', etiqueta: 'Carné con el que la conduces', tipo: 'opcion', obligatorio: true, opciones: CARNETS_MOTO_SOLICITUD })
    campos.push({ clave: 'fechaCarnet', etiqueta: 'Fecha de expedición de ese carné', tipo: 'fecha', obligatorio: true, ayuda: 'Viene en el propio carné.' })
  }
  if (!moto && !conocido.carnetCoche) {
    campos.push({ clave: 'fechaCarnet', etiqueta: 'Fecha del carné de coche (B)', tipo: 'fecha', obligatorio: true, ayuda: 'Viene en el propio carné.' })
  }
  campos.push(
    { clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true },
    { clave: 'marca', etiqueta: 'Marca', tipo: 'texto', obligatorio: true },
    { clave: 'modelo', etiqueta: 'Modelo y versión', tipo: 'texto', obligatorio: true, ayuda: moto ? 'Por ejemplo: Yamaha MT-07 o Honda PCX 125.' : 'Por ejemplo: Seat León 1.5 TSI.' },
    // Ayuda del catálogo de Codeoscopic (gratis): el formulario la pinta junto a marca y modelo.
    { clave: 'versionCatalogo', etiqueta: 'Busca tu versión exacta', tipo: 'vehiculo_catalogo', obligatorio: false, nivel: 'opcional', admiteNoLoSe: false, ayuda: 'Si la encuentras, el precio sale más ajustado. Si no, con la marca y el modelo nos basta.' },
    { clave: 'fechaMatriculacion', etiqueta: 'Fecha de primera matriculación', tipo: 'fecha', obligatorio: true, ayuda: 'Está en el permiso de circulación (casilla B).' },
    { clave: 'garaje', etiqueta: '¿Dónde duerme?', tipo: 'opcion', obligatorio: true, opciones: GARAJES_SOLICITUD },
    { clave: 'kmAnuales', etiqueta: 'Kilómetros al año, aproximados', tipo: 'numero', obligatorio: false },
    { clave: 'tieneSeguro', etiqueta: '¿Está asegurada ahora?', tipo: 'si_no', obligatorio: true },
    { clave: 'companiaActual', etiqueta: 'Compañía actual', tipo: 'texto', obligatorio: false, siMarcado: 'tieneSeguro' },
    { clave: 'vencimientoActual', etiqueta: 'Fecha en que vence', tipo: 'fecha', obligatorio: false, siMarcado: 'tieneSeguro' },
    { clave: 'aniosSinSiniestros', etiqueta: 'Años sin partes con culpa', tipo: 'numero', obligatorio: false },
    CAMPO_COMENTARIO,
  )
  return campos
}

/**
 * HOGAR (25/10/2026; ampliado el 26/10/2026). Las preguntas salen del contrato de datos de hogar
 * (`contrato-datos.ts`, que cubre `revisarDatosHogar` de Codeoscopic y el bot de Allianz) y SOLO las que el cliente
 * sabe contestar: lo de catálogo que la correduría decide (asentamiento, calidad, materiales, puertas secundarias,
 * ubicación) no se pregunta, y m² y año los da el Catastro con la dirección. Cada respuesta tiene su campo en
 * `datosVivienda` (ver `DESTINOS_HOGAR` en `solicitud-destinos.ts`, con su cepo). Lo que no se contesta es `null`.
 */
function camposHogar(): CampoSolicitud[] {
  const en = (seccion: string, cs: readonly CampoSolicitud[]): CampoSolicitud[] => cs.map((c) => ({ ...c, seccion }))
  const ES = 'esencial' as const
  const OP = 'opcional' as const
  return [
    ...en('Quién contrata', camposIdentidadTomador('hogar')),
    ...en('La vivienda', [
      { clave: 'vivienda', etiqueta: 'Dirección de la vivienda', tipo: 'direccion', obligatorio: true, ayuda: 'Empieza por el código postal: la provincia y el municipio salen solos. Si es un bajo, pon 0 en la planta.' },
      // Lo que da el Catastro (tipo, m², año) no se pregunta: se ENSEÑA para que lo confirme. Solo si no responde o se corrige.
      { clave: 'confirmaCatastro', etiqueta: '¿Es esta tu vivienda?', tipo: 'si_no', obligatorio: false, nivel: ES, catastro: 'tarjeta', admiteNoLoSe: false },
      { clave: 'tipoVivienda', etiqueta: '¿Qué tipo de vivienda es?', tipo: 'opcion', obligatorio: false, nivel: ES, catastro: 'tipo_vivienda', opciones: TIPOS_VIVIENDA_SOLICITUD },
      { clave: 'metrosCuadrados', etiqueta: 'Metros cuadrados construidos, aproximados', tipo: 'numero', obligatorio: false, nivel: ES, catastro: 'metros', max: 100_000 },
      { clave: 'anioConstruccion', etiqueta: 'Año de construcción del edificio, aproximado', tipo: 'numero', obligatorio: false, nivel: ES, catastro: 'anio', max: 2100 },
      { clave: 'habitaciones', etiqueta: '¿Cuántas habitaciones tiene?', tipo: 'numero', obligatorio: true, max: 60, ayuda: 'Sin contar salón, cocina ni baños.' },
      { clave: 'regimen', etiqueta: '¿Eres propietario o inquilino?', tipo: 'opcion', obligatorio: true, opciones: REGIMENES_HOGAR_SOLICITUD },
      { clave: 'propietarioEsTomador', etiqueta: '¿La vivienda es de quien contrata el seguro?', tipo: 'si_no', obligatorio: true },
      { clave: 'usoVivienda', etiqueta: '¿Qué uso tiene la vivienda?', tipo: 'opcion', obligatorio: true, opciones: USOS_HOGAR_SOLICITUD },
      { clave: 'urbanizacionCerrada', etiqueta: '¿Está en una urbanización cerrada?', tipo: 'si_no', obligatorio: true },
    ]),
    ...en('Seguridad', [
      { clave: 'alarma', etiqueta: '¿Tiene alarma conectada?', tipo: 'si_no', obligatorio: true },
      { clave: 'puertaPrincipalBlindada', etiqueta: '¿La puerta de entrada es blindada o acorazada?', tipo: 'si_no', obligatorio: true },
      // Rejas: solo en un bajo o en una casa (en un piso alto no se pregunta), o si aún no se sabe el tipo.
      { clave: 'ventanasSeguras', etiqueta: '¿Las ventanas tienen rejas o cierres de seguridad?', tipo: 'si_no', obligatorio: false, nivel: ES, catastro: 'ventanas', ayuda: 'Las que se pueden alcanzar desde la calle, el patio o la terraza.' },
    ]),
    ...en('Lo que quieres asegurar', [
      { clave: 'tramoContenido', etiqueta: '¿Cuánto vale lo que hay dentro (muebles, electrodomésticos, ropa…)?', tipo: 'opcion', obligatorio: false, nivel: ES, opciones: TRAMOS_CONTENIDO, admiteNoLoSe: false },
      { clave: 'tramoContinente', etiqueta: 'Si eres el dueño: ¿cuánto costaría volver a construirla?', tipo: 'opcion', obligatorio: false, nivel: OP, opciones: TRAMOS_CONTINENTE, admiteNoLoSe: false, ayuda: 'No es el precio de venta: es lo que costaría levantarla de nuevo.' },
    ]),
    ...en('Hipoteca y seguro actual', [...CAMPOS_HIPOTECA, ...camposSeguroActual('¿La vivienda tiene seguro ahora?'), CAMPO_FECHA_EFECTO]),
    // Para afinar el precio (opcionales): aparecen después del aviso «Con esto ya podemos calcular tu precio».
    ...en('Para afinar el precio', [
      { clave: 'conMadera', etiqueta: '¿La estructura del edificio lleva madera?', tipo: 'si_no', obligatorio: false, ayuda: 'Vigas o forjados de madera.' },
      { clave: 'anioUltimaReforma', etiqueta: 'Si se ha reformado, ¿en qué año?', tipo: 'numero', obligatorio: false, max: 2100 },
      { clave: 'vigilante', etiqueta: '¿Hay vigilante de seguridad?', tipo: 'si_no', obligatorio: false },
      { clave: 'joyasEnCajaFuerte', etiqueta: 'Joyas guardadas en caja fuerte, en €', tipo: 'numero', obligatorio: false, max: 100_000, ayuda: 'Solo si quieres cubrirlas.' },
      { clave: 'joyasFueraDeCaja', etiqueta: 'Joyas fuera de caja fuerte, en €', tipo: 'numero', obligatorio: false, max: 100_000 },
      { clave: 'objetosDeValor', etiqueta: 'Otros objetos de valor (arte, colecciones…), en €', tipo: 'numero', obligatorio: false, max: 100_000_000 },
      { clave: 'perrosPeligrosos', etiqueta: '¿Cuántos perros de raza potencialmente peligrosa (PPP) viven en casa?', tipo: 'numero', obligatorio: false, max: 20 },
      CAMPO_COMENTARIO,
    ]),
  ]
}

function camposPersonas(ramo: RamoSolicitud, conocido: ConocidoFicha): CampoSolicitud[] {
  const c: CampoSolicitud[] = [...camposIdentidadTomador('personas'), ...campoCp(conocido, 'Tu código postal')]
  if (ramo === 'vida') {
    c.push(
      { clave: 'capitalDeseado', etiqueta: '¿Qué capital quieres asegurar? (€)', tipo: 'numero', obligatorio: false, max: 10_000_000, ayuda: 'Si no lo sabes, déjalo en blanco y lo vemos juntos.' },
      { clave: 'fumador', etiqueta: '¿Fumas?', tipo: 'si_no', obligatorio: true },
      ...CAMPOS_HIPOTECA,
      // Hipoteca vinculada (26/10/2026): el capital que queda por pagar es el que el banco pide cubrir.
      { clave: 'capitalPendienteHipoteca', etiqueta: '¿Cuánto queda por pagar de la hipoteca? (€)', tipo: 'numero', obligatorio: false, siMarcado: 'hipoteca', max: 10_000_000, ayuda: 'Aproximado: viene en el último recibo del banco.' },
    )
  } else if (ramo === 'accidentes') {
    c.push({ clave: 'profesion', etiqueta: '¿A qué te dedicas?', tipo: 'texto', obligatorio: true })
  } else {
    c.push(
      { clave: 'personasAsegurar', etiqueta: '¿Cuántas personas quieres asegurar?', tipo: 'numero', obligatorio: true, max: MAX_NUMERO_ASEGURADOS, ayuda: 'Contándote a ti si también te aseguras.' },
      { clave: 'edades', etiqueta: 'Edad de cada una', tipo: 'texto', obligatorio: false, ayuda: 'Por ejemplo: 45, 43, 12 y 9.' },
    )
  }
  c.push(...camposSeguroActual('¿Tienes ya un seguro de esto?'), CAMPO_FECHA_EFECTO, CAMPO_COMENTARIO)
  return c
}

function camposMascota(conocido: ConocidoFicha): CampoSolicitud[] {
  return [
    ...camposIdentidadTomador('mascota'),
    ...campoCp(conocido, 'Tu código postal'),
    { clave: 'especieMascota', etiqueta: '¿Qué animal es?', tipo: 'opcion', obligatorio: true, opciones: ESPECIES_MASCOTA_SOLICITUD },
    { clave: 'razaMascota', etiqueta: 'Raza (o «mestizo»)', tipo: 'texto', obligatorio: true },
    { clave: 'fechaNacimientoMascota', etiqueta: 'Fecha de nacimiento del animal, aproximada', tipo: 'fecha', obligatorio: false },
    { clave: 'ppp', etiqueta: '¿Es de raza potencialmente peligrosa (PPP)?', tipo: 'si_no', obligatorio: true },
    { clave: 'microchip', etiqueta: 'Número de microchip', tipo: 'texto', obligatorio: false },
    ...camposSeguroActual('¿Tiene seguro ahora?'),
    CAMPO_FECHA_EFECTO,
    CAMPO_COMENTARIO,
  ]
}

export const ESPECIES_MASCOTA_SOLICITUD = [
  { valor: 'perro', etiqueta: 'Perro' },
  { valor: 'gato', etiqueta: 'Gato' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const

/**
 * COMERCIO (26/10/2026, fase 2): la descripción es la ACTIVIDAD del negocio (`datosComercio.actividad`, la
 * `Actividad.DescripcionActividad` de CIMA), no un texto libre sin destino. Misma clave que antes (`descripcionRiesgo`)
 * para que los enlaces ya enviados sigan valiendo.
 */
function camposComercio(conocido: ConocidoFicha): CampoSolicitud[] {
  return [
    ...camposIdentidadTomador('generico'),
    ...campoCp(conocido, 'Código postal del negocio'),
    { clave: 'descripcionRiesgo', etiqueta: '¿A qué se dedica tu negocio?', tipo: 'texto', obligatorio: true, ayuda: 'Por ejemplo: bar de tapas, peluquería, tienda de ropa.' },
    ...camposSeguroActual('¿Tienes ya un seguro de esto?'),
    CAMPO_FECHA_EFECTO,
    CAMPO_COMENTARIO,
  ]
}

function camposGenerico(conocido: ConocidoFicha): CampoSolicitud[] {
  return [
    ...camposIdentidadTomador('generico'),
    ...campoCp(conocido, 'Código postal del riesgo (o el tuyo)'),
    { clave: 'descripcionRiesgo', etiqueta: '¿Qué quieres asegurar? Cuéntanoslo en pocas líneas', tipo: 'texto_largo', obligatorio: true },
    ...camposSeguroActual('¿Tienes ya un seguro de esto?'),
    CAMPO_FECHA_EFECTO,
    CAMPO_COMENTARIO,
  ]
}

/**
 * Qué se le pide al cliente para ese ramo, quitando lo que la ficha ya sabe (salvo DNI y nacimiento).
 * DECLARATIVO por grupo de ramo; auto y moto, igual que antes del 25/10/2026.
 */
export function camposSolicitud(ramo: RamoSolicitud, conocido: ConocidoFicha): CampoSolicitud[] {
  switch (grupoSolicitud(ramo)) {
    case 'vehiculo': return conNiveles(camposVehiculo(ramo as 'auto' | 'moto', conocido))
    case 'hogar': return conNiveles(camposHogar())
    case 'personas': return conNiveles(camposPersonas(ramo, conocido))
    case 'mascota': return conNiveles(camposMascota(conocido))
    default: return conNiveles(ramo === 'comercio' ? camposComercio(conocido) : camposGenerico(conocido))
  }
}

/**
 * Los campos de un enlace YA CREADO, puestos al día (26/10/2026). Los campos se GUARDAN al crear el enlace
 * (`solicitud_datos.campos`); sin esto, un enlace pendiente de antes no vería las preguntas nuevas. En hogar los campos no
 * dependen de la ficha, así que un enlace pendiente toma la lista vigente (más lo guardado que ya no exista, por si acaso).
 * En el resto de ramos solo se añaden nivel y «No lo sé» (lo que se pide depende de la ficha al crearlo). Se usa igual al
 * pintar y al validar: lo que se enseña es lo que se acepta.
 */
export function camposAlDia(ramo: RamoSolicitud, guardados: readonly CampoSolicitud[]): CampoSolicitud[] {
  if (grupoSolicitud(ramo) !== 'hogar') return conNiveles(guardados)
  const vigentes = camposSolicitud(ramo, NADA_CONOCIDO)
  const claves = new Set(vigentes.map((c) => c.clave))
  // `valorContenido` (número) lo sustituye `tramoContenido`: no se pide dos veces.
  const sobrantes = guardados.filter((c) => !claves.has(c.clave) && c.clave !== 'valorContenido')
  return [...vigentes, ...conNiveles(sobrantes)]
}

/**
 * Lo que queda «a preguntar» en la llamada (etiquetas, nunca valores): los campos visibles sin respuesta (opcionales
 * vacíos) y los marcados «No lo sé». Lo que cuelga de un «no» (`siMarcado`) no cuenta.
 */
export function camposAPreguntar(campos: readonly CampoSolicitud[], respuestas: Record<string, Respuesta>): { noLoSabe: string[]; sinContestar: string[] } {
  const noLoSe = new Set(String(respuestas[CLAVE_NO_LO_SE] ?? '').split(',').filter(Boolean))
  const noLoSabe: string[] = []
  const sinContestar: string[] = []
  for (const c of campos) {
    // El buscador del catálogo es una ayuda: la marca y el modelo en texto ya son la respuesta.
    if (c.tipo === 'direccion' || c.tipo === 'vehiculo_catalogo' || c.catastro === 'tarjeta') continue
    if (c.siMarcado && respuestas[c.siMarcado] !== true) continue
    // Rejas: en un piso o ático no se preguntan (tampoco a la llamada).
    if (c.catastro === 'ventanas' && typeof respuestas.tipoVivienda === 'string' && TIPOS_SIN_REJAS.has(respuestas.tipoVivienda)) continue
    const v = respuestas[c.clave]
    if (noLoSe.has(c.clave)) noLoSabe.push(c.etiqueta)
    // Lo del Catastro (tipo, m², año, rejas) que quedó a `null` también: el Catastro no lo dio o no se pudo confirmar.
    else if (v === null || v === undefined) sinContestar.push(c.etiqueta)
  }
  return { noLoSabe, sinContestar }
}

export type Respuesta = string | number | boolean | null
export type ValidacionSolicitud =
  /** `respuestas[CLAVE_NO_LO_SE]` = los marcados «No lo sé» (comas), solo si hay alguno. */
  | { ok: true; respuestas: Record<string, Respuesta> }
  | { ok: false; errores: Record<string, string> }

function fechaIso(v: string): string | null {
  const s = v.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const esp = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  let a: number, m: number, d: number
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (esp) [d, m, a] = [Number(esp[1]), Number(esp[2]), Number(esp[3])]
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function textoCorto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s === '' ? null : s.slice(0, max)
}

/**
 * Una dirección (25/10/2026): CP válido, provincia y municipio presentes, calle y número. Planta y puerta, opcionales.
 * La calle oficial del callejero (`ViaTipo`/`ViaNombre`) solo se guarda si viene entera; si no, `null` = «por validar».
 * Un campo vacío es `null` (nunca '' ni 0).
 */
/** Qué dice la tabla oficial de un CP. `null` en un campo = la tabla no lo sabe (no se puede contrastar: se acepta). */
export type ZonaCp = { provincias: string[] | null; municipios: string[] | null }

/** La calle OFICIAL que el SERVIDOR ha comprobado contra el callejero para ese campo; `null` = sin validar. */
export type ViaValidada = { tipo: string; nombre: string } | null

export type OpcionesValidacion = {
  /** Tabla CP → provincia(s)/municipios (en el servidor, `@central/core-direccion`). Sin ella no se contrasta. */
  zonaCp?: (cp: string) => ZonaCp
  /** Calle validada por el servidor contra el callejero, por clave del campo `direccion`. Sin ella, ninguna es oficial. */
  viaValidada?: (clave: string) => ViaValidada
}

const plano = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** ¿Provincia y municipio casan con lo que dice la tabla del CP? Lo que la tabla no sabe no se contrasta. */
export function casaZonaCp(provincia: string, municipio: string, zona: ZonaCp): { provincia: boolean; municipio: boolean } {
  const igual = (a: string, b: string) => {
    const pa = plano(a), pb = plano(b)
    // «Alicante/Alacant»: vale cualquiera de las dos grafías.
    return pa === pb || pb.split('/').map((x) => x.trim()).includes(pa)
  }
  return {
    provincia: !zona.provincias || zona.provincias.length === 0 || zona.provincias.some((p) => igual(provincia, p)),
    municipio: !zona.municipios || zona.municipios.length === 0 || zona.municipios.some((m) => igual(municipio, m)),
  }
}

function validarDireccion(c: CampoSolicitud, entrada: Record<string, unknown>, opciones: OpcionesValidacion): { respuestas: Record<string, Respuesta>; errores: Record<string, string> } {
  const k = (sub: SubclaveDireccion) => claveDireccion(c.clave, sub)
  const respuestas: Record<string, Respuesta> = {}
  const errores: Record<string, string> = {}
  const cpBruto = textoCorto(entrada[k('Cp')], 5)
  if (cpBruto === null) {
    respuestas[k('Cp')] = null
    if (c.obligatorio) errores[k('Cp')] = 'Falta el código postal.'
  } else {
    const r = normalizarCp(cpBruto)
    if (r.ok) respuestas[k('Cp')] = r.valor
    else errores[k('Cp')] = r.motivo
  }
  const req: [SubclaveDireccion, number, string][] = [
    ['Provincia', 60, 'Falta la provincia.'],
    ['Municipio', 80, 'Elige el municipio.'],
    ['Calle', 120, 'Falta la calle.'],
    ['Numero', 10, 'Falta el número.'],
  ]
  for (const [sub, max, motivo] of req) {
    const t = textoCorto(entrada[k(sub)], max)
    respuestas[k(sub)] = t
    if (t === null && c.obligatorio) errores[k(sub)] = motivo
  }
  respuestas[k('Planta')] = textoCorto(entrada[k('Planta')], 10)
  respuestas[k('Puerta')] = textoCorto(entrada[k('Puerta')], 10)
  // Provincia y municipio tienen que ser los del CP (el navegador los rellena, pero lo que llega lo manda cualquiera).
  const cp = respuestas[k('Cp')]
  const prov = respuestas[k('Provincia')]
  const mun = respuestas[k('Municipio')]
  if (opciones.zonaCp && typeof cp === 'string' && typeof prov === 'string' && typeof mun === 'string') {
    const casa = casaZonaCp(prov, mun, opciones.zonaCp(cp))
    if (!casa.provincia) errores[k('Provincia')] = 'La provincia no es la de ese código postal.'
    if (!casa.municipio) errores[k('Municipio')] = 'Ese municipio no es de ese código postal.'
  }
  // La calle OFICIAL solo si la ha validado el SERVIDOR contra el callejero; lo que mande el cliente no la hace oficial.
  // Sin validar: `null` = «por validar» (la calle escrita queda en `Calle`).
  const viaTipo = textoCorto(entrada[k('ViaTipo')], 10)
  const viaNombre = textoCorto(entrada[k('ViaNombre')], 80)
  const valida = opciones.viaValidada?.(c.clave) ?? null
  const coincide = valida !== null && viaTipo !== null && viaNombre !== null
    && plano(valida.tipo) === plano(viaTipo) && plano(valida.nombre) === plano(viaNombre)
  respuestas[k('ViaTipo')] = coincide ? plano(valida.tipo) : null
  respuestas[k('ViaNombre')] = coincide ? plano(valida.nombre) : null
  return { respuestas, errores }
}

const RE_ID_CATALOGO = /^(?!.*\.\.)[\p{L}\p{N}._ /()+-]{1,40}$/u

/**
 * El buscador del catálogo: la cadena ENTERA (marca, modelo, combustible y versión) o nada. Ids con forma de id; la versión
 * en texto, recortada. Que sean ids REALES del catálogo lo comprueba asegura al escribir el riesgo (GET gratis).
 */
function validarVehiculoCatalogo(clave: string, entrada: Record<string, unknown>): Record<string, Respuesta> {
  const k = (sub: SubclaveVehiculo) => claveVehiculo(clave, sub)
  const id = (sub: SubclaveVehiculo): string | null => {
    const v = entrada[k(sub)]
    return typeof v === 'string' && RE_ID_CATALOGO.test(v.trim()) ? v.trim() : null
  }
  const ids = { MarcaId: id('MarcaId'), ModeloId: id('ModeloId'), MotorId: id('MotorId'), Codigo: id('Codigo') }
  const entera = Object.values(ids).every((x) => x !== null)
  const out: Record<string, Respuesta> = {}
  for (const sub of SUBCLAVES_VEHICULO) out[k(sub)] = null
  if (!entera) return out
  for (const [sub, v] of Object.entries(ids)) out[k(sub as SubclaveVehiculo)] = v
  out[k('Version')] = textoCorto(entrada[k('Version')], 120)
  return out
}

/**
 * Valida lo que manda el cliente contra los campos que se le pidieron. Solo se
 * guardan las claves pedidas (lo demás se ignora) y cada error viene por campo.
 */
export function validarRespuestas(
  campos: readonly CampoSolicitud[],
  entrada: Record<string, unknown>,
  hoy: Date = new Date(),
  opciones: OpcionesValidacion = {},
): ValidacionSolicitud {
  const errores: Record<string, string> = {}
  const respuestas: Record<string, Respuesta> = {}
  const hoyIso = hoy.toISOString().slice(0, 10)
  // «No lo sé» (26/10/2026): llega como lista en `_noLoSe`; solo vale en campos que lo admiten. Es `null`, nunca false ni 0.
  const pedidos = Array.isArray(entrada[CLAVE_NO_LO_SE]) ? (entrada[CLAVE_NO_LO_SE] as unknown[]).filter((x): x is string => typeof x === 'string') : []
  // Un esencial para tarificar (`SIN_NO_LO_SE`) nunca, aunque el campo que llega diga otra cosa.
  const noLoSe = campos.filter((c) => c.admiteNoLoSe === true && !SIN_NO_LO_SE.has(c.clave) && c.tipo !== 'direccion' && pedidos.includes(c.clave) && !(c.siMarcado && entrada[c.siMarcado] !== true)).map((c) => c.clave)
  for (const c of campos) {
    if (noLoSe.includes(c.clave)) { respuestas[c.clave] = null; continue }
    if (c.tipo === 'direccion') {
      // Escalares por subclave; `siMarcado` no aplica a una dirección.
      const d = validarDireccion(c, entrada, opciones)
      Object.assign(respuestas, d.respuestas)
      Object.assign(errores, d.errores)
      continue
    }
    if (c.tipo === 'vehiculo_catalogo') {
      // Ayuda: lo que no encaja se descarta sin error (la marca y el modelo en texto siguen valiendo).
      Object.assign(respuestas, validarVehiculoCatalogo(c.clave, entrada))
      continue
    }
    if (c.siMarcado && entrada[c.siMarcado] !== true) { respuestas[c.clave] = null; continue }
    const v = entrada[c.clave]
    const vacio = v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
    if (vacio) {
      if (c.obligatorio || exigidoPorCatastro(c, entrada)) errores[c.clave] = 'Falta este dato.'
      else respuestas[c.clave] = null
      continue
    }
    switch (c.tipo) {
      case 'si_no':
        if (typeof v !== 'boolean') errores[c.clave] = 'Elige sí o no.'
        else respuestas[c.clave] = v
        break
      case 'numero': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(n) || n < 0 || n > (c.max ?? 1_000_000)) errores[c.clave] = 'Pon un número.'
        else respuestas[c.clave] = Math.round(n)
        break
      }
      case 'opcion':
        if (typeof v !== 'string' || !c.opciones?.some((o) => o.valor === v)) errores[c.clave] = 'Elige una opción.'
        else respuestas[c.clave] = v
        break
      case 'fecha': {
        if (c.clave === 'fechaNacimiento') {
          const r = normalizarFechaNacimiento(v, hoy)
          if (r.ok) respuestas[c.clave] = r.valor
          else errores[c.clave] = r.motivo
          break
        }
        const f = typeof v === 'string' ? fechaIso(v) : null
        if (!f) errores[c.clave] = 'Fecha no válida: usa DD/MM/AAAA.'
        else if (c.soloFutura && f < hoyIso) errores[c.clave] = 'Tiene que ser hoy o una fecha futura.'
        else if (!c.soloFutura && !c.admiteFutura && c.clave !== 'vencimientoActual' && f > hoyIso) errores[c.clave] = 'No puede ser una fecha futura.'
        else if (f < '1940-01-01') errores[c.clave] = 'Esa fecha es demasiado antigua.'
        else respuestas[c.clave] = f
        break
      }
      default: {
        if (typeof v !== 'string') { errores[c.clave] = 'Dato no válido.'; break }
        const s = v.replace(/\s+/g, ' ').trim()
        const max = c.tipo === 'texto_largo' ? 1000 : 120
        if (c.clave === 'dni') {
          const r = normalizarDni(s)
          if (r.ok) respuestas[c.clave] = r.valor.valor
          else errores[c.clave] = r.motivo
        } else if (c.clave === 'codigoPostal') {
          const r = normalizarCp(s)
          if (r.ok) respuestas[c.clave] = r.valor
          else errores[c.clave] = r.motivo
        } else if (c.clave === 'edades') {
          const e = edadesNormalizadas(s)
          if (e === null) errores[c.clave] = 'Pon al menos una edad en número (por ejemplo: 45, 43, 12).'
          else respuestas[c.clave] = e
        } else if (c.clave === 'matricula') {
          const m = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
          if (m.length < 4 || m.length > 10 || !/\d/.test(m) || !/[A-Z]/.test(m)) errores[c.clave] = 'Revisa la matrícula.'
          else respuestas[c.clave] = m
        } else if (s.length > max) {
          errores[c.clave] = `Máximo ${max} caracteres.`
        } else {
          respuestas[c.clave] = s
        }
      }
    }
  }
  if (noLoSe.length > 0) respuestas[CLAVE_NO_LO_SE] = noLoSe.join(',')
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, respuestas }
}

/** Días que vive un enlace sin completar. */
export const DIAS_SOLICITUD = 14

/** Texto listo para pegar en WhatsApp o en un correo. Sin datos del cliente: solo el enlace. */
export function mensajeSolicitud(ramo: RamoSolicitud, url: string, tercero = false): string {
  if (tercero) {
    // Datos de OTRA persona (un familiar que figurará en el seguro). No se nombra a nadie: el
    // mensaje se reenvía y puede acabar en cualquier buzón.
    return `Hola, soy Alberto de Grupo ASegura. Para el presupuesto de ${NOMBRE_RAMO[ramo].del} necesito los datos de la persona que figurará en el seguro; son dos minutos: ${url}`
  }
  return `Hola, soy Alberto de Grupo ASegura. Para prepararte el presupuesto de ${NOMBRE_RAMO[ramo].tuyo} necesito unos datos; te lleva dos minutos: ${url}`
}

// ─── Documentos que sube el cliente por el enlace (24/09/2026) ───────────────
// Alberto: «que pueda subir el DNI, el carné, la documentación de la moto; se
// archiva y la IA rellena el formulario y verifica que los datos están bien».
// La IA LEE; lo que decide qué es un dato válido es este código (las mismas
// reglas que el formulario), y lo que se guarda en la ficha es el FICHERO, no
// lo leído: lo leído solo propone valores al cliente y sirve de contraste.

export const TIPOS_DOC_SOLICITUD = ['dni', 'carnet', 'permiso_circulacion', 'ficha_tecnica', 'poliza', 'otro'] as const
export type TipoDocSolicitud = (typeof TIPOS_DOC_SOLICITUD)[number]

/** Máximo de documentos por enlace: de sobra para DNI, carné y los dos papeles del vehículo. */
export const MAX_DOCS_SOLICITUD = 6

export function etiquetaDocSolicitud(t: TipoDocSolicitud): string {
  switch (t) {
    case 'dni': return 'DNI / NIE'
    case 'carnet': return 'Carné de conducir'
    case 'permiso_circulacion': return 'Permiso de circulación'
    case 'ficha_tecnica': return 'Ficha técnica'
    case 'poliza': return 'Póliza o recibo del seguro actual'
    default: return 'Otro documento'
  }
}

/** Tipo con el que se ARCHIVA en `seguros.documentos` (esa lista no tiene carné). */
export function tipoArchivoDocSolicitud(t: TipoDocSolicitud): 'dni' | 'permiso_circulacion' | 'ficha_tecnica' | 'poliza' | 'otro' {
  return t === 'carnet' ? 'otro' : t
}

const ORDEN_CARNET_MOTO = ['A', 'A2', 'A1', 'AM'] as const

/** Papeles que identifican a quien conduce; los demás no aportan DNI ni fecha de nacimiento. */
const TIPOS_DOC_PERSONA = ['dni', 'carnet'] as const
/** Campos de la persona: solo se contrastan contra sus papeles o contra su ficha. */
const CAMPOS_PERSONA = new Set(['dni', 'fechaNacimiento'])

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Lo que devolvió la IA → valores para los campos QUE SE PIDIERON, cada uno
 * pasado por la misma validación que el formulario. Lo que no valida se tira:
 * un valor dudoso propuesto al cliente se lo acaba aceptando sin mirar.
 */
export function normalizarLecturaSolicitud(
  bruto: unknown,
  ramo: RamoSolicitud,
  campos: readonly CampoSolicitud[],
  hoy: Date = new Date(),
): { tipo: TipoDocSolicitud; valores: Record<string, Respuesta> } {
  const o = bruto !== null && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {}
  const tipo = (TIPOS_DOC_SOLICITUD as readonly string[]).includes(String(o.tipo)) ? (o.tipo as TipoDocSolicitud) : 'otro'
  // DNI y nacimiento solo de papeles DE LA PERSONA: en la póliza o en el permiso
  // de circulación sale el tomador o el titular, que no tiene por qué ser quien
  // conduce (el padre paga, el hijo conduce).
  const dePersona = (TIPOS_DOC_PERSONA as readonly string[]).includes(tipo)
  const candidato: Record<string, unknown> = {
    dni: dePersona ? texto(o.dni) : null,
    fechaNacimiento: dePersona ? texto(o.fechaNacimiento) : null,
    matricula: texto(o.matricula),
    marca: texto(o.marca),
    modelo: texto(o.modelo),
    fechaMatriculacion: texto(o.fechaMatriculacion),
    companiaActual: texto(o.companiaActual),
    vencimientoActual: texto(o.vencimientoActual),
  }
  if (candidato.companiaActual || candidato.vencimientoActual) candidato.tieneSeguro = true
  // Carné: en moto, la clase de moto más alta que tenga fecha; en coche, la B.
  const carnets = Array.isArray(o.carnets) ? o.carnets : []
  const conFecha = carnets
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ clase: texto(c.clase)?.toUpperCase() ?? '', fecha: texto(c.fecha) }))
    .filter((c) => c.fecha !== null)
  if (ramo === 'moto') {
    const c = ORDEN_CARNET_MOTO.map((k) => conFecha.find((x) => x.clase === k)).find(Boolean)
    if (c) { candidato.tipoCarnet = c.clase; candidato.fechaCarnet = c.fecha }
  } else {
    const b = conFecha.find((x) => x.clase === 'B')
    if (b) candidato.fechaCarnet = b.fecha
  }

  const valores: Record<string, Respuesta> = {}
  for (const c of campos) {
    const v = candidato[c.clave]
    if (v === null || v === undefined) continue
    const r = validarRespuestas([{ ...c, obligatorio: true, siMarcado: undefined }], { [c.clave]: v }, hoy)
    if (r.ok && r.respuestas[c.clave] !== null && r.respuestas[c.clave] !== undefined) valores[c.clave] = r.respuestas[c.clave]
  }
  return { tipo, valores }
}

/** Campos en los que un papel manda: si lo declarado no coincide, se avisa a Alberto. */
const CONTRASTABLES = ['dni', 'fechaNacimiento', 'tipoCarnet', 'fechaCarnet', 'matricula', 'fechaMatriculacion'] as const

/** `ficha` = lo que constaba en su ficha al contestar (va la última: un papel manda más). */
export type LecturaDocSolicitud = { documentoId: string; tipo: TipoDocSolicitud | 'ficha'; valores: Record<string, Respuesta> }
export type DiscrepanciaSolicitud = { clave: string; declarado: Respuesta; documento: Respuesta; tipoDocumento: TipoDocSolicitud | 'ficha' }

const canon = (v: Respuesta): string => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Lo que el cliente mandó contra lo que dicen sus propios papeles. Solo avisa
 * (no bloquea): el papel puede estar mal leído y el cliente puede tener razón.
 */
export function contrastarConDocumentos(
  respuestas: Record<string, Respuesta>,
  lecturas: readonly LecturaDocSolicitud[],
): DiscrepanciaSolicitud[] {
  const out: DiscrepanciaSolicitud[] = []
  for (const clave of CONTRASTABLES) {
    const declarado = respuestas[clave]
    if (declarado === null || declarado === undefined || declarado === '') continue
    const l = lecturas.find((x) =>
      x.valores[clave] !== undefined && x.valores[clave] !== null
      // Lecturas guardadas antes de este filtro: una póliza podía traer el DNI del tomador.
      && (!CAMPOS_PERSONA.has(clave) || x.tipo === 'ficha' || (TIPOS_DOC_PERSONA as readonly string[]).includes(x.tipo)))
    if (!l) continue
    if (canon(l.valores[clave]) !== canon(declarado)) out.push({ clave, declarado, documento: l.valores[clave], tipoDocumento: l.tipo })
  }
  return out
}
