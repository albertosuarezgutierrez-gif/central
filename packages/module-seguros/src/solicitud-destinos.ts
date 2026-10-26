/**
 * Dónde acaba cada respuesta del enlace de datos (26/10/2026). PURO.
 *
 * Alberto: «los campos del formulario, la ficha del cliente, lo que trae CIMA y lo que pide Codeoscopic tienen que
 * coincidir». Cada campo de `camposSolicitud(ramo)` declara aquí su DESTINO:
 *   - `riesgo`: un campo del bloque de `info_riesgo` de ese ramo (`claveDatosDeRamo`: datosVehiculo, datosVivienda,
 *     datosCapital, datosComercio o datosRiesgoLibre), con el MISMO nombre que usan la precarga de CIMA y la
 *     petición de Codeoscopic;
 *   - `ficha`: una columna de `clientes` (o su tabla de carnés), las mismas que mira `camposParaPersona` en auto/moto;
 *   - `solo_solicitud`: HUECO declarado — el modelo no tiene dónde guardarlo y se queda en las respuestas de la
 *     solicitud («Datos pedidos») y en el aviso. Es una decisión escrita, no un olvido: el cepo
 *     (`solicitud-destinos.test.ts`) falla con un campo sin declarar o con un destino que el bloque no tiene, y
 *     prohíbe que una pregunta NUEVA de hogar caiga aquí.
 *
 * Las opciones de hogar que van a un CATÁLOGO de Codeoscopic (régimen, uso, tipo de vivienda, alarma) se traducen
 * SOLO a ids atestiguados en el repo (`IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS`: los de `DEFECTOS_HOGAR` y
 * `ETIQUETAS_ID_HOGAR`). Un valor sin id atestiguado NO se escribe en `datosVivienda` (queda `null` = «no se sabe»
 * para el cotizador) y se ve en el aviso: nunca se adivina un id.
 */
import { CAMPOS_CAPITAL } from './datos-capital-riesgo.ts'
import { CAMPOS_COMERCIO } from './datos-comercio-riesgo.ts'
import { CAMPOS_LIBRE } from './datos-riesgo-libre.ts'
import { claveDatosDeRamo, type ClaveDatosRiesgo } from './datos-riesgo-ramo.ts'
import { CAMPOS_VEHICULO } from './datos-vehiculo-riesgo.ts'
import { CAMPOS_VIVIENDA } from './datos-vivienda-riesgo.ts'
import { grupoSolicitud, type RamoSolicitud } from './solicitud-datos.ts'

/** Columnas de la ficha (`seguros.clientes`) y su tabla de carnés que el enlace rellena o contrasta. */
export type ColumnaFichaSolicitud = 'dni' | 'fecha_nacimiento' | 'codigo_postal' | 'cliente_carnets_conducir'

export type DestinoCampoSolicitud =
  | { en: 'riesgo'; campo: string }
  | { en: 'ficha'; columna: ColumnaFichaSolicitud }
  | { en: 'solo_solicitud'; motivo: string }

/** Los campos que tiene cada bloque de `info_riesgo`. */
export function camposDelBloque(clave: ClaveDatosRiesgo): readonly string[] {
  switch (clave) {
    case 'datosVehiculo': return CAMPOS_VEHICULO
    case 'datosVivienda': return CAMPOS_VIVIENDA
    case 'datosCapital': return CAMPOS_CAPITAL
    case 'datosComercio': return CAMPOS_COMERCIO
    case 'datosRiesgoLibre': return CAMPOS_LIBRE
  }
}

const R = (campo: string): DestinoCampoSolicitud => ({ en: 'riesgo', campo })
const F = (columna: ColumnaFichaSolicitud): DestinoCampoSolicitud => ({ en: 'ficha', columna })
const HUECO = (motivo: string): DestinoCampoSolicitud => ({ en: 'solo_solicitud', motivo })

const SEGURO_ACTUAL = HUECO('seguro actual: el bloque del riesgo no tiene compañía ni vencimiento anteriores')
const COMUNES: Readonly<Record<string, DestinoCampoSolicitud>> = {
  dni: F('dni'),
  fechaNacimiento: F('fecha_nacimiento'),
  tieneSeguro: SEGURO_ACTUAL,
  companiaActual: SEGURO_ACTUAL,
  vencimientoActual: SEGURO_ACTUAL,
  fechaEfecto: HUECO('fecha de efecto: es de la petición de precio, no del riesgo'),
  comentario: HUECO('texto libre para la correduría'),
}

