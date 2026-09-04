// Generador de cotizaciones SIMULADAS. PURO: entra el cuerpo que se iba a
// mandar al vendor, sale el MISMO JSON que devolvería él.
//
// ─── Para qué existe ─────────────────────────────────────────────────────────
// Cada `POST /insurances` real cuesta 0,50€ y hoy el libro de consumo está
// vacío. Para poder ver la pantalla de retarificar entera —con precios, con
// avisos y con compañías que fallan— sin gastar y sin estar conectados, el
// embudo tiene un modo simulación (`CODEOSCOPIC_SIMULACION=true`, en el
// ENTORNO DEL SERVIDOR; ver `config.ts`).
//
// ─── Por qué el JSON crudo y no un objeto ya montado ─────────────────────────
// La respuesta simulada entra por LA MISMA PUERTA que la real: `leerCotizacion`
// de `respuesta.ts`. Eso es lo que hace que la simulación valga para algo — si
// el parser se rompe o el contrato del vendor cambia, la simulación se rompe
// igual y se ve en la pantalla. Un mock que devolviera `Cotizacion` ya hecha
// probaría la pantalla contra sí misma.
//
// ─── 🚨 UN MOLDE POR RAMO, y por qué (fallo medido el 03/09/2026) ────────────
// Este fichero nació SOLO para hogar (productos de hogar, fórmula por m² y
// capitales) pero `cotizar()` lo usaba para cualquier ramo. Consecuencia medida
// en producción: al simular una póliza de AUTO (un SMART FORFOUR) la pantalla
// enseñó tres precios de HOGAR —Fiatc Hogar, Mapfre Hogar— y, como el cuerpo de
// auto no trae ni m² ni capitales, las primas se desplomaron a los gastos fijos
// de la fórmula de hogar: **49,60€ / 68,80€ / 84,80€**. Una prima de auto de
// 49,60€ no existe: el fixture real de auto va de 251,77€ a 647,78€.
//
// Los dos fallos son el mismo: **un molde de un ramo aplicado a otro**. Uno se
// ve (compañías que no cotizan coches) y el otro no (un número plausible pero
// de otro mundo), que es el caro. Desde ahora el ramo VIAJA hasta aquí y elige
// molde, y un ramo declarado del que no tenemos molde **no inventa productos de
// otro**: devuelve cero precios y lo dice (ver `moldeDeRamo`).
//
// ─── Qué es real aquí y qué está inventado ───────────────────────────────────
// La FORMA sale de dos fuentes reales: el fixture de la cotización del
// 10/06/2026 (`fixtures/codeoscopic/2026-06-10-sandbox-quote-response.json`) y
// el snapshot del portal del fabricante (§ Hogar de `docs/CODEOSCOPIC-API-PORTAL.md`).
// Los nombres de compañía, modalidad y los motivos de error son los reales del
// ramo. **Los importes están INVENTADOS por nosotros**, y por eso no se pueden
// confundir con los de una compañía:
//   - el embudo los devuelve con `simulado: true` (dato, no texto);
//   - no se anota nada en `seguros.codeoscopic_consumo` (no ha costado nada);
//   - todos salen `estimate: true` → firmeza `estimado`, nunca `firme`;
//   - el `projectId` es NEGATIVO: ningún proyecto de Codeoscopic lo es;
//   - el primer aviso de cada precio y de cada fallo es `MARCA_SIMULACION`.
//
// ⚠️ El `id` de un precio viaja como STRING (`"Q7601460"` en el fixture real).
// `leerPrecio` descarta un precio cuyo `id` no sea una cadena, así que un id
// numérico aquí haría que la simulación devolviera CERO precios sin fallar.

import { leerCotizacion, type Cotizacion } from './respuesta.ts'

/** Frase que acompaña a cada precio y a cada fallo simulado. */
export const MARCA_SIMULACION =
  'SIMULACIÓN: precio inventado por central para probar la pantalla. Ninguna compañía lo ha dado ' +
  'y no se ha gastado ni un céntimo.'

/** Año al que se refiere la antigüedad cuando el cuerpo no trae fecha de efecto. */
export const ANIO_REFERENCIA = 2026

