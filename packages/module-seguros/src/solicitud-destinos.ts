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
 *     (`solicitud-destinos.test.ts`) falla con un campo sin declarar, con un destino que el bloque (de ESE ramo) no
 *     tiene, con un hueco fuera de `HUECOS_PERMITIDOS` o sin motivo escrito, y con un destino `riesgo` que la
 *     propuesta del ramo no llega a escribir.
 * Fase 2 (26/10/2026): ya no quedan huecos de RIESGO; solo el seguro actual fuera de auto/moto, la fecha de efecto, el
 * comentario y el «para el banco» de hogar, cada uno con su porqué.
 *
 * Las opciones de hogar que van a un CATÁLOGO de Codeoscopic (régimen, uso, tipo de vivienda, alarma) se traducen
 * SOLO a ids atestiguados en el repo (`IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS`: los de `DEFECTOS_HOGAR` y
 * `ETIQUETAS_ID_HOGAR`). Un valor sin id atestiguado NO se escribe en `datosVivienda` (queda `null` = «no se sabe»
 * para el cotizador) y se ve en el aviso: nunca se adivina un id.
 */
import { CAMPOS_CAPITAL, admiteDatosCapital, camposCapitalDelRamo } from './datos-capital-riesgo.ts'
import { CAMPOS_COMERCIO } from './datos-comercio-riesgo.ts'
import { CAMPOS_LIBRE, camposLibreDelRamo } from './datos-riesgo-libre.ts'
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

/**
 * Los campos que tiene cada bloque de `info_riesgo`. Con `ramo`, solo los que ESE ramo usa (capital y libre tienen campos
 * propios de vida, de salud/decesos, de accidentes y de mascotas: los de otro ramo se rechazan al validar).
 */
export function camposDelBloque(clave: ClaveDatosRiesgo, ramo?: RamoSolicitud): readonly string[] {
  switch (clave) {
    case 'datosVehiculo': return CAMPOS_VEHICULO
    case 'datosVivienda': return CAMPOS_VIVIENDA
    case 'datosCapital': return ramo && admiteDatosCapital(ramo) ? camposCapitalDelRamo(ramo) : CAMPOS_CAPITAL
    case 'datosComercio': return CAMPOS_COMERCIO
    case 'datosRiesgoLibre': return ramo ? camposLibreDelRamo(ramo) : CAMPOS_LIBRE
  }
}

const R = (campo: string): DestinoCampoSolicitud => ({ en: 'riesgo', campo })
const F = (columna: ColumnaFichaSolicitud): DestinoCampoSolicitud => ({ en: 'ficha', columna })
const HUECO = (motivo: string): DestinoCampoSolicitud => ({ en: 'solo_solicitud', motivo })

/**
 * Los HUECOS que quedan (26/10/2026, fase 2): cada uno con su porqué. El cepo (`solicitud-destinos.test.ts`) solo admite
 * `solo_solicitud` para las claves de `HUECOS_PERMITIDOS` y con un motivo de verdad (no vacío ni de relleno).
 */
const SEGURO_ACTUAL = HUECO('seguro actual fuera de auto/moto: Codeoscopic solo pide seguro anterior en auto y moto (`previousInsurance`) y el bloque del riesgo de este ramo no lo tiene; queda en «Datos pedidos» y en el aviso, para la renovación')
const COMUNES: Readonly<Record<string, DestinoCampoSolicitud>> = {
  dni: F('dni'),
  fechaNacimiento: F('fecha_nacimiento'),
  tieneSeguro: SEGURO_ACTUAL,
  companiaActual: SEGURO_ACTUAL,
  vencimientoActual: SEGURO_ACTUAL,
  fechaEfecto: HUECO('fecha de efecto: es de la PETICIÓN de precio (`effectiveDate`, caduca), no un dato del riesgo; se teclea al pedir precio'),
  comentario: HUECO('comentario del cliente para la correduría: texto libre que se lee en el aviso; no es un dato del riesgo'),
}

