// Qué campos tiene CADA tipo de seguro, y qué es un dato válido en cada uno.
//
// Es el catálogo que hace que la pantalla de «añadir póliza» deje de ser un
// formulario genérico: al elegir el ramo se despliegan SUS campos y solo los
// suyos. Vive en el módulo puro porque la decisión «esto es un dato / esto es
// basura» tiene que poder testearse sin BD y sin Next, y porque la aplican dos
// caminos distintos —la persona que teclea y el extractor que lee el PDF—, que
// deben aplicar EXACTAMENTE la misma regla.
//
// 🚨 NINGÚN CAMPO ES OBLIGATORIO, y eso es el diseño. Un tarificador pide todo
// siempre porque necesita calcular un precio; aquí el cliente solo apunta lo
// que tiene delante. Obligar un campo consigue que se lo invente, y un dato
// inventado no se distingue de uno bueno — es la regla de la casa «dato que NO
// hay ≠ dato que NO se ha mirado», que aquí se paga en avisos falsos.
//
// 🚨 LOS TRES DEL VEHÍCULO NO ESTÁN AQUÍ. Matrícula, bastidor y fecha de
// matriculación son COLUMNAS de `portal_poliza_declarada` (identifican el bien,
// se consultan y se indexan) y viven en `lib/poliza-editable.ts`. Este catálogo
// solo cubre lo DESCRIPTIVO, que va a un `jsonb` porque varía por ramo y nadie
// lo consulta. Duplicar la matrícula aquí crearía dos sitios donde vive el
// mismo dato, y el día que discrepen nadie sabrá cuál manda.
//
// 🚨 NADA DE CATEGORÍAS ESPECIALES DEL ART. 9 RGPD. Un cuestionario de vida
// pregunta si fumas y qué enfermedades has tenido; un portal de autoservicio no
// puede recoger eso sin consentimiento explícito y separado, y aquí no lo hay.
// Lo que se pide de vida/salud/decesos es de CONTRATO (capital, modalidad,
// cuántos asegurados), nunca de SALUD. Si algún día hace falta, es una fase con
// su propio consentimiento, no un campo más en esta lista.

import { RAMOS_POLIZA, type RamoPoliza } from './poliza-leida.ts'

/** Cómo se pinta un campo. La pantalla mapea esto a su `<input>`; el módulo no sabe de HTML. */
export type TipoCampo = 'texto' | 'numero' | 'dinero' | 'fecha' | 'opcion' | 'triestado'

export type OpcionCampo = { valor: string; etiqueta: string }

export type CampoRamo = {
  /** Clave dentro del `jsonb`. Estable: renombrarla huérfana los datos ya guardados. */
  readonly id: string
  readonly etiqueta: string
  readonly tipo: TipoCampo
  /** Una línea bajo el campo. Vacío si la etiqueta ya se explica sola. */
  readonly ayuda?: string
  /** Solo para `tipo: 'opcion'`. */
  readonly opciones?: readonly OpcionCampo[]
  /** Solo para `numero`/`dinero`: rango admisible. Fuera de él es un tecleo, no un dato. */
  readonly min?: number
  readonly max?: number
  /**
   * `true` cuando el Catastro puede rellenarlo a partir de la dirección
   * (`@central/core-catastro`). No lo rellena este módulo: lo marca para que la
   * pantalla sepa cuáles ofrecer, y el valor sigue entrando solo si la persona
   * lo acepta.
   */
  readonly desdeCatastro?: boolean
}

/** Tope de un texto libre: por encima no es un dato, es un pegado. */
export const MAX_TEXTO_RAMO = 200

/**
 * El año de construcción admite el año QUE VIENE: una obra nueva se asegura
 * antes de estar terminada. Se calcula al cargar el módulo para que el catálogo
 * no caduque solo cada 1 de enero.
 */
const ANIO_MAX_CONSTRUCCION = new Date().getUTCFullYear() + 1

