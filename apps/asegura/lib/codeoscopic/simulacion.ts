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
// ─── Qué es real aquí y qué está inventado ───────────────────────────────────
// La FORMA sale de dos fuentes reales: el fixture de la cotización del
// 10/06/2026 (`fixtures/codeoscopic/2026-06-10-sandbox-quote-response.json`) y
// el snapshot del portal del fabricante (§ Hogar de `docs/CODEOSCOPIC-API-PORTAL.md`).
// Los nombres de compañía, modalidad y los motivos de error son los reales de
// hogar. **Los importes están INVENTADOS por nosotros**, y por eso no se pueden
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

// ─── La fórmula ──────────────────────────────────────────────────────────────
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
 * Prima anual simulada, en euros y redondeada a céntimos.
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

// ─── Los productos del molde ─────────────────────────────────────────────────
//
// Compañías, modalidades y categorías REALES de hogar. Fiatc sale dos veces a
// propósito (dos configuraciones de la misma compañía), que es justo el caso
// que `tambienDioPrecio` de `respuesta.ts` tiene que saber contar.
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

export const PRODUCTOS_HOGAR: readonly ProductoSimulado[] = [
  {
    vendorId: 12,
    compania: 'Fiatc',
    productoId: 41,
    producto: 'Fiatc Hogar',
    configId: 9101,
    configuracion: 'FIATC Hogar (Grupo Asegura)',
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
    configuracion: 'FIATC Hogar (Grupo Asegura)',
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
 * Compañías que NO dan precio. La pantalla tiene que ejercitar el caso feo —
 * que una compañía conteste pidiendo un dato que no sabíamos que quería— y no
 * solo la fila bonita con la prima. Los cinco motivos son reales.
 */
export const FALLOS_HOGAR: readonly {
  vendorId: number
  compania: string
  productoId: number
  producto: string
  configId: number
  configuracion: string
  motivo: string
}[] = [
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

// ─── Lectura defensiva del cuerpo ────────────────────────────────────────────
type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

/**
 * Saca de la petición lo que la fórmula necesita.
 *
 * Los nombres son los del vendor (`floorArea`, `yearBuilt`, `buildingsLimit`…)
 * porque lo que entra aquí es el cuerpo YA construido. Un capital ausente es
 * `0` a efectos de la fórmula y nada más: aquí no se decide nada de negocio, se
 * inventa un precio de mentira.
 */
export function riesgoDelCuerpo(cuerpo: unknown): RiesgoSimulado {
  const c = obj(cuerpo)
  const riesgo = obj(c.risk)
  const efecto = str(c.effectiveDate)
  const anioEfecto = efecto && /^\d{4}-/.test(efecto) ? Number(efecto.slice(0, 4)) : ANIO_REFERENCIA
  return {
    metrosCuadrados: num(riesgo.floorArea) ?? 0,
    anioConstruccion: num(riesgo.yearBuilt),
    capitalContinente: num(riesgo.buildingsLimit) ?? 0,
    capitalContenido: num(riesgo.contentsLimit) ?? 0,
    perrosPeligrosos: num(riesgo.numberOfDangerousDogs) ?? 0,
    anioEfecto,
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
 */
export function respuestaSimulada(cuerpo: unknown): Json {
  const c = obj(cuerpo)
  const riesgo = riesgoDelCuerpo(cuerpo)
  const efecto = str(c.effectiveDate)
  const h = huella(cuerpo)

  const mainQuotes = PRODUCTOS_HOGAR.map((p, i) => ({
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
    downPayment: primaSimulada(riesgo, p.factor),
    premium: primaSimulada(riesgo, p.factor),
    termMonths: 12,
    // Siempre `true`: un precio simulado no puede salir NUNCA como `firme`.
    estimate: true,
    actions: [{ id: 'ReRate', required: true, addressNormalizationRequired: false }],
    policyApplicationSupported: true,
  }))

  const errors = FALLOS_HOGAR.map((f) => ({
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
export function cotizacionSimulada(cuerpo: unknown): Cotizacion {
  return leerCotizacion(respuestaSimulada(cuerpo))
}
