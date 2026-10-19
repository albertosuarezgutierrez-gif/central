// Contrato de datos por ramo (19/10/2026, spec docs/superpowers/specs/2026-10-19-correduria-lead-a-propuesta-automatica-design.md §1).
// PURO: ni red, ni BD, ni env.
//
// Qué datos hay que pedirle a un cliente para poder tarificar UN ramo. Es la FUENTE ÚNICA de la petición de datos
// del lead por correo (sustituye la lista a mano `DATOS_POR_RAMO` de plataforma, hueco H1 de la spec) y, en fases
// siguientes, de la lectura de su respuesta y de la repregunta.
//
// No se inventa: cada campo dice qué claves de los validadores CUBRE (`cubre`):
//   - `revisarDatos<Ramo>()` / `revisarPersona()` de Codeoscopic (apps/asegura/lib/codeoscopic/peticion-*.ts) → el
//     `campo` de cada `Reparo` (p. ej. `kmAnuales`, `municipioCirculacionId`);
//   - `obligatoriosPara(compania, ramo)` de los bots RPA (@central/module-tarificacion obligatorios.ts) → su `clave`
//     con puntos (p. ej. `conductor.fechaCarne`, `inmueble.superficieM2`).
// El cepo `apps/asegura/lib/contrato-datos.test.ts` llama a esos validadores con riesgos vacíos y a medias y FALLA si
// devuelven una clave que este contrato no cubre: un obligatorio nuevo sin pregunta no puede entrar en silencio.
//
// Reglas de la pregunta (lo que lee el cliente):
//   - lenguaje llano, sin códigos de catálogo ni ids del vendor (el sistema traduce: `origen: 'catalogo'`);
//   - lo `derivado` (municipio por CP, fecha de matriculación por la matrícula, fecha de término…) NO se pregunta;
//   - lo que decide la correduría (`origen: 'correduria'`: tipo de liquidación, desplegables del portal) tampoco;
//   - nada de salud por correo (`sensible: 'salud'` nunca lleva pregunta: preexistencias = categoría especial RGPD);
//   - varias claves pueden compartir UNA pregunta (nombre + apellidos, calle + número + CP…): se pregunta una vez y
//     solo si alguna de ellas sigue sin saberse.

import type { RamoOportunidad } from './oportunidad-seguimiento.ts'
import { camposIdd } from './propuesta-lead.ts'

export type OrigenCampo = 'cliente' | 'catalogo' | 'derivado' | 'correduria'
export type ObligatorioCampo = 'siempre' | 'condicional' | 'para_emitir' | 'opcional'

export type CampoContrato = {
  /** Clave del contrato (la del riesgo en asegura cuando existe). */
  clave: string
  /** Etiqueta corta y humana («matrícula»). Sin valores. */
  etiqueta: string
  /** Cómo se le pide al cliente. `null` = no se le pregunta (derivado, de la correduría o sensible). */
  pregunta: string | null
  origen: OrigenCampo
  obligatorio: ObligatorioCampo
  /** Opcional que SÍ se pide de entrada porque mueve mucho el precio (seguro anterior, fumador). */
  pedirDeEntrada?: true
  sensible?: 'documento' | 'salud'
  /** Claves de los validadores (Codeoscopic y bots) que este campo cubre, además de `clave`. */
  cubre?: readonly string[]
  /** Dato del TOMADOR (no del riesgo): con dos ramos se pregunta una sola vez. */
  deLaPersona?: true
}

/** El contrato que aplica: un ramo con cotizador, o la petición genérica. */
export type ClaveContrato = 'auto' | 'moto' | 'hogar' | 'vida' | 'salud' | 'decesos' | 'comunidades' | 'sin_cotizador' | 'generico'

export type ContratoDatos = {
  clave: ClaveContrato
  /** Quién tarifica este ramo hoy. `[]` = nadie (se cotiza fuera). */
  cotizador: readonly ('avant2' | 'rpa')[]
  /** Título del bloque en la petición («Del vehículo»). */
  titulo: string
  campos: readonly CampoContrato[]
}