/** Mismo juego para coche y moto: lo que cambia la prima es el uso, no el vehículo. */
const OPCIONES_USO_VEHICULO: readonly OpcionCampo[] = [
  { valor: 'particular', etiqueta: 'Particular (uso privado)' },
  { valor: 'profesional', etiqueta: 'Profesional (trabajo, reparto, transporte)' },
  { valor: 'mixto', etiqueta: 'Las dos cosas' },
]

/**
 * Propietario o inquilino no es un matiz: el continente (el edificio) no es del
 * inquilino, así que la respuesta cambia QUÉ se puede asegurar.
 */
const OPCIONES_REGIMEN_VIVIENDA: readonly OpcionCampo[] = [
  { valor: 'propietario', etiqueta: 'Soy el propietario' },
  { valor: 'inquilino', etiqueta: 'Estoy de alquiler' },
]

/**
 * El catálogo. Una entrada por ramo de `RAMOS_POLIZA` — la exhaustividad la
 * comprueba un test, para que añadir un ramo al enum no deje una pantalla muda.
 *
 * Los códigos postales van como `texto` y no como `numero` a propósito: los de
 * Álava, Albacete y Alicante empiezan por cero, y un `numero` se lo come.
 */
export const CAMPOS_POR_RAMO: Readonly<Record<RamoPoliza, readonly CampoRamo[]>> = {
  // Matrícula, bastidor y fecha de matriculación NO están aquí: son columnas.
  auto: [
    { id: 'uso', etiqueta: '¿Para qué usas el coche?', tipo: 'opcion', opciones: OPCIONES_USO_VEHICULO },
    {
      id: 'marca',
      etiqueta: 'Marca',
      tipo: 'texto',
      ayuda: 'Tal como viene en la ficha técnica (Seat, Renault, Kia…). Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modelo',
      etiqueta: 'Modelo y versión',
      tipo: 'texto',
      ayuda: 'Por ejemplo «León 1.5 TSI». Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'kilometrosAnuales',
      etiqueta: 'Kilómetros que haces al año (aproximados)',
      tipo: 'numero',
      min: 0,
      max: 200000,
      ayuda: 'Una cifra aproximada vale. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'garaje',
      etiqueta: '¿Pasa la noche en un garaje cerrado?',
      tipo: 'triestado',
      ayuda: 'Si aparcas en la calle o no siempre en el mismo sitio, responde «No». Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'valorVehiculo',
      etiqueta: 'Valor actual del vehículo',
      tipo: 'dinero',
      min: 0,
      max: 1000000,
      ayuda: 'Lo que costaría hoy comprar uno igual, no lo que pagaste. Si no lo sabes, déjalo en blanco.',
    },
  ],

  moto: [
    { id: 'uso', etiqueta: '¿Para qué usas la moto?', tipo: 'opcion', opciones: OPCIONES_USO_VEHICULO },
    {
      id: 'marca',
      etiqueta: 'Marca',
      tipo: 'texto',
      ayuda: 'Tal como viene en la ficha técnica (Honda, Yamaha…). Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modelo',
      etiqueta: 'Modelo y versión',
      tipo: 'texto',
      ayuda: 'Por ejemplo «PCX 125». Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'cilindrada',
      etiqueta: 'Cilindrada (cc)',
      tipo: 'numero',
      min: 1,
      max: 3000,
      ayuda: 'En centímetros cúbicos, como en el permiso. Si es eléctrica o no lo sabes, déjalo en blanco.',
    },
    {
      id: 'garaje',
      etiqueta: '¿Pasa la noche en un garaje cerrado?',
      tipo: 'triestado',
      ayuda: 'Si duerme en la calle, responde «No». Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'valorVehiculo',
      etiqueta: 'Valor actual de la moto',
      tipo: 'dinero',
      min: 0,
      max: 300000,
      ayuda: 'Lo que costaría hoy comprar una igual. Si no lo sabes, déjalo en blanco.',
    },
  ],

  hogar: [
    {
      id: 'direccion',
      etiqueta: 'Dirección de la vivienda asegurada',
      tipo: 'texto',
      ayuda: 'Calle, número, piso y puerta. Si no lo sabes ahora, déjalo en blanco.',
    },
    { id: 'codigoPostal', etiqueta: 'Código postal', tipo: 'texto', desdeCatastro: true },
    {
      id: 'metrosCuadrados',
      etiqueta: 'Metros cuadrados construidos',
      tipo: 'numero',
      min: 1,
      max: 10000,
      desdeCatastro: true,
      ayuda: 'Los de la escritura o el recibo del IBI. Si no lo sabes, déjalo en blanco: podemos mirarlo en el Catastro.',
    },
    {
      id: 'anioConstruccion',
      etiqueta: 'Año de construcción del edificio',
      tipo: 'numero',
      min: 1800,
      max: ANIO_MAX_CONSTRUCCION,
      desdeCatastro: true,
      ayuda: 'No es el año en que la compraste. Si no lo sabes, déjalo en blanco: podemos mirarlo en el Catastro.',
    },
    {
      id: 'tipoVivienda',
      etiqueta: 'Tipo de vivienda',
      tipo: 'opcion',
      opciones: [
        { valor: 'piso', etiqueta: 'Piso' },
        { valor: 'atico', etiqueta: 'Ático' },
        { valor: 'adosado', etiqueta: 'Adosado o pareado' },
        { valor: 'unifamiliar', etiqueta: 'Chalet independiente' },
      ],
    },
    { id: 'regimen', etiqueta: '¿La vivienda es tuya o de alquiler?', tipo: 'opcion', opciones: OPCIONES_REGIMEN_VIVIENDA },
    {
      id: 'usoVivienda',
      etiqueta: '¿Qué uso le das?',
      tipo: 'opcion',
      opciones: [
        { valor: 'habitual', etiqueta: 'Vivo aquí todo el año' },
        { valor: 'segunda_residencia', etiqueta: 'Segunda residencia' },
        { valor: 'alquilada', etiqueta: 'La tengo alquilada' },
      ],
    },
    {
      id: 'capitalContinente',
      etiqueta: 'Capital del continente (el edificio en sí)',
      tipo: 'dinero',
      min: 0,
      max: 5000000,
      ayuda: 'Lo que costaría reconstruir la vivienda, sin el suelo. Si estás de alquiler no suele ser tuyo. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalContenido',
      etiqueta: 'Capital del contenido (muebles y enseres)',
      tipo: 'dinero',
      min: 0,
      max: 1000000,
      ayuda: 'Lo que costaría reponer todo lo que hay dentro. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'alarmaConectada',
      etiqueta: '¿Tiene alarma conectada a una central?',
      tipo: 'triestado',
      ayuda: 'Una alarma que solo suena no cuenta. Si no lo sabes, déjalo en blanco.',
    },
  ],

  vida: [
    {
      id: 'fechaNacimiento',
      etiqueta: 'Fecha de nacimiento del asegurado',
      tipo: 'fecha',
      ayuda: 'En formato AAAA-MM-DD. Si no la tienes a mano, déjalo en blanco.',
    },
    {
      id: 'profesion',
      etiqueta: 'Profesión del asegurado',
      tipo: 'texto',
      ayuda: 'La que consta en la póliza. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modalidad',
      etiqueta: '¿Qué cubre la póliza?',
      tipo: 'opcion',
      opciones: [
        { valor: 'fallecimiento', etiqueta: 'Solo fallecimiento' },
        { valor: 'invalidez', etiqueta: 'Solo invalidez' },
        { valor: 'ambas', etiqueta: 'Fallecimiento e invalidez' },
      ],
    },
    {
      id: 'capitalAsegurado',
      etiqueta: 'Capital asegurado',
      tipo: 'dinero',
      min: 0,
      max: 10000000,
      ayuda: 'La cantidad que se cobraría. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'beneficiarios',
      etiqueta: '¿Quién cobraría?',
      tipo: 'opcion',
      ayuda: 'Aquí no hacen falta nombres: solo el tipo de designación. Si no lo sabes, déjalo en blanco.',
      opciones: [
        { valor: 'herederos', etiqueta: 'Los herederos legales' },
        { valor: 'designados', etiqueta: 'Personas designadas en la póliza' },
        { valor: 'entidad', etiqueta: 'El banco (póliza ligada a un préstamo)' },
      ],
    },
    {
      id: 'vinculadaHipoteca',
      etiqueta: '¿Está ligada a una hipoteca o préstamo?',
      tipo: 'triestado',
      ayuda: 'Si te la pidió el banco al firmar, normalmente sí. Si no lo sabes, déjalo en blanco.',
    },
  ],

  // 🚨 Nada de la persona: solo cómo es el CONTRATO. Ver la cabecera (art. 9 RGPD).
  salud: [
    {
      id: 'numeroAsegurados',
      etiqueta: '¿Cuántas personas están incluidas en la póliza?',
      tipo: 'numero',
      min: 1,
      max: 20,
      ayuda: 'Contando al titular. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modalidad',
      etiqueta: '¿Cómo funciona la póliza?',
      tipo: 'opcion',
      opciones: [
        { valor: 'cuadro_medico', etiqueta: 'Cuadro médico (vas a los centros de la compañía)' },
        { valor: 'reembolso', etiqueta: 'Reembolso (eliges tú y te devuelven parte)' },
        { valor: 'mixta', etiqueta: 'Las dos cosas' },
      ],
    },
    {
      id: 'copago',
      etiqueta: '¿Pagas algo cada vez que usas la póliza?',
      tipo: 'triestado',
      ayuda: 'Es el copago: unos euros por consulta o prueba. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'incluyeHospitalizacion',
      etiqueta: '¿Incluye hospitalización?',
      tipo: 'triestado',
      ayuda: 'Hay pólizas solo de consultas, sin ingreso. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'incluyeDental',
      etiqueta: '¿Incluye dental?',
      tipo: 'triestado',
      ayuda: 'A veces va como póliza aparte. Si no lo sabes, déjalo en blanco.',
    },
  ],

  decesos: [
    {
      id: 'numeroAsegurados',
      etiqueta: '¿Cuántas personas están incluidas en la póliza?',
      tipo: 'numero',
      min: 1,
      max: 20,
      ayuda: 'Contando al titular. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalAsegurado',
      etiqueta: 'Capital asegurado por persona',
      tipo: 'dinero',
      min: 0,
      max: 100000,
      ayuda: 'Lo que la compañía destina al servicio. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modalidad',
      etiqueta: 'Forma de pago de la prima',
      tipo: 'opcion',
      ayuda: 'Viene en la póliza. Si no lo sabes, déjalo en blanco.',
      opciones: [
        { valor: 'prima_nivelada', etiqueta: 'Nivelada (la prima no sube con la edad)' },
        { valor: 'prima_natural', etiqueta: 'Natural (sube cada año)' },
        { valor: 'seminatural', etiqueta: 'Seminatural (sube, pero suavizada)' },
        { valor: 'prima_unica', etiqueta: 'Pago único (ya está pagada del todo)' },
      ],
    },
  ],

  responsabilidad_civil: [
    {
      id: 'actividad',
      etiqueta: 'Actividad que se asegura',
      tipo: 'texto',
      ayuda: 'A qué te dedicas, en una línea. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'modalidad',
      etiqueta: 'Tipo de responsabilidad civil',
      tipo: 'opcion',
      ayuda: 'Viene en las coberturas de la póliza. Si no lo sabes, déjalo en blanco.',
      opciones: [
        { valor: 'explotacion', etiqueta: 'De explotación (daños causados por la actividad)' },
        { valor: 'patronal', etiqueta: 'Patronal (frente a tus propios trabajadores)' },
        { valor: 'profesional', etiqueta: 'Profesional (errores en tu trabajo)' },
        { valor: 'producto', etiqueta: 'De producto (lo que vendes o fabricas)' },
      ],
    },
    {
      id: 'capitalAsegurado',
      etiqueta: 'Límite asegurado (lo máximo que paga la compañía)',
      tipo: 'dinero',
      min: 0,
      max: 50000000,
      ayuda: 'Suele venir por siniestro y por año. Apunta el que aparezca primero; si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'numeroEmpleados',
      etiqueta: 'Número de empleados',
      tipo: 'numero',
      min: 0,
      max: 10000,
      ayuda: 'Sin contarte a ti si eres autónomo sin personal, pon 0. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'facturacionAnual',
      etiqueta: 'Facturación anual',
      tipo: 'dinero',
      min: 0,
      max: 1000000000,
      ayuda: 'La del último año cerrado, aproximada. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'ambitoTerritorial',
      etiqueta: '¿Dónde cubre?',
      tipo: 'opcion',
      opciones: [
        { valor: 'espana', etiqueta: 'España' },
        { valor: 'ue', etiqueta: 'Unión Europea' },
        { valor: 'mundial', etiqueta: 'Todo el mundo' },
      ],
    },
  ],

  comercio: [
    {
      id: 'actividad',
      etiqueta: 'Actividad del negocio',
      tipo: 'texto',
      ayuda: 'Bar, peluquería, taller, tienda de ropa… Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'direccion',
      etiqueta: 'Dirección del local',
      tipo: 'texto',
      ayuda: 'Calle y número del local asegurado. Si no lo sabes ahora, déjalo en blanco.',
    },
    { id: 'codigoPostal', etiqueta: 'Código postal', tipo: 'texto', desdeCatastro: true },
    {
      id: 'metrosCuadrados',
      etiqueta: 'Metros cuadrados del local',
      tipo: 'numero',
      min: 1,
      max: 50000,
      desdeCatastro: true,
      ayuda: 'Los construidos, incluidos almacén y trastienda. Si no lo sabes, déjalo en blanco: podemos mirarlo en el Catastro.',
    },
    {
      id: 'anioConstruccion',
      etiqueta: 'Año de construcción del edificio',
      tipo: 'numero',
      min: 1800,
      max: ANIO_MAX_CONSTRUCCION,
      desdeCatastro: true,
      ayuda: 'No es el año en que abriste el negocio. Si no lo sabes, déjalo en blanco: podemos mirarlo en el Catastro.',
    },
    {
      id: 'regimen',
      etiqueta: '¿El local es tuyo o de alquiler?',
      tipo: 'opcion',
      opciones: [
        { valor: 'propietario', etiqueta: 'Es mío' },
        { valor: 'inquilino', etiqueta: 'Está alquilado' },
      ],
    },
    {
      id: 'capitalContinente',
      etiqueta: 'Capital del continente (el local en sí)',
      tipo: 'dinero',
      min: 0,
      max: 20000000,
      ayuda: 'Obra, instalaciones fijas y escaparate. Si el local es alquilado, suele asegurarlo el dueño. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalContenido',
      etiqueta: 'Capital del contenido (mobiliario y maquinaria)',
      tipo: 'dinero',
      min: 0,
      max: 5000000,
      ayuda: 'Lo que costaría reponer muebles, equipos y herramientas. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalExistencias',
      etiqueta: 'Capital de las existencias (la mercancía)',
      tipo: 'dinero',
      min: 0,
      max: 10000000,
      ayuda: 'El valor medio del género que tienes en el local. Si no lo sabes, déjalo en blanco.',
    },
  ],

  comunidades: [
    {
      id: 'direccion',
      etiqueta: 'Dirección del edificio',
      tipo: 'texto',
      ayuda: 'La de la comunidad, sin piso ni puerta. Si no lo sabes ahora, déjalo en blanco.',
    },
    { id: 'codigoPostal', etiqueta: 'Código postal', tipo: 'texto', desdeCatastro: true },
    {
      id: 'anioConstruccion',
      etiqueta: 'Año de construcción del edificio',
      tipo: 'numero',
      min: 1800,
      max: ANIO_MAX_CONSTRUCCION,
      desdeCatastro: true,
      ayuda: 'Si no lo sabes, déjalo en blanco: podemos mirarlo en el Catastro.',
    },
    {
      id: 'numeroViviendas',
      etiqueta: 'Número de viviendas y locales',
      tipo: 'numero',
      min: 1,
      max: 2000,
      ayuda: 'Todas las puertas del edificio, incluidos los locales. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalContinente',
      etiqueta: 'Capital del continente (el edificio entero)',
      tipo: 'dinero',
      min: 0,
      max: 100000000,
      ayuda: 'Lo que costaría reconstruirlo, sin el suelo. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'tieneAscensor',
      etiqueta: '¿Tiene ascensor?',
      tipo: 'triestado',
      ayuda: 'Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'tienePiscina',
      etiqueta: '¿Tiene piscina comunitaria?',
      tipo: 'triestado',
      ayuda: 'Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'tieneGarajeComunitario',
      etiqueta: '¿Tiene garaje comunitario?',
      tipo: 'triestado',
      ayuda: 'Si no lo sabes, déjalo en blanco.',
    },
  ],

  // El cajón de sastre: si no encaja en ningún ramo, que al menos se sepa QUÉ se
  // aseguró y con qué límite. Todo texto libre a propósito.
  otros: [
    {
      id: 'objetoAsegurado',
      etiqueta: '¿Qué se asegura?',
      tipo: 'texto',
      ayuda: 'Una embarcación, un caballo, una mascota, un dron… Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'descripcion',
      etiqueta: 'Descripción de la póliza',
      tipo: 'texto',
      ayuda: 'En una línea, lo que cubre. Si no lo sabes, déjalo en blanco.',
    },
    {
      id: 'capitalAsegurado',
      etiqueta: 'Capital o límite asegurado',
      tipo: 'dinero',
      min: 0,
      max: 100000000,
      ayuda: 'Lo máximo que paga la compañía. Si no lo sabes, déjalo en blanco.',
    },
  ],
}