// ─── La fórmula de HOGAR ─────────────────────────────────────────────────────
//
// Determinista y comentada a propósito: un precio que baila en cada recarga no
// sirve para probar nada, y uno aleatorio tampoco deja comparar dos pantallas.
// Sale SOLO de lo que ya viaja en el cuerpo (superficie, año, capitales,
// perros), así que la misma póliza da siempre el mismo importe.
//
// Calibrado contra la cartera real: la prima media de hogar es 308,71€/año. Con
// el caso verificado (76 m², 1994, 61.000€ de continente y 12.000€ de contenido)
// la prima de mercado sale ≈360€ y los tres productos caen entre ~224€ y ~383€.
export const FORMULA = {
  /** Gastos fijos de una póliza de hogar. */
  fija: 80,
  /** Por m² construido: es lo que más mueve la prima. */
  porM2: 1.35,
  /** Del capital de continente (obra). */
  pctContinente: 0.0018,
  /** Del capital de contenido (más caro por m²: es lo que se roba). */
  pctContenido: 0.0045,
  /** Por año de antigüedad del edificio (instalaciones viejas ⇒ más siniestros). */
  porAnioAntiguedad: 0.45,
  /** Tope de antigüedad: a partir de aquí el recargo no crece más. */
  topeAntiguedad: 60,
  /** Por perro potencialmente peligroso (responsabilidad civil). */
  porPerro: 15,
} as const

/** Lo que la fórmula necesita del riesgo. Todo sale del cuerpo que iba a viajar. */
export type RiesgoSimulado = {
  metrosCuadrados: number
  anioConstruccion: number | null
  capitalContinente: number
  capitalContenido: number
  perrosPeligrosos: number
  /** Año de la cotización, para medir la antigüedad sin mirar el reloj. */
  anioEfecto: number
}

/**
 * Prima anual simulada de HOGAR, en euros y redondeada a céntimos.
 *
 * `factor` es el posicionamiento del producto (una básica es más barata que una
 * todo riesgo). Puro y determinista: mismos datos ⇒ mismo importe.
 */
export function primaSimulada(r: RiesgoSimulado, factor: number): number {
  const antiguedad =
    r.anioConstruccion === null
      ? 0
      : Math.min(Math.max(r.anioEfecto - r.anioConstruccion, 0), FORMULA.topeAntiguedad)

  const mercado =
    FORMULA.fija +
    FORMULA.porM2 * r.metrosCuadrados +
    FORMULA.pctContinente * r.capitalContinente +
    FORMULA.pctContenido * r.capitalContenido +
    FORMULA.porAnioAntiguedad * antiguedad +
    FORMULA.porPerro * r.perrosPeligrosos

  return Math.round(mercado * factor * 100) / 100
}