const c = (clave: string, etiqueta: string, pregunta: string | null, origen: OrigenCampo, obligatorio: ObligatorioCampo, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ clave, etiqueta, pregunta, origen, obligatorio, ...extra })

// ─── Preguntas compartidas (UNA frase para varias claves) ─────────────────────────────────────────────────────────

const P_NOMBRE = 'Tu nombre y tus dos apellidos, tal como aparecen en el DNI.'
const P_DIRECCION_PERSONA = 'Tu dirección completa (calle, número, piso y código postal).'
const P_SEGURO_ANTERIOR_VEHICULO =
  'Si ahora tiene seguro: con qué compañía, el número de póliza, cuántos años llevas asegurado, cuántos sin dar partes y si has dado alguno en los últimos 5 años.'
const P_CONDUCTOR = 'Si el conductor habitual no eres tú: su nombre y apellidos, DNI, fecha de nacimiento y fecha del carné.'
const P_DIRECCION_VIVIENDA = 'La dirección completa de la vivienda: calle, número, piso, puerta y código postal.'
const P_REGIMEN = 'Si la vivienda es tuya o vives de alquiler (y, si no es tuya, de quién es).'
const P_UBICACION = 'Dónde está: en el casco urbano, en una urbanización (¿cerrada?) o en una casa aislada.'
const P_CONSTRUCCION = 'Cómo es la construcción: ladrillo u hormigón, si lleva madera, y si la calidad es normal, buena o de lujo.'
const P_SEGURIDAD = 'Si tiene alarma, si la puerta de entrada es blindada y si las ventanas tienen rejas o cierres de seguridad.'
const P_CAPITALES = 'Qué quieres asegurar: la construcción (continente), los muebles y enseres (contenido) o ambos, y por qué importe aproximado. Si no lo sabes, te lo calculamos.'
const P_EFECTO = 'Desde qué fecha quieres que empiece el seguro.'
const P_ASEGURADOS = 'Quiénes se aseguran además de ti: nombre, apellidos, fecha de nacimiento y sexo de cada uno.'
const P_EDIFICIO = 'El código postal y la dirección del edificio.'

// ─── La persona (tomador), común a los ramos de Codeoscopic ───────────────────────────────────────────────────────

/** El tomador. `conDireccion`: auto/moto (el Submit de Avant2 exige la calle troceada); hogar asegura OTRA dirección. */
function persona(conDireccion: boolean): CampoContrato[] {
  const base: CampoContrato[] = [
    c('dni', 'DNI o NIE', 'Tu DNI o NIE, con la letra.', 'cliente', 'siempre', {
      sensible: 'documento', cubre: ['documentoTomador', 'tomador.documentoIdentidad'],
    }),
    c('nombre', 'nombre', P_NOMBRE, 'cliente', 'siempre', { cubre: ['datosTomador.nombre', 'datosTomador.razonSocial', 'razonSocial', 'cif'] }),
    c('apellido1', 'primer apellido', P_NOMBRE, 'cliente', 'siempre', { cubre: ['datosTomador.apellido1'] }),
    c('apellido2', 'segundo apellido', P_NOMBRE, 'cliente', 'condicional'),
    c('fechaNacimiento', 'fecha de nacimiento', 'Tu fecha de nacimiento.', 'cliente', 'siempre', {
      cubre: ['datosTomador.fechaNacimiento', 'tomador.fechaNacimiento', 'conductor.fechaNacimiento'],
    }),
    c('sexo', 'sexo', 'Sexo que figura en tu DNI.', 'cliente', 'siempre', { cubre: ['conductor.sexo'] }),
    c('estadoCivil', 'estado civil', 'Tu estado civil (soltero/a, casado/a, pareja de hecho…).', 'catalogo', 'siempre'),
    c('telefono', 'teléfono', 'Un teléfono móvil de contacto.', 'cliente', 'siempre'),
    c('nacionalidad', 'nacionalidad', 'Si tienes NIE o pasaporte: tu nacionalidad.', 'cliente', 'condicional'),
    c('email', 'correo electrónico', 'Tu correo electrónico.', 'cliente', 'para_emitir'),
  ]
  if (!conDireccion) return base.map(marcarPersona)
  return [
    ...base,
    c('nombreVia', 'calle', P_DIRECCION_PERSONA, 'cliente', 'para_emitir'),
    c('numeroVia', 'número', P_DIRECCION_PERSONA, 'cliente', 'para_emitir'),
    c('cpResidencia', 'código postal', P_DIRECCION_PERSONA, 'cliente', 'para_emitir'),
    c('tipoVia', 'tipo de vía', P_DIRECCION_PERSONA, 'catalogo', 'para_emitir'),
    c('municipioResidenciaId', 'municipio', null, 'derivado', 'para_emitir'),
  ].map(marcarPersona)
}