/** Los campos de un ramo, o lista vacía si el ramo no se reconoce. Nunca lanza. */
export function camposDeRamo(ramo: string | null | undefined): readonly CampoRamo[] {
  if (typeof ramo !== 'string') return []
  return CAMPOS_POR_RAMO[ramo as RamoPoliza] ?? []
}

/** Lo que se guarda en `datos_ramo`. Claves del catálogo; nunca `null` dentro. */
export type DatosRamo = Record<string, string | number | boolean>

export type ResultadoDatosRamo = { ok: true; datos: DatosRamo | null } | { ok: false; error: string }

/**
 * Normaliza lo que llega de la pantalla o del extractor contra el catálogo del
 * ramo. Reglas, todas por el mismo motivo (que un «no lo sé» no se guarde
 * disfrazado de dato):
 *
 *  - Clave que no está en el catálogo del ramo → se DESCARTA en silencio. Si se
 *    guardara, un cambio de ramo dejaría los campos del anterior enterrados en
 *    el JSON, invisibles y sin pantalla que los enseñe.
 *  - Cadena vacía, espacios, o valor de cajón (`n/a`, `desconocido`…) → la clave
 *    NO se escribe. Ausente es el «no lo sé» honesto; `''` se cuela por todas
 *    las guardas de NULL.
 *  - Un número que no es número, o fuera de rango → error con el `id` del campo,
 *    no un `0` silencioso.
 *  - Si al final no queda ninguna clave → `datos: null`, que es la columna
 *    vacía, y no un `{}` que parece un objeto lleno de nada.
 */