// ─── La fórmula de AUTO ──────────────────────────────────────────────────────
//
// La de hogar no vale aquí: el cuerpo de auto (`CreateInsuranceRequest_V1`, ver
// `peticion-auto.ts`) no trae m² ni capitales, así que aplicarla dejaba la prima
// en los gastos fijos. Esta usa SOLO lo que de verdad viaja en ese cuerpo:
// fecha de matriculación, fecha de nacimiento del conductor, kilómetros al año,
// años sin siniestros y si estaba asegurado antes.
//
// 🚫 Lo que NO se usa, y por qué: `garageType.id`. Es un id de un catálogo VIVO
// (`GET /car/garage-types`) del que solo hemos visto UNO en toda la
// documentación (`CommunalParking`, traspaso de Manuel §4). Ponerle precio a
// ids que no hemos visto sería inventar una tabla; se prefiere no mover la
// prima a moverla con un mapa adivinado.
//
// ─── Cómo está calibrada (y contra qué) ──────────────────────────────────────
// Contra el fixture REAL de auto del 10/06/2026 (18 precios, `insuranceLine`
// `Car`): sus primas van de **251,77€ a 1.604,34€**, con mediana 486,88€.
// `base` está elegida para que, con el PERFIL DE REFERENCIA de abajo, cada
// producto reproduzca ±0,25€ la prima real de su fila del fixture — o sea, la
// horquilla que sale de fábrica es la del fixture: **251,62€ – 647,68€**.
//
// ⚠️ Honestidad sobre el perfil: el fixture es una RESPUESTA, no trae la
// petición, así que el perfil de referencia (45 años, coche de 8, 12.000 km,
// 5 años sin siniestros) es NUESTRO, no el de esa cotización. Lo que se toma
// del fixture son las PRIMAS; el perfil es el ancla que las hace reproducibles.
export const FORMULA_AUTO = {
  /**
   * Prima de mercado anual del perfil de referencia, antes del factor de
   * producto. 460€: es el valor con el que los seis factores de `PRODUCTOS_AUTO`
   * devuelven las primas reales del fixture.
   */
  base: 460,

  /** El riesgo «del medio». Cada factor vale exactamente 1 en este punto. */
  perfil: {
    /** Años del conductor principal. */
    edad: 45,
    /** Años desde la matriculación. */
    antiguedadVehiculo: 8,
    kmAnuales: 12000,
    aniosSinSiniestros: 5,
  },

  /** Por año POR DEBAJO de 45: la juventud es el factor que más encarece auto. */
  porAnioJoven: 0.028,
  /** Por año POR ENCIMA de 45: la experiencia abarata, pero mucho menos. */
  porAnioVeterano: 0.004,
  /** Topes del factor de edad. El de arriba lo alcanza un conductor de ~19 años. */
  edadMin: 0.9,
  edadMax: 1.75,

  /** Por año de desviación sobre 8: un coche viejo vale menos y se indemniza menos. */
  porAnioVehiculo: 0.01,
  vehiculoMin: 0.85,
  vehiculoMax: 1.12,

  /** Por cada 1.000 km/año de desviación sobre 12.000: más calle, más siniestros. */
  porMilKm: 0.008,
  kmMin: 0.92,
  kmMax: 1.2,

  /** Por año de desviación sobre 5 sin siniestros (el bonus de toda la vida). */
  porAnioSinSiniestros: 0.015,
  bonusMin: 0.78,
  bonusMax: 1.12,

  /**
   * Recargo si el cuerpo dice EXPRESAMENTE que no había seguro antes
   * (`previouslyInsured: false`): sin historial no hay bonus que aplicar.
   * Si el campo no viene, no se recarga: «no lo sé» no es «no tenía».
   */
  recargoSinHistorial: 0.15,
} as const

/** Lo que la fórmula de auto necesita. `null` = el cuerpo no lo traía. */
export type RiesgoAutoSimulado = {
  anioMatriculacion: number | null
  anioNacimientoConductor: number | null
  kmAnuales: number | null
  aniosSinSiniestros: number | null
  /** `null` = el cuerpo no lo declaraba; NO es «no estaba asegurado». */
  aseguradoAntes: boolean | null
  /** Año de la cotización, para medir edades sin mirar el reloj. */
  anioEfecto: number
}

const entre = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max)

/**
 * Prima anual simulada de AUTO, en euros y redondeada a céntimos.
 *
 * Multiplicativa: una base de mercado por un factor por cada dato del riesgo.
 * Cada factor vale 1 en el perfil de referencia Y cuando el dato no viene, así
 * que **un cuerpo sin datos devuelve la horquilla del fixture** en vez de caer
 * a los gastos fijos — que es exactamente el fallo que este molde repara.
 */