const marcarPersona = (f: CampoContrato): CampoContrato => ({ ...f, deLaPersona: true })

// ─── Vehículo (auto y moto) ───────────────────────────────────────────────────────────────────────────────────────

function vehiculo(moto: boolean): CampoContrato[] {
  const que = moto ? 'la moto' : 'el vehículo'
  return [
    c('matricula', 'matrícula', `La matrícula de ${que}.`, 'cliente', 'siempre', { cubre: ['matriculaAnterior'] }),
    c('codigoVehiculo', 'marca, modelo y versión',
      moto
        ? 'Marca, modelo y cilindrada de la moto (por ejemplo, «Honda PCX 125»).'
        : 'Marca, modelo y versión exacta (por ejemplo, «Seat León 1.5 TSI FR»).',
      'catalogo', 'siempre', {
        cubre: ['seleccionVehiculo', 'seleccionVehiculo.marca', 'seleccionVehiculo.modelo', 'seleccionVehiculo.cilindradaCc', 'seleccionVehiculo.clase'],
      }),
    c('fechaMatriculacion', 'fecha de matriculación', null, 'derivado', 'siempre'),
    c('fechaCarnet', 'fecha del carné', 'La fecha en que te sacaste el carné de conducir.', 'cliente', 'siempre', { cubre: ['conductor.fechaCarne'] }),
    c('kmAnuales', 'kilómetros al año', 'Cuántos kilómetros haces al año, aproximadamente.', 'cliente', 'siempre'),
    c('garaje', 'dónde duerme', `Dónde duerme ${que} por la noche: garaje individual, garaje comunitario o en la calle.`, 'catalogo', 'siempre'),
    c('cpCirculacion', 'código postal de circulación', `El código postal donde duerme ${que}.`, 'cliente', 'siempre', { cubre: ['codigoPostal'] }),
    c('municipioCirculacionId', 'municipio de circulación', null, 'derivado', 'siempre'),
    c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
    c('conductor', 'conductor habitual', P_CONDUCTOR, 'cliente', 'condicional', { cubre: ['tomadorEsConductor'] }),
    c('propietario', 'titular del vehículo', `Si el titular de ${que} no eres tú: su nombre, apellidos y DNI.`, 'cliente', 'condicional'),
    c('conductorOcasional', 'conductor ocasional', `Si lo conduce alguien más de vez en cuando: su nombre, fecha de nacimiento y fecha del carné.`, 'cliente', 'opcional'),
    c('aseguradoAntes', 'seguro anterior', P_SEGURO_ANTERIOR_VEHICULO, 'cliente', 'condicional', {
      pedirDeEntrada: true,
      cubre: [
        'companiaAnteriorCodigo', 'polizaAnterior', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros', 'siniestrosUltimos5',
        'companiaAnterior', 'aniosAseguradoAnterior', 'siniestrosUltimos5Anios',
      ],
    }),
    c('fechaCompra', 'fecha de compra', null, 'cliente', 'opcional'),
    c('remolqueLigero', 'remolque', null, 'cliente', 'opcional'),
    ...(moto
      ? [c('experienciaConduccion', 'experiencia con moto', 'Si has tenido moto antes: si es esta misma u otra, y cuál.', 'catalogo', 'siempre', { cubre: ['motoAnteriorCodigo'] })]
      : []),
  ]
}