/**
 * HOGAR → `datosVivienda`. Mismos nombres que `DatosHogar` (petición de Codeoscopic) y que la precarga de CIMA
 * (`precargaViviendaDePoliza`). `vivienda` (la dirección) escribe el bloque de dirección entero (`CLAVES_BLOQUE_DIRECCION`).
 */
export const DESTINOS_HOGAR: Readonly<Record<string, DestinoCampoSolicitud>> = {
  vivienda: R('direccion'),
  // La tarjeta «¿Es esta tu vivienda?»: confirmar pasa los m²/año (y el tipo) del Catastro a los DECLARADOS.
  confirmaCatastro: R('metrosCuadrados'),
  tipoVivienda: R('tipoVivienda'),
  metrosCuadrados: R('metrosCuadrados'),
  anioConstruccion: R('anioConstruccion'),
  habitaciones: R('habitaciones'),
  regimen: R('uso'),
  propietarioEsTomador: R('propietarioEsTomador'),
  usoVivienda: R('ocupacion'),
  urbanizacionCerrada: R('urbanizacionCerrada'),
  conMadera: R('conMadera'),
  anioUltimaReforma: R('anioUltimaReforma'),
  alarma: R('alarma'),
  puertaPrincipalBlindada: R('puertaPrincipalBlindada'),
  ventanasSeguras: R('ventanasSeguras'),
  vigilante: R('vigilante'),
  /** Enlaces de antes del 26/10/2026 (importe tecleado). */
  valorContenido: R('capitalContenido'),
  tramoContenido: R('capitalContenido'),
  tramoContinente: R('capitalContinente'),
  joyasEnCajaFuerte: R('joyasEnCajaFuerte'),
  joyasFueraDeCaja: R('joyasFueraDeCaja'),
  objetosDeValor: R('objetosDeValor'),
  perrosPeligrosos: R('perrosPeligrosos'),
  hipoteca: R('hipoteca'),
  entidadHipoteca: R('bancoHipoteca'),
  paraBanco: HUECO('«el seguro es para el certificado del banco»: el modelo guarda hipoteca y banco, no el motivo'),
}

/** Preguntas de hogar añadidas el 26/10/2026: ninguna puede quedarse sin campo en `datosVivienda`. */
export const PREGUNTAS_HOGAR_26_10 = [
  'confirmaCatastro', 'tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'habitaciones', 'propietarioEsTomador',
  'urbanizacionCerrada', 'conMadera', 'anioUltimaReforma', 'puertaPrincipalBlindada', 'ventanasSeguras', 'vigilante',
  'tramoContenido', 'tramoContinente', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos',
] as const

const VEHICULO: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: R('cpCirculacion'),
  tipoCarnet: F('cliente_carnets_conducir'),
  fechaCarnet: F('cliente_carnets_conducir'),
  matricula: R('matricula'),
  marca: R('marca'),
  modelo: R('modelo'),
  fechaMatriculacion: R('fechaMatriculacion'),
  kmAnuales: R('kmAnuales'),
  garaje: R('garaje'),
  aniosSinSiniestros: HUECO('historial de siniestros: `datosVehiculo` no lo tiene (Codeoscopic lo pide en el bloque del seguro anterior)'),
}

const HIPOTECA_PERSONAS = HUECO('hipoteca en vida: `datosCapital` no tiene hipoteca ni banco')
const PERSONAS_CAPITAL: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  capitalDeseado: R('capital'),
  fumador: R('fumador'),
  hipoteca: HIPOTECA_PERSONAS,
  paraBanco: HIPOTECA_PERSONAS,
  entidadHipoteca: HIPOTECA_PERSONAS,
  personasAsegurar: HUECO('número de asegurados: `datosCapital.asegurados` exige nombre, apellidos, nacimiento y sexo de cada uno'),
  edades: HUECO('edades sueltas: `datosCapital.asegurados` exige la persona entera'),
  profesion: HUECO('profesión en texto: `datosCapital.profesion` es un código CNO-11'),
}