export function primaAutoSimulada(r: RiesgoAutoSimulado, factor: number): number {
  const F = FORMULA_AUTO

  // Edad del conductor, medida contra la FECHA DE EFECTO y no contra el reloj:
  // si mirase `new Date()`, el mismo cuerpo daría otro precio cada 1 de enero.
  let fEdad = 1
  if (r.anioNacimientoConductor !== null) {
    const edad = r.anioEfecto - r.anioNacimientoConductor
    const dev = edad - F.perfil.edad
    fEdad = entre(1 + (dev < 0 ? -dev * F.porAnioJoven : -dev * F.porAnioVeterano), F.edadMin, F.edadMax)
  }

  let fVehiculo = 1
  if (r.anioMatriculacion !== null) {
    const antiguedad = Math.max(r.anioEfecto - r.anioMatriculacion, 0)
    fVehiculo = entre(
      1 - (antiguedad - F.perfil.antiguedadVehiculo) * F.porAnioVehiculo,
      F.vehiculoMin,
      F.vehiculoMax,
    )
  }

  let fKm = 1
  if (r.kmAnuales !== null) {
    fKm = entre(1 + ((r.kmAnuales - F.perfil.kmAnuales) / 1000) * F.porMilKm, F.kmMin, F.kmMax)
  }

  let fBonus = 1
  if (r.aniosSinSiniestros !== null) {
    fBonus = entre(
      1 - (r.aniosSinSiniestros - F.perfil.aniosSinSiniestros) * F.porAnioSinSiniestros,
      F.bonusMin,
      F.bonusMax,
    )
  }

  // Solo el `false` explícito recarga. `null` es «no se ha declarado».
  const fHistorial = r.aseguradoAntes === false ? 1 + F.recargoSinHistorial : 1

  const mercado = F.base * fEdad * fVehiculo * fKm * fBonus * fHistorial
  return Math.round(mercado * factor * 100) / 100
}

// ─── Los productos del molde ─────────────────────────────────────────────────
type ProductoSimulado = {
  vendorId: number
  compania: string
  productoId: number
  producto: string
  configId: number
  configuracion: string
  modalidad: string
  categoria: string
  rating: number
  factor: number
  /** Observaciones de la compañía, con la forma real (`text` + `description`). */
  observacion?: string
}

type FalloSimulado = {
  vendorId: number
  compania: string
  productoId: number
  producto: string
  configId: number
  configuracion: string
  motivo: string
}

// Compañías, modalidades y categorías REALES de hogar. Fiatc sale dos veces a
// propósito (dos modalidades de la misma compañía), que es justo el caso que
// `tambienDioPrecio` de `respuesta.ts` tiene que saber contar.
export const PRODUCTOS_HOGAR: readonly ProductoSimulado[] = [
  {
    vendorId: 12,
    compania: 'Fiatc',
    productoId: 41,
    producto: 'Fiatc Hogar',
    configId: 9101,
    configuracion: 'FIATC Hogar (Grupo ASegura)',
    modalidad: 'FIATC Oferta BASIC',
    categoria: 'Básico',
    rating: 3,
    factor: 0.62,
    observacion: 'Continente y contenido a valor de reposición. Franquicia general 150€.',
  },
  {
    vendorId: 12,
    compania: 'Fiatc',
    productoId: 41,
    producto: 'Fiatc Hogar',
    configId: 9101,
    configuracion: 'FIATC Hogar (Grupo ASegura)',
    modalidad: 'FIATC Oferta AMPLIA',
    categoria: 'Ampliado',
    rating: 4,
    factor: 0.86,
    observacion: 'Incluye daños eléctricos y asistencia en el hogar 24 h.',
  },
  {
    vendorId: 1,
    compania: 'Mapfre',
    productoId: 7,
    producto: 'Mapfre Hogar',
    configId: 8420,
    configuracion: 'MAPFRE Hogar (C0058)',
    modalidad: 'Mapfre Hogar Multirriesgo',
    categoria: 'Todo Riesgo',
    rating: 4,
    factor: 1.06,
  },
]

/**
 * Los productos de AUTO. Compañía, producto, `vendorId`, `productoId`,
 * `configId`, modalidad, categoría y rating **están COPIADOS del fixture real**
 * de auto (`2026-06-10-sandbox-quote-response.json`), no inventados. Las
 * categorías de auto son las suyas —«Terceros», «Terceros Ampliado», «Todo
 * Riesgo Con Franquicia…»—, que no se parecen a las de hogar.
 *
 * `factor` = prima real de esa fila del fixture ÷ `FORMULA_AUTO.base` (460€),
 * redondeado a tres decimales. Por eso el perfil de referencia reproduce el
 * fixture y el mercado sale ordenado: terceros más barato que todo riesgo.
 *
 * Reale y Occident aparecen DOS veces cada una (dos modalidades del mismo
 * producto), como en el fixture: es lo que obliga a `tambienDioPrecio` a contar
 * bien. Y Reale además falla en su OTRA configuración (ver `FALLOS_AUTO`), que
 * es el caso `tambienDioPrecio: true` — el que el molde de hogar no ejercitaba.
 */