// ─── Hogar ────────────────────────────────────────────────────────────────────────────────────────────────────────

const HOGAR: readonly CampoContrato[] = [
  c('cp', 'código postal de la vivienda', P_DIRECCION_VIVIENDA, 'cliente', 'siempre', { cubre: ['inmueble.codigoPostal'] }),
  c('nombreVia', 'calle de la vivienda', P_DIRECCION_VIVIENDA, 'cliente', 'siempre', { cubre: ['inmueble.nombreVia'] }),
  c('numeroVia', 'número', P_DIRECCION_VIVIENDA, 'cliente', 'siempre', { cubre: ['inmueble.numero'] }),
  c('planta', 'piso', P_DIRECCION_VIVIENDA, 'cliente', 'opcional', { cubre: ['puertaVivienda'] }),
  c('tipoViaId', 'tipo de vía', P_DIRECCION_VIVIENDA, 'catalogo', 'siempre'),
  c('municipioId', 'municipio', null, 'derivado', 'siempre'),
  c('referenciaCatastral', 'referencia catastral',
    'La referencia catastral de la vivienda (viene en el recibo del IBI), si la tienes a mano.', 'cliente', 'condicional',
    { cubre: ['inmueble.referenciaCatastral'] }),
  c('metrosCuadrados', 'metros cuadrados', 'Los metros cuadrados construidos.', 'cliente', 'siempre', { cubre: ['inmueble.superficieM2'] }),
  c('anioConstruccion', 'año de construcción', 'El año de construcción del edificio (aproximado si no lo sabes).', 'cliente', 'siempre', { cubre: ['inmueble.anioConstruccion'] }),
  c('habitaciones', 'habitaciones', 'Cuántas habitaciones tiene (sin contar salón, cocina ni baños).', 'cliente', 'siempre'),
  c('tipoVivienda', 'tipo de vivienda', 'Qué tipo de vivienda es: piso, ático, bajo, adosado o casa independiente.', 'catalogo', 'siempre', { cubre: ['hogar.tipoVivienda'] }),
  // Ojo con los nombres: en Avant2 `uso` = propietario/inquilino y `ocupacion` = habitual/segunda; en los bots es al revés.
  c('uso', 'propietario o inquilino', P_REGIMEN, 'catalogo', 'siempre', { cubre: ['hogar.regimen'] }),
  c('propietarioEsTomador', 'propietario = tomador', P_REGIMEN, 'cliente', 'siempre'),
  c('ocupacion', 'uso de la vivienda', 'Si es tu vivienda habitual, una segunda residencia o la tienes alquilada a otros.', 'catalogo', 'siempre', { cubre: ['hogar.uso'] }),
  c('ubicacion', 'ubicación', P_UBICACION, 'catalogo', 'siempre'),
  c('urbanizacionCerrada', 'urbanización cerrada', P_UBICACION, 'cliente', 'siempre'),
  c('material', 'materiales', P_CONSTRUCCION, 'catalogo', 'siempre', { cubre: ['hogar.conMadera'] }),
  c('calidad', 'calidad de la construcción', P_CONSTRUCCION, 'catalogo', 'siempre'),
  c('alarma', 'alarma', P_SEGURIDAD, 'catalogo', 'siempre'),
  c('puertaPrincipalBlindada', 'puerta blindada', P_SEGURIDAD, 'cliente', 'siempre'),
  c('ventanasSeguras', 'ventanas seguras', P_SEGURIDAD, 'cliente', 'siempre'),
  c('puertasSecundarias', 'puertas secundarias', P_SEGURIDAD, 'catalogo', 'siempre'),
  c('vigilante', 'vigilante', null, 'cliente', 'opcional'),
  // El tipo de liquidación (valor de reposición / real) lo propone la correduría, no el cliente.
  c('asentamiento', 'tipo de liquidación', null, 'correduria', 'siempre'),
  c('capitalContinente', 'capital de continente', P_CAPITALES, 'cliente', 'siempre'),
  c('capitalContenido', 'capital de contenido', P_CAPITALES, 'cliente', 'siempre'),
  c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
  c('anioUltimaReforma', 'año de la última reforma', 'Si se ha reformado: en qué año.', 'cliente', 'opcional'),
  c('joyasEnCajaFuerte', 'joyas en caja fuerte', 'Si tienes joyas u objetos de valor que quieras cubrir, y por qué importe.', 'cliente', 'opcional', {
    cubre: ['joyasFueraDeCaja', 'objetosDeValor'],
  }),
  c('perrosPeligrosos', 'perros peligrosos', 'Si tienes perros de raza potencialmente peligrosa.', 'cliente', 'opcional'),
]