const LIBRE: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  descripcionRiesgo: R('descripcion'),
  profesion: HUECO('profesión (accidentes): `datosRiesgoLibre` no tiene profesión'),
  personasAsegurar: HUECO('número de asegurados: `datosRiesgoLibre` no lo tiene'),
  edades: HUECO('edades: `datosRiesgoLibre` no las tiene'),
  razaMascota: HUECO('mascota: `datosRiesgoLibre` no tiene raza'),
  fechaNacimientoMascota: HUECO('mascota: `datosRiesgoLibre` no tiene fecha de nacimiento del animal'),
  ppp: HUECO('mascota: `datosRiesgoLibre` no tiene PPP'),
  microchip: HUECO('mascota: `datosRiesgoLibre` no tiene microchip'),
}

const COMERCIO: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  descripcionRiesgo: HUECO('descripción libre: `datosComercio` tiene campos estructurados (actividad, superficies…), no un texto'),
}

/** El destino declarado de un campo del enlace en ese ramo; `null` = sin declarar (el cepo lo marca). */
export function destinoCampoSolicitud(ramo: RamoSolicitud, clave: string): DestinoCampoSolicitud | null {
  if (Object.hasOwn(COMUNES, clave)) return COMUNES[clave]
  const grupo = grupoSolicitud(ramo)
  const bloque = claveDatosDeRamo(ramo)
  const tabla = grupo === 'vehiculo' ? VEHICULO
    : grupo === 'hogar' ? DESTINOS_HOGAR
    : bloque === 'datosCapital' ? PERSONAS_CAPITAL
    : bloque === 'datosComercio' ? COMERCIO
    : LIBRE
  return Object.hasOwn(tabla, clave) ? tabla[clave] : null
}

// ─── Opciones de hogar → valor de `datosVivienda` ────────────────────────────────────────────────────────────────

/** Ids de catálogos de hogar de Codeoscopic que constan en el repo (`DEFECTOS_HOGAR`, `ETIQUETAS_ID_HOGAR`, docs). */
export const IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS = ['Owner', 'Tenant', 'MainResidence', 'MiddleFloor', 'NoAlarm'] as const

/**
 * Cada opción del enlace de hogar con su clave CANÓNICA (la del bot: `REGIMENES_VIVIENDA`, `USOS_VIVIENDA`,
 * `TIPOS_VIVIENDA` de `@central/module-tarificacion`; lo vigila `apps/asegura/lib/solicitud-coherencia.test.ts`) y,
 * si lo hay, su id ATESTIGUADO de Codeoscopic, que es lo que se escribe en `datosVivienda`.
 */
export const OPCIONES_HOGAR_A_VIVIENDA = {
  regimen: {
    campo: 'uso',
    canonica: { propietario: 'propietario', inquilino: 'inquilino' },
    idCodeoscopic: { propietario: 'Owner', inquilino: 'Tenant' },
  },
  usoVivienda: {
    campo: 'ocupacion',
    canonica: { habitual: 'habitual', secundaria: 'secundaria', alquilada: 'alquiler' },
    idCodeoscopic: { habitual: 'MainResidence' },
  },
  tipoVivienda: {
    campo: 'tipoVivienda',
    canonica: { piso: 'piso', planta_baja: 'planta_baja', atico: 'atico', adosada: 'adosada', independiente: 'independiente' },
    idCodeoscopic: { piso: 'MiddleFloor' },
  },
} as const satisfies Record<string, { campo: string; canonica: Record<string, string>; idCodeoscopic: Record<string, string> }>

/** Alarma (sí/no) → catálogo `alarm-types`: solo «no» tiene id atestiguado (`NoAlarm`). */
export const ALARMA_ID_CODEOSCOPIC = { no: 'NoAlarm' } as const

/** El id de Codeoscopic de una opción de hogar; `null` = sin id atestiguado (no se escribe). */
export function idViviendaDeOpcion(clave: keyof typeof OPCIONES_HOGAR_A_VIVIENDA, valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const m: Record<string, string> = OPCIONES_HOGAR_A_VIVIENDA[clave].idCodeoscopic
  return Object.hasOwn(m, valor) ? m[valor] : null
}