export const PRODUCTOS_AUTO: readonly ProductoSimulado[] = [
  {
    vendorId: 5,
    compania: 'Reale',
    productoId: 10,
    producto: 'Reale Autos',
    configId: 7470,
    configuracion: '83474 (ASM y API)',
    modalidad: 'Reale Terceros',
    categoria: 'Terceros',
    rating: 3,
    factor: 0.547, // 251,77€ en el fixture
    observacion:
      'CT-N5: NECESARIO DOCUMENTO ORIGINAL ACREDITATIVO BONIFICACION.INCLUIR DOCUMENTACIÓN!!!',
  },
  {
    vendorId: 14,
    compania: 'Mutua Madrileña',
    productoId: 193,
    producto: 'Mutua Madrileña Autos',
    configId: 7476,
    configuracion: 'MutuaMad',
    modalidad: 'Mutua Madrileña Terceros con lunas',
    categoria: 'Terceros Ampliado',
    rating: 3,
    factor: 0.558, // 256,46€ en el fixture
    observacion: 'Descuentos de siniestralidad',
  },
  {
    vendorId: 29,
    compania: 'Occident',
    productoId: 178,
    producto: 'Occident GCO Autos 3.0',
    configId: 7903,
    configuracion: 'OccidentAutosTEST',
    modalidad: 'Terceros',
    categoria: 'Terceros',
    rating: 0,
    factor: 0.591, // 271,65€ en el fixture
    observacion:
      '107.Emisión SUPEDITADA. Compañía no sinco sin certificado de antecedentes siniestrales.',
  },
  {
    vendorId: 5,
    compania: 'Reale',
    productoId: 10,
    producto: 'Reale Autos',
    configId: 7470,
    configuracion: '83474 (ASM y API)',
    modalidad: 'Reale Terceros Ampliado',
    categoria: 'Terceros Ampliado',
    rating: 3,
    factor: 0.706, // 324,53€ en el fixture
  },
  {
    vendorId: 29,
    compania: 'Occident',
    productoId: 178,
    producto: 'Occident GCO Autos 3.0',
    configId: 7903,
    configuracion: 'OccidentAutosTEST',
    modalidad: 'Todo Riesgo con franquicia 1000',
    categoria: 'Todo Riesgo Con Franquicia Alta',
    rating: 0,
    factor: 0.956, // 439,85€ en el fixture
  },
  {
    vendorId: 5,
    compania: 'Reale',
    productoId: 10,
    producto: 'Reale Autos',
    configId: 7470,
    configuracion: '83474 (ASM y API)',
    modalidad: 'Reale Todo Riesgo Franquicia 450 Euros',
    categoria: 'Todo Riesgo Con Franquicia Media',
    rating: 3,
    factor: 1.408, // 647,78€ en el fixture
    observacion:
      '3009.PRIMA NO CONFIRMADA. Debido a la antigüedad del vehículo es necesario realizar una ' +
      'inspección del vehículo.',
  },
]

/**
 * Compañías que NO dan precio. La pantalla tiene que ejercitar el caso feo —
 * que una compañía conteste pidiendo un dato que no sabíamos que quería— y no
 * solo la fila bonita con la prima. Los cinco motivos son reales.
 */
export const FALLOS_HOGAR: readonly FalloSimulado[] = [
  {
    vendorId: 21,
    compania: 'Lagun Aro',
    productoId: 63,
    producto: 'Lagun Aro Hogar',
    configId: 7712,
    configuracion: 'LagunAro Hogar',
    motivo: 'Es obligatorio indicar los años de las ultimas reformas realizadas.',
  },
  {
    vendorId: 5,
    compania: 'Reale',
    productoId: 18,
    producto: 'Reale Hogar',
    configId: 7470,
    configuracion: 'Reale Hogar (ASM y API)',
    motivo: 'Error de conexión con la compañía',
  },
  {
    vendorId: 9,
    compania: 'Catalana',
    productoId: 26,
    producto: 'Catalana Hogar',
    configId: 8003,
    configuracion: 'Catalana Occidente Hogar',
    motivo: 'Error de conexión con la compañía',
  },
  {
    vendorId: 33,
    compania: 'Mutua Tinerfeña',
    productoId: 88,
    producto: 'Mutua Tinerfeña Hogar',
    configId: 9310,
    configuracion: 'MutuaTfe Hogar',
    motivo: 'No se permite asegurar viviendas fuera de las Islas Canarias',
  },
  {
    vendorId: 40,
    compania: 'Mussap',
    productoId: 95,
    producto: 'Mussap Hogar',
    configId: 9522,
    configuracion: 'MUSSAP Hogar',
    motivo: 'Garantía obligatoria no definida',
  },
]