// ─── Vida, salud y decesos ───────────────────────────────────────────────────────────────────────────────────────

const VIDA: readonly CampoContrato[] = [
  c('capital', 'capital', 'El capital que quieres asegurar (si va ligado a una hipoteca: el banco y lo que queda por pagar).', 'cliente', 'siempre'),
  c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
  c('asegurado', 'asegurado', 'Si la persona asegurada no eres tú: su nombre, apellidos, DNI y fecha de nacimiento.', 'cliente', 'condicional'),
  c('duracionAnios', 'duración', 'Durante cuántos años lo quieres (por ejemplo, lo que le queda a la hipoteca).', 'cliente', 'opcional', { pedirDeEntrada: true }),
  c('profesion', 'profesión', 'Tu profesión (influye en el precio).', 'catalogo', 'opcional', { pedirDeEntrada: true }),
  c('fumador', 'fumador', 'Si fumas (influye en el precio).', 'cliente', 'opcional', { pedirDeEntrada: true }),
]

const PREEXISTENCIAS = c('preexistencias', 'enfermedades previas', null, 'cliente', 'opcional', { sensible: 'salud' })

const SALUD: readonly CampoContrato[] = [
  c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
  c('aseguradosAdicionales', 'asegurados', P_ASEGURADOS, 'cliente', 'condicional'),
  c('modalidadDeseada', 'modalidad', 'Si buscas cuadro médico concertado o reembolso de gastos.', 'cliente', 'opcional', { pedirDeEntrada: true }),
  c('capital', 'capital', null, 'cliente', 'opcional'),
  PREEXISTENCIAS,
]

const DECESOS: readonly CampoContrato[] = [
  c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
  c('aseguradosAdicionales', 'asegurados', P_ASEGURADOS, 'cliente', 'condicional'),
  c('capital', 'capital', null, 'cliente', 'opcional'),
]

// ─── Comunidades (solo bots RPA) ─────────────────────────────────────────────────────────────────────────────────

const COMUNIDADES: readonly CampoContrato[] = [
  c('direccion.codigoPostal', 'código postal del edificio', P_EDIFICIO, 'cliente', 'siempre'),
  c('m2Construidos', 'metros construidos', 'Los metros cuadrados construidos del edificio.', 'cliente', 'siempre'),
  c('anioConstruccion', 'año de construcción', 'El año de construcción del edificio.', 'cliente', 'siempre'),
  c('plantas', 'plantas', 'Cuántas plantas tiene sobre la calle.', 'cliente', 'siempre'),
  c('numEdificios', 'edificios', 'Cuántos edificios o portales forman la comunidad.', 'cliente', 'siempre'),
  c('numViviendasYLocales', 'viviendas y locales', 'Cuántas viviendas y cuántos locales hay.', 'cliente', 'siempre', { cubre: ['numViviendas', 'numLocales'] }),
  c('capitalContinente', 'valor del edificio', 'El valor de reconstrucción del edificio, si lo sabes (si no, lo calculamos).', 'cliente', 'siempre'),
  c('fechaEfecto', 'fecha de efecto', P_EFECTO, 'cliente', 'siempre'),
  c('fechaTermino', 'fecha de término', null, 'derivado', 'siempre'),
  // F3b (19/10/2026): con una referencia de 20 caracteres el Catastro da el año de construcción y el CP del edificio.
  c('referenciaCatastral', 'referencia catastral', 'La referencia catastral del edificio o de una de sus viviendas (viene en el recibo del IBI), si la tenéis a mano.', 'cliente', 'opcional', { pedirDeEntrada: true }),
  c('polizaAReemplazar', 'póliza actual', 'Si ya tenéis seguro: compañía, precio actual y fecha de vencimiento.', 'cliente', 'opcional', { pedirDeEntrada: true }),
  // Desplegables del portal de Allianz con valor por defecto: los elige la correduría, no el cliente.
  c('tipoVivienda', 'tipo (portal)', null, 'correduria', 'siempre'),
  c('uso', 'uso (portal)', null, 'correduria', 'siempre'),
  c('listaPropietarios', 'lista de propietarios (portal)', null, 'correduria', 'siempre'),
]