export function normalizarDatosRamo(ramo: string | null | undefined, entrada: unknown): ResultadoDatosRamo {
  const campos = camposDeRamo(ramo)
  if (campos.length === 0) return { ok: true, datos: null }
  if (entrada === null || entrada === undefined) return { ok: true, datos: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, error: 'datos_ramo_invalidos' }

  const bruto = entrada as Record<string, unknown>
  const datos: DatosRamo = {}

  for (const campo of campos) {
    if (!(campo.id in bruto)) continue
    const valor = bruto[campo.id]
    if (valor === null || valor === undefined) continue

    const normalizado = normalizarValor(campo, valor)
    if (normalizado === 'invalido') return { ok: false, error: `campo_invalido:${campo.id}` }
    if (normalizado === undefined) continue
    datos[campo.id] = normalizado
  }

  return { ok: true, datos: Object.keys(datos).length === 0 ? null : datos }
}

/**
 * Valores de cajón: un «no lo sé» escrito con letras. Se anulan ANTES de que
 * nadie los guarde, porque pasan `IS NULL`, `??` y `COALESCE` sin despeinarse.
 * Es la misma lista de criterio que `poliza-leida.ts`, aplicada aquí porque
 * estos campos no pasan por allí.
 */
const CAJON = new Set([
  '',
  '-',
  '--',
  'n/a',
  'na',
  'nc',
  'no consta',
  'no aplica',
  'desconocido',
  'desconocida',
  'sin datos',
  'sin dato',
  'pendiente',
  'ninguno',
  'ninguna',
  '?',
])