/**
 * Las tres compañías que NO dieron precio en el fixture real de auto, con su
 * `vendorId`, su configuración y su motivo EXACTOS. No hay ninguna inventada.
 *
 * 🎯 La segunda es la interesante: **Reale falla en la config 7469 y cotiza en
 * la 7470**, así que su fallo sale con `tambienDioPrecio: true`. Las otras dos
 * (Pelayo y Zurich) no cotizan en ninguna, así que salen en `false`. Con eso el
 * molde de auto ejercita las DOS ramas de `tambienDioPrecio` — el de hogar solo
 * ejercitaba la falsa.
 */
export const FALLOS_AUTO: readonly FalloSimulado[] = [
  {
    vendorId: 3,
    compania: 'Pelayo',
    productoId: 4,
    producto: 'Pelayo Autos',
    configId: 8732,
    configuracion: 'PelayoAutos_Test',
    motivo: 'Hay otra matricula igual en ACTIVO (n1)',
  },
  {
    vendorId: 5,
    compania: 'Reale',
    productoId: 10,
    producto: 'Reale Autos',
    configId: 7469,
    configuracion: '37786__',
    motivo:
      'Se ha producido un error en el envío (Código 2115). Por favor contacte con el departamento ' +
      'de soporte de Avant2.',
  },
  {
    vendorId: 30,
    compania: 'Zurich',
    productoId: 127,
    producto: 'Zurich Autos 00721',
    configId: 7475,
    configuracion: 'ZurichTest',
    motivo: 'La matrícula introducida ya está asegurada en la compañía',
  },
]

// ─── Lectura defensiva del cuerpo ────────────────────────────────────────────
type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** El año de una fecha `AAAA-MM-DD` del vendor. `null` si no la trae o no lo es. */
function anioDe(v: unknown): number | null {
  const s = str(v)
  return s && /^\d{4}-/.test(s) ? Number(s.slice(0, 4)) : null
}

/** El año de efecto del cuerpo, o el de referencia. Nunca el reloj. */
function anioEfectoDe(c: Json): number {
  return anioDe(c.effectiveDate) ?? ANIO_REFERENCIA
}

/**
 * Saca de la petición lo que la fórmula de HOGAR necesita.
 *
 * Los nombres son los del vendor (`floorArea`, `yearBuilt`, `buildingsLimit`…)
 * porque lo que entra aquí es el cuerpo YA construido. Un capital ausente es
 * `0` a efectos de la fórmula y nada más: aquí no se decide nada de negocio, se
 * inventa un precio de mentira.
 */
export function riesgoDelCuerpo(cuerpo: unknown): RiesgoSimulado {
  const c = obj(cuerpo)
  const riesgo = obj(c.risk)
  return {
    metrosCuadrados: num(riesgo.floorArea) ?? 0,
    anioConstruccion: num(riesgo.yearBuilt),
    capitalContinente: num(riesgo.buildingsLimit) ?? 0,
    capitalContenido: num(riesgo.contentsLimit) ?? 0,
    perrosPeligrosos: num(riesgo.numberOfDangerousDogs) ?? 0,
    anioEfecto: anioEfectoDe(c),
  }
}

/**
 * Saca de la petición lo que la fórmula de AUTO necesita. Los nombres son los
 * de `construirPeticionAuto` (`peticion-auto.ts`), que es quien monta el cuerpo.
 *
 * 🚨 Lo que falta se devuelve como `null`, NUNCA como 0: un 0 en kilómetros o en
 * años sin siniestros es una respuesta válida del formulario, y colapsar las dos
 * cosas convertiría un «no lo sé» en un dato — con precio distinto.
 */