// ─── Sin cotizador / genérico ────────────────────────────────────────────────────────────────────────────────────

const SEGURO_ACTUAL_GENERICO = c('seguroActual', 'seguro actual', 'Si ya tienes un seguro: compañía, precio actual y fecha de vencimiento.', 'cliente', 'opcional', { pedirDeEntrada: true })

const SIN_COTIZADOR: readonly CampoContrato[] = [
  c('descripcion', 'qué necesita', 'Cuéntame con un poco más de detalle qué necesitas cubrir (la actividad, los importes y lo que más te preocupa).', 'cliente', 'siempre'),
  c('cp', 'código postal', 'Tu código postal.', 'cliente', 'siempre'),
  c('telefono', 'teléfono', 'Un teléfono por si es más rápido llamarte.', 'cliente', 'opcional', { pedirDeEntrada: true }),
  SEGURO_ACTUAL_GENERICO,
]

const GENERICO: readonly CampoContrato[] = [
  c('descripcion', 'qué quiere asegurar', 'Qué quieres asegurar y para qué (cuéntamelo con tus palabras).', 'cliente', 'siempre'),
  c('cp', 'código postal', 'Tu código postal.', 'cliente', 'siempre'),
  c('telefono', 'teléfono', 'Un teléfono por si es más rápido llamarte.', 'cliente', 'opcional', { pedirDeEntrada: true }),
  SEGURO_ACTUAL_GENERICO,
]

const CONTRATOS: Readonly<Record<ClaveContrato, ContratoDatos>> = {
  auto: { clave: 'auto', cotizador: ['avant2', 'rpa'], titulo: 'Del coche', campos: [...persona(true), ...vehiculo(false)] },
  moto: { clave: 'moto', cotizador: ['avant2', 'rpa'], titulo: 'De la moto', campos: [...persona(true), ...vehiculo(true)] },
  hogar: { clave: 'hogar', cotizador: ['avant2', 'rpa'], titulo: 'De la vivienda', campos: [...persona(false), ...HOGAR] },
  vida: { clave: 'vida', cotizador: ['avant2'], titulo: 'Del seguro de vida', campos: [...persona(false), ...VIDA] },
  salud: { clave: 'salud', cotizador: ['avant2'], titulo: 'Del seguro de salud', campos: [...persona(false), ...SALUD] },
  decesos: { clave: 'decesos', cotizador: ['avant2'], titulo: 'Del seguro de decesos', campos: [...persona(false), ...DECESOS] },
  comunidades: { clave: 'comunidades', cotizador: ['rpa'], titulo: 'De la comunidad', campos: COMUNIDADES },
  sin_cotizador: { clave: 'sin_cotizador', cotizador: [], titulo: 'De lo que quieres asegurar', campos: SIN_COTIZADOR },
  generico: { clave: 'generico', cotizador: [], titulo: 'De lo que quieres asegurar', campos: GENERICO },
}