/** Claves que pueden quedarse en la solicitud (con su motivo). Cualquier otra tiene que tener campo en el riesgo o la ficha. */
export const HUECOS_PERMITIDOS: ReadonlySet<string> = new Set(['tieneSeguro', 'companiaActual', 'vencimientoActual', 'fechaEfecto', 'comentario', 'paraBanco'])

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

/**
 * AUTO/MOTO → `datosVehiculo`. Nombres de `DatosAuto`/`DatosMoto` (asegura); el seguro actual y el historial viajan a
 * Codeoscopic según `MAPEO_HISTORIAL_CODEOSCOPIC`. `versionCatalogo` = el buscador del catálogo (ids + versión).
 */
export const DESTINOS_VEHICULO: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: R('cpCirculacion'),
  tipoCarnet: F('cliente_carnets_conducir'),
  fechaCarnet: F('cliente_carnets_conducir'),
  matricula: R('matricula'),
  marca: R('marca'),
  modelo: R('modelo'),
  versionCatalogo: R('codigoVehiculo'),
  fechaMatriculacion: R('fechaMatriculacion'),
  kmAnuales: R('kmAnuales'),
  garaje: R('garaje'),
  tieneSeguro: R('aseguradoAntes'),
  companiaActual: R('companiaAnterior'),
  vencimientoActual: R('vencimientoAnterior'),
  aniosSinSiniestros: R('aniosSinSiniestros'),
}

/** VIDA, SALUD, DECESOS → `datosCapital` (hipoteca vinculada en vida; cuántos y qué edades en salud y decesos). */
export const DESTINOS_CAPITAL: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  capitalDeseado: R('capital'),
  fumador: R('fumador'),
  hipoteca: R('hipoteca'),
  paraBanco: R('vinculadaHipoteca'),
  entidadHipoteca: R('bancoHipoteca'),
  capitalPendienteHipoteca: R('capitalPendienteHipoteca'),
  personasAsegurar: R('numeroAsegurados'),
  edades: R('edadesAsegurados'),
}

/**
 * Los LIBRES → `datosRiesgoLibre`. Accidentes se queda aquí (no `datosCapital`): `datos-riesgo-ramo.ts` lo manda al libre
 * porque Codeoscopic no tiene API de accidentes (se cotiza fuera), y su profesión es texto, no el CNO-11 de vida.
 */
export const DESTINOS_LIBRE: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  descripcionRiesgo: R('descripcion'),
  profesion: R('profesion'),
  especieMascota: R('especie'),
  razaMascota: R('raza'),
  fechaNacimientoMascota: R('fechaNacimientoAnimal'),
  ppp: R('ppp'),
  microchip: R('microchip'),
}

/** COMERCIO → `datosComercio`: la descripción es la actividad (`Actividad.DescripcionActividad` de CIMA). */
export const DESTINOS_COMERCIO: Readonly<Record<string, DestinoCampoSolicitud>> = {
  codigoPostal: F('codigo_postal'),
  descripcionRiesgo: R('actividad'),
}

/** El destino declarado de un campo del enlace en ese ramo; `null` = sin declarar (el cepo lo marca). */
export function destinoCampoSolicitud(ramo: RamoSolicitud, clave: string): DestinoCampoSolicitud | null {
  const tabla = tablaDestinos(ramo)
  // Lo del ramo manda (el seguro actual de un coche tiene campo; el de un hogar, no).
  if (Object.hasOwn(tabla, clave)) return tabla[clave]
  return Object.hasOwn(COMUNES, clave) ? COMUNES[clave] : null
}

function tablaDestinos(ramo: RamoSolicitud): Readonly<Record<string, DestinoCampoSolicitud>> {
  const bloque = claveDatosDeRamo(ramo)
  if (grupoSolicitud(ramo) === 'vehiculo') return DESTINOS_VEHICULO
  if (grupoSolicitud(ramo) === 'hogar') return DESTINOS_HOGAR
  if (bloque === 'datosCapital') return DESTINOS_CAPITAL
  if (bloque === 'datosComercio') return DESTINOS_COMERCIO
  return DESTINOS_LIBRE
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