export function riesgoAutoDelCuerpo(cuerpo: unknown): RiesgoAutoSimulado {
  const c = obj(cuerpo)
  const riesgo = obj(c.risk)
  // El conductor principal y el tomador son la MISMA persona por contrato del
  // vendor (ver `peticion-auto.ts`); se mira primero el conductor porque es de
  // quien depende el precio, y el tomador es el respaldo.
  const conductor = obj(riesgo.primaryDriver)
  const previa = obj(riesgo.previousInsurance)
  return {
    anioMatriculacion: anioDe(riesgo.registrationDate),
    anioNacimientoConductor: anioDe(conductor.birthDate) ?? anioDe(obj(c.holder).birthDate),
    kmAnuales: num(riesgo.kilometersPerYear),
    aniosSinSiniestros: num(previa.yearsWithoutAccidents),
    aseguradoAntes: bool(riesgo.previouslyInsured),
    anioEfecto: anioEfectoDe(c),
  }
}

/**
 * Identificador estable del cuerpo (FNV-1a). Sirve para que la misma póliza dé
 * siempre el mismo `projectId` simulado y los mismos ids de precio.
 */
export function huella(cuerpo: unknown): number {
  let json: string
  try {
    json = JSON.stringify(cuerpo) ?? ''
  } catch {
    json = ''
  }
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * `projectId` simulado. **Negativo a propósito**: los de Codeoscopic son
 * enteros positivos, así que un id negativo en la BD o en un log delata al
 * instante que esa cotización no la hizo ninguna compañía.
 */
export function projectIdSimulado(cuerpo: unknown): number {
  return -(100000 + (huella(cuerpo) % 900000))
}

// ─── Qué molde toca ──────────────────────────────────────────────────────────

/** Los moldes que existen. `sin-molde` es un ramo declarado que no tenemos. */
export type MoldeRamo = 'auto' | 'hogar' | 'sin-molde'

/** Valores de cajón: son «no lo he sabido leer», no un ramo. */
const CENTINELAS = new Set(['', 'otro', 'otros', 'desconocido', 'n/a', 'na', 'sin clasificar'])

/**
 * Qué molde le toca a un ramo. Tres salidas, no dos:
 *
 * - **no declarado** (`undefined`, vacío o un centinela) → `hogar`. Es el
 *   comportamiento histórico y el de los llamantes que aún no propagan el
 *   contexto (`PeticionCotizacion.contexto` es OPCIONAL). No se cambia por no
 *   romper lo que ya funciona.
 * - **`auto` / `hogar`** → su molde.
 * - **cualquier otro ramo DECLARADO** (`moto`, `rc`, `vida`…) → `sin-molde`:
 *   cero precios y un fallo que lo explica. Un ramo que el usuario ha nombrado
 *   y del que no tenemos molde **no puede tomar prestados los productos de
 *   otro**: eso es justo el fallo del 03/09/2026, y salir vacío diciendo por
 *   qué es preferible a enseñar compañías que no cotizan ese ramo.
 */
export function moldeDeRamo(ramo?: string | null): MoldeRamo {
  const r = (ramo ?? '').trim().toLowerCase()
  if (CENTINELAS.has(r)) return 'hogar'
  if (r === 'auto') return 'auto'
  if (r === 'hogar') return 'hogar'
  return 'sin-molde'
}

function mensajes(observacion: string | undefined): Json[] {
  const out: Json[] = [
    { type: 'info', text: 'Simulación', description: MARCA_SIMULACION },
  ]
  if (observacion) {
    out.push({ type: 'info', text: 'Observaciones de la compañía', description: observacion })
  }
  return out
}

/**
 * Respuesta CRUDA, con la forma exacta de `POST /insurances`. Es lo que se le
 * da a `leerCotizacion` — la misma puerta que la respuesta real.
 *
 * `ramo` es el de `ContextoCotizacion` (`auto` | `hogar`), y es lo que elige el
 * molde. Opcional porque el contexto lo es; ver `moldeDeRamo`.
 */
export function respuestaSimulada(cuerpo: unknown, ramo?: string | null): Json {
  const c = obj(cuerpo)
  const efecto = str(c.effectiveDate)
  const h = huella(cuerpo)
  const molde = moldeDeRamo(ramo)

  const productos: readonly ProductoSimulado[] =
    molde === 'auto' ? PRODUCTOS_AUTO : molde === 'hogar' ? PRODUCTOS_HOGAR : []

  // Cada molde con SU fórmula. La de hogar sobre un cuerpo de auto daba 49,60€.
  const prima =
    molde === 'auto'
      ? (() => {
          const r = riesgoAutoDelCuerpo(cuerpo)
          return (factor: number) => primaAutoSimulada(r, factor)
        })()
      : (() => {
          const r = riesgoDelCuerpo(cuerpo)
          return (factor: number) => primaSimulada(r, factor)
        })()

  const mainQuotes = productos.map((p, i) => ({
    // String, no número: `leerPrecio` descarta un precio sin `id` de texto.
    id: `SIM-${h.toString(16)}-${i + 1}`,
    ...(efecto ? { effectiveDate: efecto } : {}),
    product: {
      id: p.productoId,
      name: p.producto,
      addon: false,
      vendor: { id: p.vendorId, name: p.compania },
      modality: {
        name: p.modalidad,
        description: p.modalidad,
        category: { name: p.categoria },
        rating: p.rating,
        ratingDescription: p.modalidad,
      },
      config: { id: p.configId, name: p.configuracion, favorite: false },
    },
    paymentMethod: { id: 'Company', name: 'Compañía', description: 'Bancario por la compañía de seguros' },
    paymentFrequency: { id: 'Annual', name: 'Anual', description: 'Una vez al año', installments: 1 },
    messages: mensajes(p.observacion),
    downPayment: prima(p.factor),
    premium: prima(p.factor),
    termMonths: 12,
    // Siempre `true`: un precio simulado no puede salir NUNCA como `firme`.
    estimate: true,
    actions: [{ id: 'ReRate', required: true, addressNormalizationRequired: false }],
    policyApplicationSupported: true,
  }))

  const fallos: readonly FalloSimulado[] =
    molde === 'auto' ? FALLOS_AUTO : molde === 'hogar' ? FALLOS_HOGAR : []

  const errors: Json[] = fallos.map((f) => ({
    product: {
      id: f.productoId,
      name: f.producto,
      addon: false,
      vendor: { id: f.vendorId, name: f.compania },
      config: { id: f.configId, name: f.configuracion, favorite: false },
    },
    messages: [
      { type: 'info', text: 'Simulación', description: MARCA_SIMULACION },
      { type: 'error', text: 'Error', description: f.motivo },
    ],
  }))

  // Ramo declarado sin molde: se dice, no se rellena con otro ramo.
  if (molde === 'sin-molde') {
    errors.push({
      product: {
        name: `ramo «${str(ramo) ?? ''}»`,
        addon: false,
        vendor: { name: 'Simulación (sin molde)' },
      },
      messages: [
        { type: 'info', text: 'Simulación', description: MARCA_SIMULACION },
        {
          type: 'error',
          text: 'Error',
          description:
            `La simulación no tiene molde para el ramo «${str(ramo) ?? ''}»: hoy solo hay auto y ` +
            'hogar. No se enseñan precios de otro ramo, que serían compañías y primas de un ' +
            'producto distinto. Para verlo de verdad hay que cotizar con el interruptor apagado.',
        },
      ],
    })
  }

  return {
    // Negativo: ningún proyecto real de Codeoscopic lo es.
    id: projectIdSimulado(cuerpo),
    ...(efecto ? { effectiveDate: efecto } : {}),
    insuranceLine: obj(c.insuranceLine),
    mainQuotes,
    addonQuotes: [],
    errors,
  }
}

/**
 * La cotización simulada YA PARSEADA, por el mismo `leerCotizacion` que la real.
 *
 * Si el parser cambia o se rompe, esto se rompe con él — que es exactamente lo
 * que se quiere de un simulador.
 */
export function cotizacionSimulada(cuerpo: unknown, ramo?: string | null): Cotizacion {
  return leerCotizacion(respuestaSimulada(cuerpo, ramo))
}