const CON_CONTRATO = new Set<string>(['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'comunidades'])

/**
 * El contrato de un ramo de oportunidad. Ramo sin cotizador (RC, comercio, mascotas…) → `sin_cotizador`; sin ramo
 * (`null`) → `generico`. Nunca lanza.
 */
export function contratoDatos(ramo: RamoOportunidad | string | null): ContratoDatos {
  if (ramo === null) return CONTRATOS.generico
  const r = String(ramo).trim().toLowerCase()
  return CON_CONTRATO.has(r) ? CONTRATOS[r as ClaveContrato] : CONTRATOS.sin_cotizador
}

/** Todas las claves que un contrato cubre (las suyas y las de los validadores). Para los cepos. */
export function clavesCubiertas(contrato: ContratoDatos): Set<string> {
  const s = new Set<string>()
  for (const f of contrato.campos) {
    s.add(f.clave)
    for (const x of f.cubre ?? []) s.add(x)
  }
  return s
}

/** ¿Se le pregunta al cliente en la PRIMERA petición? Lo obligatorio, lo condicional y lo opcional que mueve el precio. */
export function sePideDeEntrada(f: CampoContrato): boolean {
  if (f.pregunta === null || f.sensible === 'salud') return false
  if (f.origen !== 'cliente' && f.origen !== 'catalogo') return false
  return f.obligatorio === 'siempre' || f.obligatorio === 'condicional' || f.pedirDeEntrada === true
}

export type BloquePeticion = { titulo: string | null; preguntas: string[] }

/**
 * La petición de datos: SOLO lo que falta. `conocidos` = claves del contrato que ya se saben (las dio el correo, las
 * trajo el Catastro…). Una pregunta compartida se omite solo si TODAS sus claves pedibles se saben. Con un ramo, un
 * bloque sin título; con varios, primero «Sobre ti» (la persona, una vez) y luego uno por ramo. Sin ramos, la
 * genérica. Bloques vacíos fuera. PURA.
 */
export function peticionDatos(ramos: readonly (RamoOportunidad | string)[], conocidos: ReadonlySet<string> = new Set()): BloquePeticion[] {
  const contratos = ramos.length === 0 ? [contratoDatos(null)] : [...new Map(ramos.map((r) => { const k = contratoDatos(r); return [k.clave, k] as const })).values()]
  const preguntasDe = (campos: readonly CampoContrato[]): string[] => {
    const porPregunta = new Map<string, string[]>()
    for (const f of campos) {
      if (!sePideDeEntrada(f)) continue
      const lista = porPregunta.get(f.pregunta!) ?? []
      lista.push(f.clave)
      porPregunta.set(f.pregunta!, lista)
    }
    return [...porPregunta].filter(([, claves]) => claves.some((k) => !conocidos.has(k))).map(([p]) => p)
  }
  if (contratos.length === 1) {
    const p = preguntasDe(contratos[0].campos)
    return p.length ? [{ titulo: null, preguntas: p }] : []
  }
  const personaCampos = new Map<string, CampoContrato>()
  for (const k of contratos) {
    if (k.clave === 'comunidades') continue
    for (const f of k.campos) if (f.deLaPersona && !personaCampos.has(f.clave)) personaCampos.set(f.clave, f)
  }
  const bloques: BloquePeticion[] = [{ titulo: 'Sobre ti', preguntas: preguntasDe([...personaCampos.values()]) }]
  const yaPreguntadas = new Set(bloques[0].preguntas)
  for (const k of contratos) {
    const propios = k.campos.filter((f) => !f.deLaPersona)
    bloques.push({ titulo: k.titulo, preguntas: preguntasDe(propios).filter((p) => !yaPreguntadas.has(p)) })
    for (const p of bloques[bloques.length - 1].preguntas) yaPreguntadas.add(p)
  }
  return bloques.filter((b) => b.preguntas.length > 0)
}

/** Etiquetas de un conjunto de claves de un contrato, para decir en Telegram qué se sabe ya. */
export function etiquetasDe(ramos: readonly (RamoOportunidad | string)[], claves: ReadonlySet<string>): string[] {
  const out = new Set<string>()
  for (const r of ramos.length ? ramos : [null]) {
    for (const f of contratoDatos(r).campos) if (claves.has(f.clave)) out.add(f.etiqueta)
    // F4: las necesidades IDD que contestó (`idd_<id>`) también se nombran («modalidad», «lunas»…), sin su valor.
    for (const f of camposIdd(r)) if (claves.has(f.clave)) out.add(f.etiqueta)
  }
  return [...out]
}