function esCajon(texto: string): boolean {
  return CAJON.has(texto.trim().toLowerCase())
}

const RE_FECHA_RAMO = /^\d{4}-\d{2}-\d{2}$/

/** `undefined` = no se escribe la clave · `'invalido'` = error con nombre del campo. */
function normalizarValor(campo: CampoRamo, valor: unknown): string | number | boolean | undefined | 'invalido' {
  if (campo.tipo === 'triestado') {
    if (typeof valor === 'boolean') return valor
    const t = String(valor).trim().toLowerCase()
    if (t === 'si' || t === 'sí' || t === 'true') return true
    if (t === 'no' || t === 'false') return false
    // «No lo sé» y cualquier otra cosa: la clave no se escribe. Un tri-estado
    // colapsado a `false` le dice al corredor «ha contestado que no» sobre algo
    // que nadie preguntó.
    return undefined
  }

  if (campo.tipo === 'numero' || campo.tipo === 'dinero') {
    if (typeof valor === 'string' && esCajon(valor)) return undefined
    const n = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n)) return 'invalido'
    if (campo.min !== undefined && n < campo.min) return 'invalido'
    if (campo.max !== undefined && n > campo.max) return 'invalido'
    return n
  }

  const texto = String(valor).trim()
  if (esCajon(texto)) return undefined

  if (campo.tipo === 'fecha') {
    if (!RE_FECHA_RAMO.test(texto)) return 'invalido'
    const [a, m, d] = texto.split('-').map(Number)
    const fecha = new Date(Date.UTC(a, m - 1, d))
    // Que la fecha EXISTA: `2026-02-31` lo «arregla» JS solo al 3 de marzo.
    if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return 'invalido'
    return texto
  }

  if (campo.tipo === 'opcion') {
    const ok = (campo.opciones ?? []).some((o) => o.valor === texto)
    return ok ? texto : 'invalido'
  }

  if (texto.length > MAX_TEXTO_RAMO) return 'invalido'
  return texto
}

/** Los ramos del catálogo, para que un test compruebe que no falta ninguno. */
export const RAMOS_CON_CATALOGO: readonly RamoPoliza[] = RAMOS_POLIZA
