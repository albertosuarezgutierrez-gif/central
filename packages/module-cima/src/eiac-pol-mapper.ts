/**
 * LOO-522 (épica CIMA LOO-515) — Mapper PURO de un EIAC POL parseado a la forma
 * intermedia `EiacPolMapped` que el pipeline de ingesta (PR-5/LOO-523) y el
 * persist (PR-7/LOO-524) consumen.
 *
 * CONTRATO DE ENTRADA — anclado al catálogo `Intelligence/ecosystem/cima-eiac-fields.md`
 * (derivado de los XMLs de homologación reales, EIAC 6.0). Rutas verificadas:
 *   - raíz `<ProcesosEIAC>` → `<Objetos>` → `<Poliza>` (manejamos el wrapper
 *     ProcesosEIAC defensivamente: el adapter puede o no conservarlo).
 *   - `DatosPoliza/IdPoliza`, `DatosPoliza/CodigoEntidad/CodigoDGS`,
 *     `DatosPoliza/DatosRamo/{RamoDGS,DescripcionRamo}`, `SituacionPoliza`.
 *   - `Fechas/{FechaEfectoInicial,FechaVencimiento,FechaFinSeguro}`. OJO: el EIAC
 *     6.0 NO tiene `FechaEfectoFinal` (era un nombre supuesto en el playbook); el
 *     fallback real de vencimiento es `FechaFinSeguro`.
 *   - `DatosRiesgos/Riesgo[]` con choice `RiesgoAutos|RiesgoHogar|RiesgoVida|...`;
 *     `RiesgoAutos/Vehiculo/CategoriaVehiculo` (§13.3.4: CA/MO/TU) distingue auto vs
 *     moto y, si falta, `ClaseVehiculo` (§13.3.16: MT/CI moto; MO = MONOVOLUMEN).
 *   - `Tomador`/`Asegurado` → `PersonaFisica|PersonaJuridica`.
 * GATE pre-flag (decisión operador s197): validar contra ≥1 EIAC POL prod real
 * (Allianz) antes de habilitar `CIMA_INGESTA_ENABLED`. El routing defensivo a
 * `review` cubre cualquier divergencia mientras tanto.
 *
 * Diseño (decisiones operador LOCKED):
 *  - SOLO la PII del **Tomador** se promueve a `clientes`. El **Asegurado**,
 *    Propietario, Conductores y OtrasFiguras se extraen como **intervinientes**
 *    (`intervinientes: MappedInterviniente[]`) y el persist los inserta en
 *    `poliza_intervinientes` con PII Tier-1 CIFRADA (Art.14 LOPD-GDD). LOO-752
 *    (D6, decisión LOPD D1=A): el asegurado distinto del tomador YA NO manda la
 *    póliza a review (`art14_asegurado_distinto` eliminada) — se persiste cifrado.
 *  - **Salud** (bloque `<RiesgoSalud>`): `outcome='review_salud'` (defensivo; el
 *    feed prod de Alberto no trae salud, ASISA fuera de CIMA).
 *  - **Producto** (tipoSeguro) por el bloque `<RiesgoXxx>`, NO por RamoDGS (el
 *    código de ramo es dato no fiable — `cima-eiac-fields`). No clasificable →
 *    `tipoSeguro=null` + `outcome='review'`.
 *  - **fechaVencimiento**: `FechaVencimiento ?? FechaFinSeguro`; `fechaEfectoInicial`
 *    de `FechaEfectoInicial`. Si falta cualquiera → `outcome='review'` (NO derivar
 *    inicio+1año; CIMA es fuente de verdad, fecha inventada = dato malo).
 *  - Función PURA: sin BD, sin red, sin crypto, sin process.env. El dniLookupHash,
 *    el resolveCliente y el matching ocurren en PR-5/PR-7.
 *
 * Toda navegación es defensiva (optional chaining + asArray): fast-xml-parser
 * colapsa arrays de 1 elemento a objeto y nunca lanzamos por datos basura.
 */

// LOO-828 — catálogo DGS→nombre de compañía (client-safe, puro; no rompe el
// contrato "sin BD, sin red, sin crypto" del mapper).
import { camposCimaExtra, conCimaExtra } from "./cima-extra.ts";
import { codigoDgsDe, codigoEntidadFormatoDesconocido, CODIGO_ENTIDAD_FORMATO_DESCONOCIDO, type CodigoEntidadEiac } from "./codigo-entidad.ts";
import { nombreCarrierCima } from "./crm-polizas-labels.ts";
// Puro (sin BD/red/crypto): sólo el helper de lectura-sin-contar para que la
// medición de cobertura no confunda «mirar la forma» con «aprovechar el dato».
import { leerSinContar } from "./field-coverage.ts";
// Puro: catálogo INE 01–52 → nombre de provincia (sin BD/red).
import { provinciaPorCp } from "./crm-provincia-por-cp.ts";
// Puro: figuras de la póliza con estructura (04/10/2026). En CLARO; cifra el persist.
import { extractFigurasPoliza, figuraDePersona, type FiguraCima } from "./figuras-cima.ts";

/** Subconjunto de `estado_poliza` que el feed CIMA sabe producir (LOO-915). */
export type EstadoPolizaCima = "activa" | "cancelada" | "vencida";

/**
 * LOO-915 — `EIAC SituacionPoliza` → `polizas.estado`.
 *
 * Hasta este ticket `estado` NO se escribía NUNCA desde el pull: se guardaba
 * `situacion` en crudo y `estado` se quedaba con su `DEFAULT 'activa'`. Resultado
 * medido en prod (2026-07-10): de 100 pólizas CIMA, 41 estaban `AN` (anuladas) y
 * 9 `ES`, y las 100 se mostraban «Activa» — 6 de ellas con vencimiento futuro,
 * indistinguibles de una póliza viva.
 *
 * Devuelve `{ estado: null, conocido: false }` para cualquier código que no
 * sepamos traducir. El caller NO escribe `estado` en ese caso (deja el que
 * hubiera) y emite un evento de cuarentena. Adivinar el significado de un código
 * desconocido cambiaría la vigencia de pólizas reales a ciegas.
 *
 * `EX` (Extinguida) sigue sin traducir a propósito (cuarentena visible).
 */
export function mapSituacionPoliza(
  raw: unknown,
): { estado: EstadoPolizaCima | null; conocido: boolean } {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  switch (code) {
    case "EV": // En Vigor
      return { estado: "activa", conocido: true };
    case "AN": // Anulada (mismo código que `mapReciboSituacion` / `mapLiquidacionEstado`)
      return { estado: "cancelada", conocido: true };
    // Fuente: Documentos Estándar EIAC V07.1 (13.3.32 claves_situacionpoliza):
    // AN Anulada · ES En Suspenso · EV En Vigor · EX Extinguida · PR Propuesta.
    // `estado_poliza` no tiene valor para «propuesta» ni «en suspenso»: se reconocen
    // (sin cuarentena) pero NO se toca `estado`; la verdad queda en `polizas.situacion`.
    case "PR":
    case "ES":
      return { estado: null, conocido: true };
    default:
      // Incluye el string vacío (EIAC sin SituacionPoliza): nada que traducir,
      // pero tampoco es un código "desconocido" que merezca cuarentena.
      return { estado: null, conocido: code === "" };
  }
}

/**
 * LOO-915 / 26/09/2026 — `estado` a escribir en la póliza desde el EIAC.
 *
 * Código con estado propio (EV/AN) → el suyo. Sin estado propio y NO propuesta:
 * código DESCONOCIDO o `ES` (En Suspenso) → si el propio EIAC dice que venció
 * (`fechaVencimiento` < hoy) la póliza no está en vigor: `vencida` (8 pólizas de
 * 2013-2019 contaban como cartera en vigor). Vencimiento futuro/ausente → `null`
 * (el persist no toca el estado). `PR` (Propuesta) y la SituacionPoliza vacía → `null`
 * siempre: una propuesta no tiene vencimiento fiable.
 */
export function estadoPolizaDesdeEiac(p: {
  estado: EstadoPolizaCima | null;
  situacionConocida: boolean;
  fechaVencimiento: string | null;
  hoy: string;
  situacion?: string | null;
}): EstadoPolizaCima | null {
  if (p.estado) return p.estado;
  const code = (p.situacion ?? "").trim().toUpperCase();
  if (code === "PR") return null;
  const infiere = !p.situacionConocida || code === "ES";
  if (infiere && p.fechaVencimiento && p.fechaVencimiento < p.hoy) return "vencida";
  return null;
}

// --- Tipos de salida (lo que consume PR-5/PR-7) ---

export type EiacPolOutcome = "ok" | "review" | "review_salud";

/** Subset del enum tipo_seguro del schema (schema.ts) clasificable desde EIAC. */
export type EiacTipoSeguro =
  | "auto"
  | "moto"
  | "hogar"
  | "vida"
  | "salud"
  | "decesos"
  | "responsabilidad_civil"
  | "comercio"
  | "comunidades"
  | "accidentes"
  | "otros";

export type TipoPersona = "fisica" | "juridica"; // == tipoPersonaEnum (schema.ts)

/** LOO-918 — tipo de producto → nombres CANDIDATOS del bloque de riesgo EIAC
 * (inverso de `classifyTipoSeguro`). Solo para instrumentar la forma de los no-auto.
 * LOO-807: un tipo puede tener >1 nombre de bloque — comercio acepta el PLURAL de
 * Occident (`RiesgoComercios`, C0468, medido en prod) y el singular defensivo; el
 * plural va primero por ser la forma medida en el feed real. */
const RIESGO_BLOQUES_POR_TIPO: Partial<
  Record<EiacTipoSeguro, readonly Parameters<typeof describeRiesgoShape>[1][]>
> = {
  hogar: ["RiesgoHogar"],
  vida: ["RiesgoVida"],
  decesos: ["RiesgoDecesos"],
  salud: ["RiesgoSalud"],
  responsabilidad_civil: ["RiesgoRC"],
  comercio: ["RiesgoComercios", "RiesgoComercio"],
  comunidades: ["RiesgoComunidades"],
  accidentes: ["RiesgoAccidentes"],
  otros: ["RiesgoEmbarcaciones"],
};
export type TipoIdentificacion = "NI" | "NE" | "OT" | string;

/**
 * LOO-751 — una cobertura/garantía de la póliza (EIAC
 * DatosRiesgos/Riesgo[]/DatosCoberturas/Cobertura[]). Dato de CONTRATO (qué cubre
 * la póliza), NO PII → se persiste en `poliza_coberturas` SIN cifrado. Campos
 * tipados = los comunes a todos los ramos; `datosExtra` = la cola heterogénea por
 * ramo (Franquicia/Limite/Prima/...) que no tiene columna, para no perder dato.
 */
export interface MappedCobertura {
  /** EIAC Cobertura/NumeroOrden (entero) o null. */
  numeroOrden: number | null;
  /** EIAC Cobertura/IdCobertura. */
  codigo: string | null;
  /** EIAC Cobertura/DescripcionCobertura ("BASICO", "RC Obligatoria"...). */
  descripcion: string | null;
  /** EIAC Cobertura/CapitalAsegurado (string: importe o código). */
  capitalAsegurado: string | null;
  /** EIAC Cobertura/DescripcionCapitalAsegurado. */
  descripcionCapital: string | null;
  /** Franquicia (presente en algunos ramos; null si la Cobertura no la trae). */
  franquicia: string | null;
  /** ISO date YYYY-MM-DD o null. EIAC Cobertura/FechaInicio. */
  fechaInicio: string | null;
  /** ISO date YYYY-MM-DD o null. EIAC Cobertura/FechaFin. */
  fechaFin: string | null;
  /** EIAC Cobertura/ModalidadValoracion. */
  modalidadValoracion: string | null;
  /** Claves de Cobertura NO mapeadas a campo tipado (Limite/Prima/Recargo...). null si no hay. */
  datosExtra: Record<string, unknown> | null;
}

/**
 * PII del Tomador (única persona promovible). Sin domicilio del Asegurado.
 * `tipoIdentificacion` es SOLO para el routing NI/NE del pipeline (PR-5) — NO se
 * persiste (clientes no tiene columna tipo_identificacion).
 */
export interface MappedTomador {
  tipoPersona: TipoPersona;
  tipoIdentificacion: TipoIdentificacion;
  /** DNI/CIF/NIE en claro tal cual llega del EIAC. El hash + cifrado es PR-2/PR-7. */
  idPersona: string | null;
  /** PersonaFisica: Nombre+Apellidos. PersonaJuridica: RazonSocial. */
  nombreCompleto: string | null;
}

/** Rol de un interviniente CIMA → subset del `intervinienteRolEnum` (schema.ts). */
export type EiacIntervinienteRol =
  | "asegurado"
  | "propietario"
  | "conductor_habitual"
  | "conductor_ocasional"
  | "beneficiario"
  | "contacto"
  // 28/09/2026 — `ClaseFigura=PA` (34 de 34 figuras de los 36 POL reales). Antes
  // caía en `contacto` y el pagador era indistinguible de un contacto cualquiera.
  | "pagador";

/**
 * 28/09/2026 — datos de contacto del TOMADOR que el EIAC POL trae y hasta hoy se
 * tiraban (`pull-persist` solo guardaba DNI y nombre). PII EN CLARO en esta forma
 * intermedia: el persist los cifra con `encryptClientePiiInput` (direccion,
 * telefono, email, fechaNacimiento + lookup hashes) y, en un cliente EXISTENTE,
 * solo rellena lo que esté a NULL — nunca pisa lo anotado a mano.
 *
 * `codigoPostal`/`ciudad`/`provincia`/`estadoCivil`/`ocupacion`/`sector` no son
 * Tier-1 (misma línea que `ParsedDomicilio`) y van en claro en `clientes`.
 * Las longitudes se recortan aquí al tamaño de la columna: un varchar que se
 * pasa aborta la transacción entera del fichero.
 */
export interface MappedTomadorContacto {
  /** NombreVia + OtrosDatosVia. PII Tier-1 (se cifra en persist). */
  direccion: string | null;
  codigoPostal: string | null;
  ciudad: string | null;
  /** Nombre de provincia (código INE → nombre); el crudo si no es un código. */
  provincia: string | null;
  /** PII Tier-1 (se cifra + telefono_lookup_hash). */
  telefono: string | null;
  /** PII Tier-1 (se cifra + email_lookup_hash). */
  email: string | null;
  /** ISO YYYY-MM-DD. PII Tier-1 (se cifra). Solo persona física. */
  fechaNacimiento: string | null;
  /** Texto legible (Casado/a…); `NI` (no informado) → null. Solo física. */
  estadoCivil: string | null;
  /** `Profesion.Descripcion` (física); «NO DISPONIBLE» → null. */
  ocupacion: string | null;
  /** `Actividad.DescripcionActividad` (jurídica). */
  sector: string | null;
}

/**
 * LOO-752 — un interviniente de la póliza (Asegurado / Propietario / Conductor /
 * OtraFigura) con su PII EN CLARO en esta forma intermedia. El cifrado Tier-1
 * (Art.14) lo hace el persist (`buildIntervinienteRows` → `encryptFieldNullable`
 * + `computeDniLookupHash`), igual que las Figuras de siniestro. PURA (sin crypto).
 *
 * Campos PII Tier-1 que el persist CIFRA (AES-256-GCM): nif, nombre, apellidos,
 * fechaNacimiento, telefono, email, fechaCarnet (todos los datos de persona, por
 * consistencia con siniestros). Se descifran en la lectura (mapIntervinienteRow).
 * Ciudad/provincia/CP NO se llevan (no Tier-1, sin columna).
 */
export interface MappedInterviniente {
  rol: EiacIntervinienteRol;
  /** DNI/NIE/CIF en claro tal cual llega del EIAC. Hash + cifrado en persist. */
  nif: string | null;
  nombre: string | null;
  apellidos: string | null;
  /** ISO date YYYY-MM-DD o null. */
  fechaNacimiento: string | null;
  telefono: string | null;
  email: string | null;
  /** ISO date YYYY-MM-DD o null. Solo conductores (FechaPermiso). Relevante Auto. */
  fechaCarnet: string | null;
  /** `ClaseFigura` cruda del EIAC (OtrasFiguras) para trazabilidad. null si no aplica. */
  claseFiguraRaw: string | null;
}

/** Forma intermedia. NO contiene raw_xml (minimización). */
export interface EiacPolMapped {
  outcome: EiacPolOutcome;
  /** Motivos legibles (sin PII) por los que va a review. Vacío si outcome='ok', salvo
   *  la nota `codigo_entidad_formato_desconocido` (no cambia el outcome). */
  reviewReasons: string[];
  // -- Campos de póliza (van a columnas EIAC de `polizas`, PR-1) --
  /** EIAC DatosPoliza/IdPoliza → polizas.id_poliza_entidad. */
  idPolizaEntidad: string | null;
  /** EIAC DatosPoliza/CodigoEntidad/CodigoDGS → polizas.codigo_entidad_dgs. */
  codigoEntidadDgs: string | null;
  /** EIAC DatosPoliza/DatosRamo/RamoDGS → polizas.ramo_dgs (informativo, NO clasifica producto). */
  ramoDgs: string | null;
  /** LOO-918 — nombres de clave del bloque de riesgo no-auto (SIN valores → sin
   * PII), para aprender la forma del EIAC de hogar/RC/vida. `[]` para auto o
   * cuando no hay bloque. El caller lo emite como `operationalEvent`. */
  riesgoShape: string[];
  /** EIAC SituacionPoliza → polizas.situacion (código crudo, siempre se guarda). */
  situacion: string | null;
  /** LOO-915 — `situacion` traducida a `polizas.estado`. **null si el código es
   * desconocido o falta**: el persist NO escribe `estado` y deja el existente. */
  estado: EstadoPolizaCima | null;
  /** LOO-915 — false cuando venía un `situacion` que no sabemos traducir. El
   * persist emite `cima_situacion_desconocida` (cuarentena visible, no bloquea). */
  situacionConocida: boolean;
  /** ISO date YYYY-MM-DD o null. EIAC FechaEfectoInicial. */
  fechaEfectoInicial: string | null;
  /** ISO date YYYY-MM-DD o null. EIAC FechaVencimiento (fallback FechaFinSeguro). */
  fechaVencimiento: string | null;
  /** Producto derivado del bloque <RiesgoXxx>. null si no clasificable → review. */
  tipoSeguro: EiacTipoSeguro | null;
  /** Aseguradora legible. LOO-828: nombre de compañía por `codigoEntidadDgs`
   * (catálogo `CIMA_DGS_CARRIERS`); fallback si el código no está mapeado:
   * comportamiento anterior (DescripcionRamo → CodigoDGS crudo). */
  aseguradora: string | null;
  tomador: MappedTomador | null;
  /**
   * Datos del objeto asegurado → `polizas.datos_especificos` (jsonb). Vehículo
   * (auto/moto): matricula/marca/modelo. Inmueble/local (hogar, comercio,
   * comunidades): direccion/direccionOrigen/cp/localidad/provincia. null si no
   * hay nada que guardar (mantiene la columna limpia).
   *
   * 🚨 `direccion` es PII Tier-1 y viaja EN CLARO aquí (el mapper es puro): el
   * persist la cifra con `encryptPolizaDatosEspecificos`. No contiene
   * DNI/contacto del tomador ni categoría especial Art.9.
   */
  datosEspecificos: Record<string, unknown> | null;
  /** LOO-749 — EIAC §3.5 ImportesDEC/PrimaTotalAnualizada (fallback Importes/PrimaTotal)
   * → polizas.prima_bruta (anual, con impuestos). Decimal string o null. */
  primaBruta: string | null;
  /** LOO-749 — EIAC §3.5 ImportesDEC/PrimaNetaAnualizada (fallback Importes/PrimaNeta)
   * → polizas.prima_anual (anual, neta). Decimal string o null. */
  primaAnual: string | null;
  /** LOO-749 — EIAC §3.1 FraccionPago → polizas.fraccionamiento. null si ausente. */
  fraccionamiento: "anual" | "semestral" | "trimestral" | "mensual" | null;
  /**
   * LOO-751 — coberturas/garantías de TODOS los riesgos de la póliza, aplanadas
   * (EIAC Riesgo[]/DatosCoberturas/Cobertura[]) → tabla `poliza_coberturas`. Dato
   * de contrato, NO PII. Vacío `[]` si el EIAC no trae ninguna (no es review: la
   * cobertura es informativa, no gating de identidad/fechas/producto).
   */
  coberturas: MappedCobertura[];
  /**
   * LOO-752 — intervinientes de la póliza (Asegurado + Propietario + Conductores
   * + OtrasFiguras de TODOS los Riesgo[]) → tabla `poliza_intervinientes` con PII
   * Tier-1 cifrada (Art.14). PII en CLARO aquí (el cifrado lo hace el persist).
   * Vacío `[]` si el EIAC no trae ninguno. Su ausencia NO manda a review.
   * Decisión LOPD D1=A: el asegurado se persiste cifrado → ya NO se bloquea la
   * póliza por `art14_asegurado_distinto` (regla eliminada en D6).
   */
  intervinientes: MappedInterviniente[];
  /**
   * 28/09/2026 — fechas del EIAC que no tenían columna → `polizas.fecha_emision`,
   * `fecha_efecto_actual`, `fecha_situacion`, `fecha_solicitud` (mig 0103). ISO
   * YYYY-MM-DD o null. `fechaEfectoInicial` sigue siendo `fecha_inicio`.
   * Opcional en el TIPO para no romper a quien construye un `EiacPolMapped` a
   * mano (tests del pipeline); el mapper SIEMPRE lo rellena.
   */
  fechasExtra?: {
    emision: string | null;
    efectoActual: string | null;
    situacion: string | null;
    solicitud: string | null;
  };
  /** 28/09/2026 — contacto del tomador → `clientes` (ver `MappedTomadorContacto`).
   * Opcional en el tipo por la misma razón; el mapper siempre lo rellena. */
  tomadorContacto?: MappedTomadorContacto | null;
}

// --- Helpers de navegación (puros) ---

/** fast-xml-parser colapsa arrays de 1 elem a objeto; normaliza a array. */
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** dateTime EIAC '2020-02-01T00:00:00' → 'YYYY-MM-DD'. null si vacío/inválido. NUNCA throw. */
export function toIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = Number(mo);
  const dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null; // fecha basura → null
  const iso = `${y}-${mo}-${d}`;
  // Valor de cajón de las compañías (nunca una fecha real) → «no se sabe».
  if (iso === "1900-01-01" || iso === "9999-12-31") return null;
  return iso;
}

/** Vencimiento: además, `2000-01-01` es el relleno medido en Allianz (propuestas PR). */
function toIsoVencimiento(raw: unknown): string | null {
  const iso = toIsoDate(raw);
  return iso === "2000-01-01" ? null : iso;
}

function str(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/**
 * LOO-749 — Importe EIAC decimal ("1000.0" | number) → string normalizado "1000.00"
 * o null. EIAC usa punto decimal (XML estándar), sin separador de miles. Negativo o
 * no numérico → null (dato malo). PURA, nunca throw.
 */
export function toDecimalString(raw: unknown): string | null {
  const s =
    typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

/**
 * LOO-749 — EIAC §3.1 FraccionPago (AN/SE/TR/ME) → `fraccionamientoEnum`. null si
 * ausente o desconocido (defensivo, no throw).
 */
export function classifyFraccionPago(
  raw: unknown,
): "anual" | "semestral" | "trimestral" | "mensual" | null {
  switch (str(raw)?.toUpperCase()) {
    case "AN":
      return "anual";
    case "SE":
      return "semestral";
    case "TR":
      return "trimestral";
    case "ME":
      return "mensual";
    default:
      return null;
  }
}

// --- Forma de entrada laxa (superset estructural del output de PR-3) ---

/**
 * LOO-752 — datos de contacto de una PersonaFisica del EIAC. fast-xml-parser
 * colapsa los arrays Telefono/Email a objeto único o array → navegación defensiva.
 */
export interface ParsedDatosContacto {
  Telefonos?: { Telefono?: unknown };
  Emails?: { Email?: unknown };
}

/** LOO-752 — domicilio de una PersonaFisica. NO Tier-1 (CP/Poblacion/Provincia). */
export interface ParsedDomicilio {
  /** Tier-1 (con OtrosDatosVia): solo se lee para el TOMADOR y se cifra en persist. */
  NombreVia?: unknown;
  OtrosDatosVia?: unknown;
  CodigoPostal?: unknown;
  Poblacion?: unknown;
  Provincia?: unknown;
}

/**
 * PersonaFisica del EIAC con toda la PII de un interviniente (LOO-752). El Tomador
 * usa solo TipoIdentificacion/IdPersona/Nombre/Apellidos; los intervinientes
 * además FechaNacimiento + DatosContacto.
 */
export interface ParsedPersonaFisica {
  TipoIdentificacion?: unknown;
  IdPersona?: unknown;
  Nombre?: unknown;
  Apellido1?: unknown;
  Apellido2?: unknown;
  Sexo?: unknown;
  EstadoCivil?: unknown;
  FechaNacimiento?: unknown;
  /** Id del cliente EN LA COMPAÑÍA (no es un documento). */
  IdCliente?: unknown;
  Profesion?: { Descripcion?: unknown };
  Domicilio?: ParsedDomicilio;
  DatosContacto?: ParsedDatosContacto;
}

export interface ParsedPersona {
  PersonaFisica?: ParsedPersonaFisica;
  PersonaJuridica?: {
    TipoIdentificacion?: unknown;
    IdPersona?: unknown;
    RazonSocial?: unknown;
    IdCliente?: unknown;
    Actividad?: { DescripcionActividad?: unknown; IdActividad?: unknown };
    Domicilio?: ParsedDomicilio;
    DatosContacto?: ParsedDatosContacto;
  };
}

/** LOO-752 — un conductor del bloque RiesgoAutos/Conductores. */
export interface ParsedConductor {
  NumeroOrden?: unknown;
  DatosConductor?: ParsedPersonaFisica;
  /** HA=habitual / OC=ocasional (best-effort; default habitual). */
  ClaseConductor?: unknown;
  /** Fecha de expedición del permiso → fechaCarnet (PII Tier-1, relevante Auto). */
  FechaPermiso?: unknown;
  /** Clase del permiso (código crudo) → `datos_especificos.conductores[].tipoPermiso`. */
  TipoPermiso?: unknown;
}

/** LOO-752 — una figura del bloque OtrasFiguras (pagador, beneficiario, ...). */
export interface ParsedFiguraPol {
  DatosFigura?: ParsedPersona;
  /** ClaseFigura (PA=pagador, BE=beneficiario, ...). */
  ClaseFigura?: unknown;
}

export interface ParsedRiesgoAutos {
  Vehiculo?: {
    ClaseVehiculo?: unknown;
    CategoriaVehiculo?: unknown;
    BaseSIETe?: unknown;
    Cilindrada?: unknown;
    Matricula?: unknown;
    Marca?: unknown;
    Modelo?: unknown;
    Bastidor?: unknown;
    Version?: unknown;
    Potencia?: unknown;
    Combustible?: unknown;
    FechaMatriculacion?: unknown;
    Plazas?: unknown;
    PMA?: unknown;
    UsoVehiculo?: unknown;
    Valor?: unknown;
    Antiguedad?: unknown;
    Remolque?: unknown;
  };
  /** LOO-752 — propietario del vehículo (PersonaFisica|PersonaJuridica). */
  Propietario?: ParsedPersona;
  /** LOO-752 — Conductor puede ser objeto único o array (fast-xml-parser). */
  Conductores?: { Conductor?: ParsedConductor | ParsedConductor[] };
}

/**
 * Dirección del RIESGO (dónde está el bien asegurado), no de la persona.
 *
 * Medido el 20/09/2026 sobre `seguros.cima_cobertura_campos` (POL, Occident
 * C0468 y Generali C0072): los tres bloques que la traen —`RiesgoHogar`,
 * `RiesgoComercios` y `RiesgoComunidades`— usan EXACTAMENTE estos seis hijos, y
 * los tres tenían `veces_leido = 0`: CIMA la mandaba y el mapper la tiraba.
 *
 * ⚠️ `NombreVia` + `OtrosDatosVia` son PII Tier-1 (identifican el domicilio de
 * una persona física). El mapper es PURO y los devuelve EN CLARO; cifrarlos es
 * responsabilidad del persist (`encryptPolizaDatosEspecificos`, clave
 * `direccion`), igual que ya se hace con el IBAN.
 */
export interface ParsedSituacionRiesgo {
  NombreVia?: unknown;
  OtrosDatosVia?: unknown;
  CodigoPostal?: unknown;
  Poblacion?: unknown;
  Provincia?: unknown;
  Pais?: unknown;
}

export interface ParsedRiesgo {
  RiesgoAutos?: ParsedRiesgoAutos | unknown;
  RiesgoHogar?: unknown;
  RiesgoVida?: unknown;
  RiesgoDecesos?: unknown;
  RiesgoSalud?: unknown;
  RiesgoRC?: unknown;
  RiesgoComercio?: unknown;
  /** LOO-807 — Occident (C0468) emite el bloque de comercio en PLURAL (medido en
   * prod, fichero POL 2026-08-01); la spec EIAC no fija nombre canónico → se
   * aceptan ambos nombres. */
  RiesgoComercios?: unknown;
  /** Occident (C0468) emite el ramo DGS 211 (Accidentes convenios/colectivo,
   * BIDV004566) bajo este bloque — confirmado contra el XML EIAC real del
   * fichero POL_132 en homologación. */
  RiesgoAccidentes?: unknown;
  /** Bloque genérico EIAC (`NombreRiesgo`/`DescripcionRiesgo`); Allianz C0109 (POL 131, 30/09/2026). */
  OtrosRiesgos?: unknown;
  /** EIAC §coberturas — Cobertura puede ser objeto único O array (fast-xml-parser). */
  DatosCoberturas?: { Cobertura?: ParsedCobertura | ParsedCobertura[] };
  /** LOO-752 — otras figuras de la póliza (pagador, beneficiario, ...). */
  OtrasFiguras?: { Figura?: ParsedFiguraPol | ParsedFiguraPol[] };
  /** 28/09/2026 — identificación del riesgo dentro de la póliza. */
  IdRiesgo?: unknown;
  NumeroOrden?: unknown;
  DescripcionRiesgo?: unknown;
  FechaInicio?: unknown;
  FechaFin?: unknown;
  /** 28/09/2026 — beneficiarios del riesgo (préstamo hipotecario en el feed medido). */
  Beneficiarios?: { Beneficiario?: unknown };
  [k: string]: unknown;
}

/**
 * LOO-751 — forma laxa de una Cobertura del EIAC. Los campos conocidos se mapean
 * a `MappedCobertura`; el resto (Franquicia/Limite/Prima/...) cae en `datosExtra`.
 */
export interface ParsedCobertura {
  NumeroOrden?: unknown;
  IdCobertura?: unknown;
  DescripcionCobertura?: unknown;
  CapitalAsegurado?: unknown;
  DescripcionCapitalAsegurado?: unknown;
  Franquicia?: unknown;
  FechaInicio?: unknown;
  FechaFin?: unknown;
  ModalidadValoracion?: unknown;
  [k: string]: unknown;
}

export interface ParsedPoliza {
  DatosPoliza?: {
    IdPoliza?: unknown;
    CodigoEntidad?: CodigoEntidadEiac;
    DatosRamo?: {
      RamoDGS?: unknown;
      RamoEntidad?: unknown;
      DescripcionRamo?: unknown;
      ModalidadRamo?: unknown;
      DescripcionModalidad?: unknown;
    };
    DatosMediador?: {
      ClaseMediador?: unknown;
      NombreMediador?: unknown;
      IdMediador?: { CodigoDGS?: unknown; CodigoInterno?: unknown };
    };
    /** Nº de suplemento de ESTE fichero: ordena el historial de la póliza. */
    NumeroSuplemento?: unknown;
  };
  SituacionPoliza?: unknown;
  /** EIAC — duración (RE=renovable, UN=única…). Código crudo. */
  DuracionPoliza?: unknown;
  /** EIAC — clase de póliza (AN/CA/NP/SU…). Código crudo. */
  ClasePoliza?: unknown;
  Fechas?: {
    FechaEfectoInicial?: unknown;
    FechaVencimiento?: unknown;
    FechaFinSeguro?: unknown;
    FechaEmision?: unknown;
    FechaEfectoActual?: unknown;
    FechaSituacion?: unknown;
    FechaSolicitud?: unknown;
  };
  /** EIAC — gestión del cobro (clase, forma de pago y cuenta de domiciliación). */
  GestionCobro?: {
    ClaseGestion?: unknown;
    DatosFormaPago?: {
      ClaseFormaPago?: unknown;
      DatosCuentaCorriente?: { IBAN?: unknown; BIC?: unknown; Titular?: ParsedPersona };
    };
  };
  DatosComisiones?: { Comision?: unknown };
  DatosComercializacion?: { Comercializacion?: unknown };
  OrigenesContratacion?: { OrigenContratacion?: unknown };
  DatosRegularizacion?: { PolizaRegularizable?: unknown };
  DatosSuspensiones?: { Suspension?: unknown };
  /** EIAC §3.1 — AN=Anual, SE=Semestral, TR=Trimestral, ME=Mensual. */
  FraccionPago?: unknown;
  /** EIAC §3.5 — importes agregados a nivel póliza (periodo + anualizados DEC). */
  DatosImportes?: {
    Importes?: {
      PrimaTotal?: unknown;
      PrimaNeta?: unknown;
      DatosCargos?: { Cargo?: unknown };
      DatosMoneda?: { Moneda?: unknown; TipoCambio?: unknown; FechaCambio?: unknown };
    };
    ImportesDEC?: {
      PrimaTotalAnualizada?: unknown;
      PrimaNetaAnualizada?: unknown;
      CapitalAseguradoAgregado?: unknown;
      ComisionAnualizada?: unknown;
    };
  };
  DatosRiesgos?: { Riesgo?: ParsedRiesgo | ParsedRiesgo[] };
  Tomador?: ParsedPersona;
  Asegurado?: ParsedPersona | ParsedPersona[];
  /** EIAC — anulación de la póliza (fecha, motivo codificado y detalle en texto). */
  DatosAnulacion?: unknown;
  /** EIAC — póliza a la que esta sustituye (la compañía lo dice, no se deduce). */
  DatosPolizaReemplazada?: unknown;
  /** EIAC — historial de suplementos (renovaciones, modificaciones…). */
  Suplementos?: unknown;
  /** EIAC — datos libres de la compañía (bonus-malus, anualidades, flags…). */
  OtrosDatos?: unknown;
}

/**
 * Entrada del mapper: el árbol JSON del EIAC (lo produce el adapter / PR-3 en
 * `fichero.datos`). Aceptamos tanto el nodo con el wrapper `<ProcesosEIAC>` como
 * sin él (defensivo ante cómo el adapter serialice la raíz).
 */
export interface ParsedEiacPol {
  ProcesosEIAC?: { Objetos?: { Poliza?: ParsedPoliza | ParsedPoliza[] } };
  Objetos?: { Poliza?: ParsedPoliza | ParsedPoliza[] };
}

/** Desenvuelve el wrapper ProcesosEIAC si está presente. */
function unwrapObjetos(
  parsed: ParsedEiacPol,
): { Poliza?: ParsedPoliza | ParsedPoliza[] } | undefined {
  return parsed?.ProcesosEIAC?.Objetos ?? parsed?.Objetos;
}

/**
 * 04/10/2026 — bloques `<RiesgoXxx>` de la norma (Documentos Estándar EIAC V07.1,
 * choice de `tipo_riesgo`, 13.38) que no tienen extractor propio. Se aceptan como
 * `otros` con un guardado GENÉRICO (`bloqueRiesgo` + `nombreRiesgo`; el resto de sus
 * hojas cae en `cimaExtra`, con la lista de exclusión de siempre). Valor = el nombre
 * del ramo tal como lo describe la norma. `RiesgoAsistenciaSanitaria` NO está: es
 * salud (ver `classifyTipoSeguro`).
 */
export const NOMBRE_RAMO_GENERICO: Readonly<Record<string, string>> = {
  RiesgoAsistenciaViaje: "Asistencia en viaje",
  RiesgoCaucion: "Caución",
  RiesgoConstruccion: "Construcción",
  RiesgoCredito: "Crédito",
  RiesgoDefensaJuridica: "Defensa jurídica",
  RiesgoIncendios: "Incendios",
  RiesgoIndustriales: "Multirriesgos industriales",
  RiesgoPerdidasDiversas: "Pérdidas diversas",
  RiesgoTransportes: "Transportes",
  OtrosDanos: "Otros daños a los bienes",
  OtrosMultirriesgos: "Otros multirriesgos",
};
export const BLOQUES_RIESGO_GENERICOS: readonly string[] = Object.keys(NOMBRE_RAMO_GENERICO);

/** Ramo DGS → producto, solo para `OtrosRiesgos` (bloque genérico). */
const TIPO_POR_RAMO_DGS: Readonly<Record<string, EiacTipoSeguro>> = {
  "241": "auto",
  "2151": "hogar",
  "282": "responsabilidad_civil",
  "2171": "comercio",
  "211": "accidentes",
  "2161": "comunidades",
};

/**
 * Moto o coche, según la norma EIAC V07.1 (04/11/2026). OJO: son DOS tablas con
 * códigos que se pisan:
 *  - `CategoriaVehiculo` (§13.3.4): CA camiones · MO MOTOCICLETAS · TU turismos.
 *  - `ClaseVehiculo` (§13.3.16): MT motocicleta · CI ciclomotor · MO MONOVOLUMEN (¡coche!).
 * Manda la categoría; solo si falta (Reale no la manda) decide la clase. `MT` lo
 * mandan Allianz, Mapfre, Occident y Reale (medido 04/11/2026). Mismas reglas que
 * `esPolizaDeCoche` de module-seguros (`sincro-cima.ts`).
 */
const CATEGORIAS_VEHICULO_MOTO: ReadonlySet<string> = new Set(["MO"]);
const CLASES_VEHICULO_MOTO: ReadonlySet<string> = new Set(["MT", "CI"]);

/**
 * Producto por presencia de bloque `<RiesgoXxx>`, NO por RamoDGS. Distingue moto
 * de auto por `RiesgoAutos/Vehiculo/CategoriaVehiculo` (MO=moto) y, sin categoría,
 * por `ClaseVehiculo` (MT/CI=moto; MO=monovolumen=auto; resto=auto).
 * LOO-807: comercio acepta `RiesgoComercio` Y `RiesgoComercios` (el plural que
 * emite Occident C0468, medido en prod).
 */
export function classifyTipoSeguro(
  riesgo: ParsedRiesgo | undefined,
  ramoDgs?: string | null,
): EiacTipoSeguro | null {
  if (!riesgo) return null;
  if (riesgo.RiesgoSalud != null) return "salud";
  // 04/10/2026 — `RiesgoAsistenciaSanitaria` (EIAC V07.1, 13.48) tiene la MISMA forma
  // que `RiesgoSalud` (Persona 1..1 + Modalidad) y es el ramo de asistencia sanitaria:
  // es un seguro de salud. Va a `review_salud` con él (Art. 9), no al guardado genérico.
  if (riesgo.RiesgoAsistenciaSanitaria != null) return "salud";
  if (riesgo.RiesgoAutos != null) {
    const autos = riesgo.RiesgoAutos as {
      Vehiculo?: { ClaseVehiculo?: unknown; CategoriaVehiculo?: unknown };
    };
    const categoria = str(autos?.Vehiculo?.CategoriaVehiculo)?.trim().toUpperCase();
    if (categoria) return CATEGORIAS_VEHICULO_MOTO.has(categoria) ? "moto" : "auto";
    const clase = str(autos?.Vehiculo?.ClaseVehiculo)?.trim().toUpperCase();
    return clase && CLASES_VEHICULO_MOTO.has(clase) ? "moto" : "auto";
  }
  if (riesgo.RiesgoHogar != null) return "hogar";
  if (riesgo.RiesgoVida != null) return "vida";
  if (riesgo.RiesgoDecesos != null) return "decesos";
  if (riesgo.RiesgoRC != null) return "responsabilidad_civil";
  if (riesgo.RiesgoComercio != null) return "comercio";
  // LOO-807 — plural de Occident; la spec EIAC no fija nombre canónico.
  if (riesgo.RiesgoComercios != null) return "comercio";
  // Occident (C0468), ramo DGS 211 — accidentes convenios/colectivo (BIDV004566).
  if (riesgo.RiesgoAccidentes != null) return "accidentes";
  // Comunidades de propietarios (ramo DGS 2161). Medido en la carga masiva 199 de
  // Occident C0468 del 15/09/2026 (BIDP019061, BIDP023227, BIDQ020971) y en la de
  // Generali C0072 del 14/09: caían en review y, al confirmarse el fichero como
  // parcial, TIREA ya no lo re-entrega → póliza perdida.
  if (riesgo.RiesgoComunidades != null) return "comunidades";
  // Embarcaciones no tiene valor propio en `tipo_seguro`: se persiste como `otros`
  // (el ramo DGS real queda en la póliza) en vez de perderla en review.
  if (riesgo.RiesgoEmbarcaciones != null) return "otros";
  // 04/10/2026 — ramos de la norma sin extractor propio: se aceptan como `otros` con
  // guardado genérico (`bloqueRiesgo`/`nombreRiesgo` + hojas en `cimaExtra`) en vez de
  // mandar la póliza a review. Antes de `OtrosRiesgos`: el afinado por ramo DGS es
  // solo para el bloque genérico de verdad, aquí el bloque ya dice qué ramo es.
  if (BLOQUES_RIESGO_GENERICOS.some((b) => riesgo[b] != null)) return "otros";
  // Bloque GENÉRICO de la spec EIAC (`OtrosRiesgos` con NombreRiesgo/DescripcionRiesgo).
  // Medido 30/09/2026: Allianz C0109, POL 131, lo trae como único hijo de <Riesgo>.
  // Va el ÚLTIMO a propósito: un bloque específico (RiesgoAutos…) gana si vienen ambos.
  // Sin `tipo_seguro` propio → `otros` (el ramo DGS real queda en la póliza).
  // 03/10/2026: si es el ÚNICO bloque, el producto se afina por ramo DGS (tabla
  // auditada en 2026-09-09_tipo_seguro_accidentes.sql; moto es indistinguible → auto).
  if (riesgo.OtrosRiesgos != null) return TIPO_POR_RAMO_DGS[ramoDgs?.trim() ?? ""] ?? "otros";
  return null; // no clasificable → caller manda a review
}

/**
 * LOO-806 — bloques `<RiesgoXxx>` que classifyTipoSeguro SÍ reconoce. MANTENER EN SYNC
 * con classifyTipoSeguro (arriba). Solo para el diagnóstico de los NO reconocidos; la
 * clasificación real la hace classifyTipoSeguro (tiene lógica propia autos→auto/moto).
 */
const RECOGNIZED_RIESGO_BLOCKS: ReadonlySet<string> = new Set([
  "RiesgoSalud",
  "RiesgoAutos",
  "RiesgoHogar",
  "RiesgoVida",
  "RiesgoDecesos",
  "RiesgoRC",
  "RiesgoComercio",
  "RiesgoComercios", // LOO-807 — plural de Occident (C0468)
  "RiesgoAccidentes", // Occident (C0468), ramo DGS 211 (BIDV004566)
  "RiesgoComunidades", // ramo DGS 2161 (Occident C0468 / Generali C0072, 199 de 09/2026)
  "RiesgoEmbarcaciones", // → `otros` (sin valor propio en tipo_seguro)
  "OtrosRiesgos", // bloque genérico EIAC (Allianz C0109, POL 131 de 30/09/2026) → `otros`
  "RiesgoAsistenciaSanitaria", // → `salud` (review_salud, Art. 9): misma forma que RiesgoSalud
  ...BLOQUES_RIESGO_GENERICOS, // 04/10/2026 → `otros` con guardado genérico
]);

/**
 * Hijos de `<Riesgo>` que NO son un bloque de riesgo (los lee otro extractor o son
 * metadatos). Todo hijo-OBJETO que no esté aquí ni en RECOGNIZED_RIESGO_BLOCKS se trata
 * como bloque de riesgo desconocido (se nombra en `riesgo_no_reconocido:`), tenga o no
 * prefijo «Riesgo». MANTENER al añadir un extractor que lea un hijo nuevo de <Riesgo>.
 */
const HIJOS_RIESGO_NO_BLOQUE: ReadonlySet<string> = new Set([
  "DatosCoberturas",
  "Coberturas",
  "OtrasFiguras",
  "Beneficiarios",
  "Capitales",
  "OtrosDatos", // Generali C0072: metadatos, no es un bloque de riesgo
]);

/**
 * LOO-806 — DIAGNÓSTICO: nombres de los bloques `<RiesgoXxx>` presentes en un riesgo que
 * classifyTipoSeguro NO reconoce. Hace el gap `tipo_seguro_no_clasificable` auto-
 * diagnosticable (qué ramo trae el carrier, p.ej. Occident M00171) sin re-inspeccionar el
 * `rawXml` (no persistido, Art.5). Devuelve SOLO nombres de nodo XML — NUNCA valores → no
 * PII. Vacío si el riesgo es undefined o no tiene ningún bloque `Riesgo*` desconocido
 * (el caller emite `riesgo_sin_bloque`). PURA, nunca throw.
 */
export function unrecognizedRiesgoBlocks(riesgo: ParsedRiesgo | undefined): string[] {
  if (!riesgo || typeof riesgo !== "object") return [];
  return Object.keys(riesgo)
    .filter((k) => {
      if (RECOGNIZED_RIESGO_BLOCKS.has(k) || HIJOS_RIESGO_NO_BLOQUE.has(k)) return false;
      // «Riesgo*» (también escalar, comportamiento previo) o cualquier hijo-objeto
      // desconocido (p.ej. `OtrosRiesgos` antes de reconocerse).
      const v = (riesgo as Record<string, unknown>)[k];
      return k.startsWith("Riesgo") || (v !== null && typeof v === "object");
    })
    .sort();
}

/**
 * Extrae los datos del objeto asegurado para `polizas.datos_especificos`:
 * vehículo (`RiesgoAutos/Vehiculo`: matrícula, marca, modelo) y dirección del
 * riesgo (`RiesgoHogar|RiesgoComercios|RiesgoComunidades/SituacionRiesgo`). Solo
 * incluye las claves con valor real (jsonb limpio). Devuelve null si no hay nada
 * que guardar. PURA, nunca throw.
 *
 * 🚨 DESDE 20/09/2026 ESTA SALIDA PUEDE CONTENER PII Tier-1: la clave
 * `direccion` es el domicilio del riesgo y va EN CLARO (el mapper es puro, no
 * cifra). **Quien persista esto DEBE pasarlo por
 * `encryptPolizaDatosEspecificos`** — que es exactamente lo que hace
 * `pull-persist.ts`. Antes de este cambio la salida era no-PII y el persist
 * escribía el objeto tal cual; si alguien añade otro write-path, tiene que
 * cifrar. NO promueve DNI/contacto del tomador ni categorías especiales Art.9.
 */
/**
 * Bloques `<RiesgoXxx>` que traen `SituacionRiesgo` con la MISMA forma (medido
 * 20/09/2026 en `cima_cobertura_campos`, C0468 + C0072). El singular
 * `RiesgoComercio` va por simetría con `classifyTipoSeguro` (la spec EIAC no fija
 * nombre canónico); no se ha medido porque el feed real usa el plural.
 *
 * NO están aquí, a propósito: `RiesgoAutos` (el riesgo es el vehículo, no un
 * domicilio) ni `RiesgoRC`/`RiesgoVida`/`RiesgoAccidentes`/`RiesgoEmbarcaciones`,
 * que en el feed medido NO traen `SituacionRiesgo`. Añadir un bloque aquí sin
 * haber visto su forma sería inventarse el contrato.
 */
const BLOQUES_CON_SITUACION_RIESGO = [
  "RiesgoHogar",
  "RiesgoComercios",
  "RiesgoComercio",
  "RiesgoComunidades",
] as const;

/**
 * Dirección del riesgo de un bloque `RiesgoHogar`/`RiesgoComercios`/
 * `RiesgoComunidades` → claves de `polizas.datos_especificos`.
 *
 * Las claves de salida NO se eligen aquí: son las que YA lee la ficha de
 * `/correduria` (`objetoAsegurado` de `@central/module-seguros`, función
 * `objetoInmueble`: `direccion`, `localidad`, `cp`) y el buscador de cartera
 * (`localidad`/`cp` del riesgo, en claro). Escribir otras crearía un dato que
 * nadie pinta.
 *
 * - `direccion` = `NombreVia` + `OtrosDatosVia` (piso/puerta) unidos por un
 *   espacio. Es PII Tier-1 y sale EN CLARO: la cifra el persist.
 * - `localidad`/`cp`/`provincia` NO son Tier-1 (misma línea que ya traza
 *   `ParsedDomicilio`) y se guardan en claro — son lo único por lo que se puede
 *   buscar un riesgo sin la clave de descifrado.
 * - `direccionOrigen: 'cima'` marca la PROCEDENCIA. Sin él, una dirección que
 *   antes se anotó a mano (`direccionOrigen: 'manual'`) seguiría rotulada como
 *   «anotada a mano» después de que la compañía la informara: una etiqueta
 *   falsa sobre un dato correcto.
 * - `Pais` se ve pero NO se lee: no hay dónde pintarlo y en el feed medido es
 *   siempre el mismo. Queda anotado como hueco conocido, no como olvido.
 *
 * Devuelve `null` si el bloque no trae NINGUNA de las claves (no ensucia el
 * JSONB con un objeto vacío). PURA, nunca throw.
 */
export function extractSituacionRiesgo(
  riesgo: ParsedRiesgo | undefined,
): Record<string, unknown> | null {
  if (!riesgo) return null;
  let situacion: ParsedSituacionRiesgo | undefined;
  for (const bloque of BLOQUES_CON_SITUACION_RIESGO) {
    const raw = riesgo[bloque];
    if (raw == null || typeof raw !== "object") continue;
    const s = (raw as { SituacionRiesgo?: unknown }).SituacionRiesgo;
    if (s != null && typeof s === "object") {
      situacion = s as ParsedSituacionRiesgo;
      break;
    }
  }
  if (!situacion) return null;

  const out: Record<string, unknown> = {};
  const direccion = [str(situacion.NombreVia), str(situacion.OtrosDatosVia)]
    .filter((x): x is string => x !== null)
    .join(" ");
  if (direccion !== "") {
    out.direccion = direccion;
    out.direccionOrigen = "cima";
  }
  const cp = str(situacion.CodigoPostal);
  const localidad = str(situacion.Poblacion);
  const provincia = str(situacion.Provincia);
  if (cp) out.cp = cp;
  if (localidad) out.localidad = localidad;
  if (provincia) out.provincia = provincia;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Bloques `<RiesgoXxx>` que traen `Capitales/Capital[]` (medido 20/09/2026 en
 * `cima_cobertura_campos`, C0468): hogar/comercios/comunidades traen el
 * desglose del INMUEBLE (Continente, Contenido…); RC lo trae para lo que
 * cubre la responsabilidad (p.ej. gastos veterinarios en RC de mascotas). NO
 * es el mismo dato que `Cobertura.CapitalAsegurado` (ya leído por
 * `mapCobertura`, otra rama del árbol EIAC).
 */
const BLOQUES_CON_CAPITALES = [
  "RiesgoHogar",
  "RiesgoComercios",
  "RiesgoComercio",
  "RiesgoComunidades",
  "RiesgoRC",
] as const;

/**
 * El desglose de `Riesgo.Capitales.Capital[]` → `datos_especificos.capitales`,
 * la clave que `objetoAsegurado()`/`describirBien()` de central ya saben leer
 * y formatear (`capitalAsegurado`/`detalles`). `Capital` puede ser objeto único
 * o array (fast-xml-parser) → `asArray`. `ModalidadValoracion` va CRUDA en
 * `modalidad` (28/09/2026: VT/VP/VN/PR en el feed medido; sin catálogo en el
 * repo, no se traduce). Ninguna clave es PII: son partidas del bien.
 */
function extractCapitales(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  if (!riesgo) return null;
  let capitalesRaw: unknown;
  for (const bloque of BLOQUES_CON_CAPITALES) {
    const raw = riesgo[bloque];
    if (raw == null || typeof raw !== "object") continue;
    const c = (raw as { Capitales?: { Capital?: unknown } }).Capitales?.Capital;
    if (c != null) {
      capitalesRaw = c;
      break;
    }
  }
  if (capitalesRaw == null) return null;

  const capitales = asArray(capitalesRaw as Record<string, unknown> | Record<string, unknown>[])
    .map((c) => {
      const bien = str(c?.["Bien"]);
      const descripcion = str(c?.["Descripcion"]);
      const importe = str(c?.["Importe"]);
      const modalidad = str(c?.["ModalidadValoracion"]);
      if (bien == null && descripcion == null && importe == null) return null;
      const out: Record<string, unknown> = {};
      if (bien) out.bien = bien;
      if (descripcion) out.descripcion = descripcion;
      if (importe) out.importe = importe;
      if (modalidad) out.modalidad = modalidad;
      return out;
    })
    .filter((c): c is Record<string, unknown> => c !== null);

  return capitales.length > 0 ? { capitales } : null;
}

/**
 * Superficie y nº de viviendas del inmueble (hogar/comunidades) → claves de
 * `polizas.datos_especificos` que YA lee `objetoInmueble()` de
 * `@central/module-seguros` (`metrosCuadrados`, `nViviendas`): no son claves
 * nuevas, son las que la ficha de /correduria y el portal del cliente ya
 * pintan. Medido el 20/09/2026 en `cima_cobertura_campos` (C0468): igual que
 * `SituacionRiesgo`, CIMA las manda y `veces_leido` era 0.
 *
 * - `metrosCuadrados` = `SuperficieConstruida`, o `SuperficieTotal` si falta
 *   la construida (puede incluir parcela/terraza, pero es mejor que nada).
 *   NO son PII: es un atributo del inmueble, no de una persona.
 * - `nViviendas` solo aplica a `RiesgoComunidades` (`NumeroViviendas`): un
 *   hogar es una sola vivienda, preguntarle cuántas tiene no tiene sentido.
 * - `Antiguedad` se lee en `extractInmuebleExtra` (24/09/2026): medido en los
 *   ficheros reales, es un AÑO (1930, 1994…) o una fecha, no una edad.
 */
function extractSuperficieYViviendas(
  riesgo: ParsedRiesgo | undefined,
): Record<string, unknown> | null {
  if (!riesgo) return null;
  const hogar = riesgo.RiesgoHogar;
  const comunidades = riesgo.RiesgoComunidades;
  // 28/09/2026 — L3: `RiesgoComercios` (plural de Occident) también trae
  // SuperficieConstruida/Total (4 de 5 comercios medidos) y se tiraba.
  const comercio = riesgo.RiesgoComercios ?? riesgo.RiesgoComercio;
  const bloque =
    hogar != null && typeof hogar === "object"
      ? (hogar as Record<string, unknown>)
      : comunidades != null && typeof comunidades === "object"
        ? (comunidades as Record<string, unknown>)
        : comercio != null && typeof comercio === "object"
          ? (comercio as Record<string, unknown>)
          : null;
  if (bloque == null) return null;

  const out: Record<string, unknown> = {};
  const metros = str(bloque.SuperficieConstruida) ?? str(bloque.SuperficieTotal);
  if (metros) out.metrosCuadrados = metros;
  // 03/10/2026 — la total (con solar) también, aparte: `metrosCuadrados` cae a ella
  // solo si falta la construida y entonces no se sabría cuál de las dos es.
  const superficieTotal = str(bloque.SuperficieTotal);
  if (superficieTotal) out.superficieTotal = superficieTotal;
  if (comunidades != null) {
    const nViviendas = str((comunidades as Record<string, unknown>).NumeroViviendas);
    if (nViviendas) out.nViviendas = nViviendas;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * El animal de una RC de mascotas (`RiesgoRC.Animal`) → `animalRaza` /
 * `animalFechaNacimiento` de `polizas.datos_especificos`, que
 * `objetoResponsabilidadCivil()` de `@central/module-seguros` (y su espejo del
 * portal) YA sabe pintar. Medido el 20/09/2026 en `cima_cobertura_campos`
 * (C0468, 3 pólizas): CIMA manda el bloque y `veces_leido` era 0 — la propia
 * «Responsabilidad civil perros» de Alberto salía sin decir de qué perro.
 *
 * 28/09/2026 — `ClaseAnimal`/`UsoAnimal`/`IdAnimal` se leen ya
 * (`animalClase`/`animalUso`/`animalId`). Este comentario decía que eran
 * «códigos EIAC sin catálogo»: era FALSO — medido en los 36 POL reales,
 * `ClaseAnimal` llega como texto legible («Caballo», «Perro no p…») y
 * `IdAnimal` es el identificador del animal (microchip o «VER CLAUSULA»).
 * «SIN INFORMAR» (el único `UsoAnimal` medido) es relleno → no se guarda.
 * `FechaNacimiento` no es PII de una persona (es de un animal), así que va en
 * claro igual que `metrosCuadrados`.
 *
 * L4 (misma fecha) — `RiesgoRC.Actividad` (10 de 12 RC medidas) →
 * `actividad` (texto, tapado como todo texto libre) + `idActividad` (código).
 * Es la actividad ASEGURADA (fontanería, obras de reforma…), no una persona.
 */
const RELLENO_EIAC = new Set(["SIN INFORMAR", "NO DISPONIBLE", "NO INFORMADO", "NI"]);

/** `str` que además descarta el relleno de la compañía («SIN INFORMAR»…). */
function strUtil(raw: unknown): string | null {
  const t = str(raw);
  return t !== null && RELLENO_EIAC.has(t.toUpperCase()) ? null : t;
}

function extractAnimalRC(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  if (!riesgo) return null;
  const rc = riesgo.RiesgoRC as
    | { Animal?: Record<string, unknown>; Actividad?: Record<string, unknown> }
    | undefined;
  if (rc == null || typeof rc !== "object") return null;
  const out: Record<string, unknown> = {};

  const act = rc.Actividad;
  if (act != null && typeof act === "object") {
    const actividad = texto(act.DescripcionActividad);
    const idActividad = str(act.IdActividad);
    if (actividad) out.actividad = actividad;
    if (idActividad) out.idActividad = idActividad;
  }

  const animal = rc.Animal;
  if (animal != null && typeof animal === "object") {
    const raza = str(animal.RazaAnimal);
    const nacimiento = str(animal.FechaNacimiento);
    const clase = strUtil(animal.ClaseAnimal);
    const uso = strUtil(animal.UsoAnimal);
    const id = str(animal.IdAnimal);
    if (raza) out.animalRaza = raza;
    if (nacimiento) out.animalFechaNacimiento = nacimiento;
    if (clase) out.animalClase = clase;
    if (uso) out.animalUso = uso;
    if (id) out.animalId = id;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 24/09/2026 — «CIMA trae prácticamente todos los datos de la póliza que está en
 * el PDF» (Alberto). Medido sobre los 36 ficheros POL del Portal CIMA (Drive,
 * carpeta «CIMA»): el mapper descartaba la anulación, la póliza reemplazada, los
 * suplementos, los «otros datos» de la compañía y media ficha del inmueble. Todo
 * lo de aquí es dato de CONTRATO, no de una persona: se guarda en claro en
 * `datos_especificos`, igual que `metrosCuadrados` o `capitales`.
 *
 * Los CÓDIGOS (motivo de anulación, clase/uso de inmueble, zona, clase de
 * suplemento) se guardan TAL CUAL: no hay catálogo EIAC en el repo y traducir
 * a ojo sería inventarse el contrato (misma regla que `claseVehiculo`). Donde la
 * compañía manda además el texto (`DetalleAnulacion`, `DescripcionClaseSuplemento`)
 * se guarda también, y es lo que se pinta.
 */

/** Tope de elementos de las listas: ninguna póliza real pasa de 20. */
const MAX_LISTA = 60;

/**
 * Un texto libre de la compañía puede llevar una cuenta bancaria o un documento
 * («Se ha modificado la cuenta bancaria: Antigua cuenta ES12 3456…»). Cualquier
 * tirada de 8 o más dígitos (admitiendo espacios y guiones entre ellos) se tapa:
 * `datos_especificos` va en claro y el IBAN tiene su propia columna cifrada.
 */
export function taparNumerosLargos(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]")
    .replace(/\b[A-Z]{2}\d{2}(?:[\s-]?\d){8,}\b/gi, "[cuenta]")
    // NIE (X1234567L) y DNI con puntos (12.345.678-Z): no llegan a 8 dígitos seguidos.
    .replace(/\b[XYZ][\s.-]?\d{7}[\s.-]?[A-Z]\b/gi, "[documento]")
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}[\s.-]?[A-Z]?\b/gi, "[documento]")
    // Teléfonos con puntos o paréntesis: (954) 123 456, 954.12.34.56, +34 600 11 22 33.
    .replace(/(?:\+?34[\s.-]*)?\(?[6789]\d{2}\)?(?:[\s.-]*\d{2,3}){2,3}/g, "[teléfono]")
    .replace(/\d(?:[\s.-]?\d){7,}/g, "[…]");
}

function texto(raw: unknown): string | null {
  const t = str(raw);
  return t === null ? null : taparNumerosLargos(t);
}

/**
 * `Antiguedad` del inmueble. El comentario de `extractSuperficieYViviendas`
 * suponía «edad en años»; los ficheros reales dicen otra cosa: 1930, 1970,
 * 1994, 2014… (AÑO) o `2018-02-01T00:00:00` (fecha). Solo un año de 4 cifras
 * suelto y plausible pasa a `anioConstruccionCima` (respaldo de
 * `anioConstruccion` en los lectores de central); una fecha completa NO,
 * porque no está claro si es construcción, reforma u ocupación, y ese año
 * entra en la tarifa. El valor crudo va siempre a `antiguedadCima`.
 */
export function anioDeAntiguedad(raw: unknown, hoy: Date = new Date()): number | null {
  const t = str(raw);
  if (t === null || !/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1700 && n <= hoy.getFullYear() + 1 ? n : null;
}

function listaProtecciones(bloque: Record<string, unknown>): Array<Record<string, string>> {
  const prot = (bloque.MedidasProteccion as { Proteccion?: unknown } | undefined)?.Proteccion;
  return asArray(prot as Record<string, unknown> | Record<string, unknown>[])
    .map((p) => {
      const medida = str(p?.["DescripcionMedida"]);
      const valor = str(p?.["ValorSubmedida"]);
      if (!medida && !valor) return null;
      const out: Record<string, string> = {};
      if (medida) out.medida = medida;
      if (valor) out.valor = valor;
      return out;
    })
    .filter((x): x is Record<string, string> => x !== null)
    .slice(0, MAX_LISTA);
}

/** Resto de la ficha del inmueble (hogar, comercio, comunidades). */
export function extractInmuebleExtra(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  if (!riesgo) return null;
  let bloque: Record<string, unknown> | null = null;
  for (const nombre of BLOQUES_CON_SITUACION_RIESGO) {
    const raw = riesgo[nombre];
    if (raw != null && typeof raw === "object") {
      bloque = raw as Record<string, unknown>;
      break;
    }
  }
  if (!bloque) return null;
  const out: Record<string, unknown> = {};
  const antiguedad = str(bloque.Antiguedad);
  if (antiguedad) out.antiguedadCima = antiguedad;
  // Clave PROPIA, no `anioConstruccion`: esa la escriben el cliente en el portal
  // y la correduría (Catastro), y `jsonb ||` la pisaría en cada fichero. Los
  // lectores de central usan `anioConstruccionCima` solo como respaldo.
  const anio = anioDeAntiguedad(bloque.Antiguedad);
  if (anio !== null) out.anioConstruccionCima = anio;
  const claseInmueble = str(bloque.ClaseInmueble);
  const usoInmueble = str(bloque.UsoInmueble);
  const zona = str(bloque.Zona);
  const claseComunidad = str(bloque.ClaseComunidad);
  if (claseInmueble) out.claseInmueble = claseInmueble;
  if (usoInmueble) out.usoInmueble = usoInmueble;
  if (zona) out.zona = zona;
  if (claseComunidad) out.claseComunidad = claseComunidad;
  const actividad = texto((bloque.Actividad as { DescripcionActividad?: unknown } | undefined)?.DescripcionActividad);
  if (actividad) out.actividad = actividad;
  const protecciones = listaProtecciones(bloque);
  if (protecciones.length > 0) out.medidasProteccion = protecciones;
  return Object.keys(out).length > 0 ? out : null;
}

/** La embarcación de `RiesgoEmbarcaciones` (Occident): una matrícula de barco no es PII. */
export function extractEmbarcacion(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  const e = (riesgo?.RiesgoEmbarcaciones as { Embarcacion?: unknown } | undefined)?.Embarcacion;
  const b = asArray(e as Record<string, unknown> | Record<string, unknown>[])[0];
  if (!b || typeof b !== "object") return null;
  const campos: Array<[string, string]> = [
    ["Nombre", "nombre"], ["Matricula", "matricula"], ["Marca", "marca"], ["Modelo", "modelo"],
    ["ClaseEmbarcacion", "clase"], ["Eslora", "eslora"], ["PotenciaMotores", "potencia"],
    ["PlazasAutorizadas", "plazas"], ["PuertoBase", "puertoBase"],
    // 28/09/2026 — lista del registro marítimo (6ª/7ª…): sin ella la matrícula
    // de un barco no identifica nada.
    ["ListaMatricula", "lista"],
  ];
  const out: Record<string, unknown> = {};
  for (const [origen, destino] of campos) {
    // «.» y «9999» son relleno de la compañía, no datos. El nombre de un barco
    // suele ser el de una persona: pasa por el mismo tapado que el texto libre.
    const v = origen === "Nombre" ? texto(b[origen]) : str(b[origen]);
    if (v && v !== "." && v !== "9999") out[destino] = v;
  }
  const anio = str(b.AnyoConstruccion);
  if (anio && anio !== "9999") out.anio = anio;
  return Object.keys(out).length > 0 ? { embarcacion: out } : null;
}

/**
 * «Otros datos» que son de una PERSONA y no del contrato: el documento del
 * tomador (Mapfre lo manda en TODAS sus pólizas), el NIF de un segundo
 * asegurado, los beneficiarios de vida o la referencia de una hipoteca (Generali).
 * `datos_especificos` va en claro, así que no entran — ni tapados.
 */
const OTROS_DATOS_PERSONALES =
  /DOCUMENTO|\bNIF\b|\bCIF\b|\bDNI\b|PAGADOR|TITULAR|CLIENTE|POBLACION|POSTAL|\bNIE\b|PASAPORTE|BENEF|\bIBAN\b|CUENTA|TELEF|\bTLF|\bTFNO|MOVIL|E-?MAIL|CORREO|HIPOTECA|NACIMIENTO|F\.? ?NAC|\bSEXO\b|NOMBRE|APELLIDO|CONDUCTOR|TOMADOR|ASEGURADO|DOMICILIO|DIRECCION|OBSERVACION|FUMADOR|PESO|ALTURA|ESTATURA|ENFERMEDAD|SALUD|MEDIC|PROFESION/i;

/**
 * Sin acentos: «TELÉFONO» no casaría con /TELEF/ y se colaría. Y los `_` pasan a
 * espacio: `\b` no corta en el guion bajo, así que `NIF_PAGADOR` se colaba por
 * `\bNIF\b` (medido 28/09/2026 en los recibos de Mapfre, 154 con NIF en claro).
 */
function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ");
}

/** DNI/NIE (8 cifras + letra, X/Y/Z + 7 + letra) o CIF (letra + 7 + control). */
const VALOR_DOCUMENTO_IDENTIDAD = /^\s*(?:[XYZ]?\d{7,8}[A-Z]|[A-HJNP-SUVW]\d{7}[0-9A-J])\s*$/i;

/**
 * ¿Es un dato de PERSONA (no se guarda)? Una sola regla para póliza y recibo.
 * Mira la etiqueta Y el valor: una compañía puede mandar un DNI bajo un id
 * inocente, y la etiqueta sola no lo pararía.
 */
export function esOtroDatoPersonal(
  id: string | null,
  descripcion: string | null,
  valor?: string | null,
): boolean {
  if (valor && VALOR_DOCUMENTO_IDENTIDAD.test(valor)) return true;
  return OTROS_DATOS_PERSONALES.test(sinAcentos(`${id ?? ""} ${descripcion ?? ""}`));
}

function otrosDatos(nodo: unknown): Array<Record<string, string>> {
  const datos = (nodo as { Dato?: unknown } | undefined)?.Dato;
  return asArray(datos as Record<string, unknown> | Record<string, unknown>[])
    .map((d) => {
      const id = str(d?.["IdDato"]);
      const descripcion = texto(d?.["DescripcionDato"]);
      const valor = texto(d?.["ValorSubdato"]);
      if (!descripcion && !id) return null;
      if (esOtroDatoPersonal(id, descripcion, valor)) return null;
      const out: Record<string, string> = {};
      if (id) out.id = id;
      if (descripcion) out.descripcion = descripcion;
      if (valor) out.valor = valor;
      return out;
    })
    .filter((x): x is Record<string, string> => x !== null);
}

/**
 * Lo que la compañía dice de la PÓLIZA (no del bien): anulación, póliza que
 * sustituye, suplementos y «otros datos» (de la póliza y de sus riesgos).
 *
 * ⚠️ `anulacion` se fusiona con `jsonb ||` como el resto: si una póliza se
 * rehabilita y el fichero siguiente ya no trae `DatosAnulacion`, la clave vieja
 * se queda. Quien la pinte tiene que mirar el `estado` de la póliza (lo decide
 * `SituacionPoliza`), no fiarse de que la clave exista.
 */
export function extractDatosPoliza(
  poliza: ParsedPoliza | undefined,
  riesgos: ParsedRiesgo[] = [],
): Record<string, unknown> | null {
  if (!poliza) return null;
  const out: Record<string, unknown> = {};

  const an = poliza.DatosAnulacion as Record<string, unknown> | undefined;
  if (an && typeof an === "object") {
    const anulacion: Record<string, string> = {};
    const fecha = toIsoDate(an.FechaAnulacion);
    const motivo = str(an.MotivoAnulacion);
    const detalle = texto(an.DetalleAnulacion);
    if (fecha) anulacion.fecha = fecha;
    if (motivo) anulacion.motivo = motivo;
    if (detalle) anulacion.detalle = detalle;
    if (Object.keys(anulacion).length > 0) out.anulacion = anulacion;
  }

  const re = poliza.DatosPolizaReemplazada as Record<string, unknown> | undefined;
  if (re && typeof re === "object") {
    const reemplazada: Record<string, unknown> = {};
    const numero = str(re.IdPoliza);
    const cia = codigoDgsDe(re.CodigoEntidad);
    const ramo = re.DatosRamo as { RamoDGS?: unknown; DescripcionRamo?: unknown } | undefined;
    if (numero) reemplazada.numero = numero;
    if (cia) reemplazada.codigoDgs = cia;
    const ramoDgs = str(ramo?.RamoDGS);
    const descripcionRamo = str(ramo?.DescripcionRamo);
    if (ramoDgs) reemplazada.ramoDgs = ramoDgs;
    if (descripcionRamo) reemplazada.descripcionRamo = descripcionRamo;
    // 03/10/2026 — resto de la reemplazada (códigos crudos): ramo/modalidad de la
    // entidad, número de suplemento y mediador (sin nombre propio: solo clase y códigos).
    const ramoExtra = re.DatosRamo as { RamoEntidad?: unknown; ModalidadRamo?: unknown; DescripcionModalidad?: unknown } | undefined;
    const med = re.DatosMediador as
      | { ClaseMediador?: unknown; NombreMediador?: unknown; IdMediador?: { CodigoDGS?: unknown; CodigoInterno?: unknown } }
      | undefined;
    const mediador = med && typeof med === "object"
      ? limpio({
          clase: str(med.ClaseMediador),
          codigoDgs: str(med.IdMediador?.CodigoDGS),
          codigoInterno: str(med.IdMediador?.CodigoInterno),
        })
      : null;
    const extraRe: Array<[string, string | null]> = [
      ["ramoEntidad", str(ramoExtra?.RamoEntidad)],
      ["modalidad", str(ramoExtra?.ModalidadRamo)],
      ["descripcionModalidad", str(ramoExtra?.DescripcionModalidad)],
      ["numeroSuplemento", str(re.NumeroSuplemento)],
    ];
    for (const [k, v] of extraRe) if (v) reemplazada[k] = v;
    if (mediador) (reemplazada as Record<string, unknown>).mediador = mediador;
    if (numero) out.polizaReemplazada = reemplazada;
  }

  const sup = (poliza.Suplementos as { Suplemento?: unknown } | undefined)?.Suplemento;
  const suplementos = asArray(sup as Record<string, unknown> | Record<string, unknown>[])
    .map((s) => {
      const f = s?.["Fechas"] as Record<string, unknown> | undefined;
      const o: Record<string, string> = {};
      const pares: Array<[string, string | null]> = [
        ["id", str(s?.["IdSuplemento"])],
        ["detalle", texto(s?.["Detalle"])],
        ["clase", str(s?.["ClaseSuplemento"])],
        ["descripcionClase", texto(s?.["DescripcionClaseSuplemento"])],
        ["situacion", str(s?.["Situacion"])],
        ["fechaEfecto", toIsoDate(f?.FechaEfectoActual)],
        ["fechaEfectoInicial", toIsoDate(f?.FechaEfectoInicial)],
        ["fechaSituacion", toIsoDate(f?.FechaSituacion)],
        ["numeroSuplemento", str(s?.["NumeroSuplemento"])],
        ["fechaEmision", toIsoDate(f?.FechaEmision)],
        ["fechaVencimiento", toIsoVencimiento(f?.FechaVencimiento)],
      ];
      for (const [k, v] of pares) if (v) o[k] = v;
      return Object.keys(o).length > 0 ? o : null;
    })
    .filter((x): x is Record<string, string> => x !== null)
    .slice(0, MAX_LISTA);
  if (suplementos.length > 0) out.suplementos = suplementos;

  // En vida, decesos, salud y accidentes el riesgo ES una persona: sus «otros
  // datos» pueden ser de salud (categoría especial, art. 9 RGPD) o de
  // beneficiarios. Ahí no se lee ninguno, ni de la póliza ni de sus riesgos.
  const dePersonas = riesgos.some(
    (r) => r?.RiesgoVida != null || r?.RiesgoDecesos != null || r?.RiesgoSalud != null || r?.RiesgoAccidentes != null,
  );
  const vistos = new Set<string>();
  const otros = (dePersonas ? [] : [poliza.OtrosDatos, ...riesgos.map((r) => r?.OtrosDatos)])
    .flatMap((n) => otrosDatos(n))
    .filter((d) => {
      const k = `${d.id ?? ""}|${d.descripcion ?? ""}|${d.valor ?? ""}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, MAX_LISTA);
  if (otros.length > 0) out.otrosDatos = otros;

  return Object.keys(out).length > 0 ? out : null;
}

export function extractDatosEspecificos(
  riesgo: ParsedRiesgo | undefined,
): Record<string, unknown> | null {
  if (!riesgo) return null;
  const out: Record<string, unknown> = {};
  // Dirección del riesgo (hogar / comercio / comunidades). `direccion` sale EN
  // CLARO de aquí (contrato PURO del mapper) y la cifra el persist.
  Object.assign(out, extractSituacionRiesgo(riesgo) ?? {});
  // Superficie y nº de viviendas (hogar/comunidades). NO son PII: van en claro
  // y el persist no las cifra (mismo tratamiento que ya reciben cp/localidad).
  Object.assign(out, extractSuperficieYViviendas(riesgo) ?? {});
  // Animal de una RC de mascotas. NO es PII: va en claro.
  Object.assign(out, extractAnimalRC(riesgo) ?? {});
  // Desglose del capital asegurado por partida. NO es PII: va en claro.
  Object.assign(out, extractCapitales(riesgo) ?? {});
  // Resto de la ficha del inmueble y la embarcación (24/09/2026). NO son PII.
  Object.assign(out, extractInmuebleExtra(riesgo) ?? {});
  Object.assign(out, extractEmbarcacion(riesgo) ?? {});
  if (riesgo.RiesgoAutos != null) {
    const vehiculo = (
      riesgo.RiesgoAutos as { Vehiculo?: Record<string, unknown> }
    )?.Vehiculo;
    const matricula = str(vehiculo?.Matricula);
    const marca = str(vehiculo?.Marca);
    const modelo = str(vehiculo?.Modelo);
    if (matricula) out.matricula = matricula;
    if (marca) out.marca = marca;
    if (modelo) out.modelo = modelo;
    // Crudo de la compañía, sin interpretar: `classifyTipoSeguro` solo reconoce
    // moto con ClaseVehiculo 'MO' y Allianz/Mapfre mandan otra cosa (23/09/2026).
    // Guardarlo es lo que permite ver QUÉ mandan. `baseSiete` además es el
    // `vehicle.code` que pide Codeoscopic para tarificar. No es PII.
    const claseVehiculo = str(vehiculo?.ClaseVehiculo);
    const categoriaVehiculo = str(vehiculo?.CategoriaVehiculo);
    const baseSiete = str(vehiculo?.BaseSIETe);
    const cilindrada = str(vehiculo?.Cilindrada);
    if (claseVehiculo) out.claseVehiculo = claseVehiculo;
    if (categoriaVehiculo) out.categoriaVehiculo = categoriaVehiculo;
    if (baseSiete) out.baseSiete = baseSiete;
    if (cilindrada) out.cilindrada = cilindrada;
    Object.assign(out, extractVehiculoExtra(vehiculo));
    // 03/10/2026 — `Conductor.TipoPermiso` (código crudo del permiso, p. ej. B).
    // Sin persona ni fecha: solo la clase del conductor y el permiso.
    const conductores = listaDe(
      (riesgo.RiesgoAutos as ParsedRiesgoAutos).Conductores?.Conductor,
      (c) => {
        const tipoPermiso = str(c.TipoPermiso);
        if (!tipoPermiso) return null;
        return { clase: str(c.ClaseConductor) ?? "HA", tipoPermiso };
      },
    );
    if (conductores.length > 0) out.conductores = conductores;
  }
  // 28/09/2026 — `RiesgoAccidentes.Convenio` (código o «código-descripción» del
  // convenio colectivo). No es de una persona; `str` y no `texto` porque el
  // código del convenio es una tirada larga de dígitos que `texto` taparía.
  const convenio = str(
    (riesgo.RiesgoAccidentes as { Convenio?: unknown } | undefined)?.Convenio,
  );
  if (convenio) out.convenio = convenio;
  // `OtrosRiesgos` (bloque genérico EIAC): nombre y descripción libres de la compañía.
  // Mismo filtro que `descripcionRiesgoSegura`: se corta en el primer tipo de vía
  // (la dirección es Tier-1) y se tapan números largos.
  const otros = riesgo.OtrosRiesgos;
  if (otros != null && typeof otros === "object") {
    const o = otros as { NombreRiesgo?: unknown; DescripcionRiesgo?: unknown };
    const nombre = textoSinVia(o.NombreRiesgo);
    const descripcion = textoSinVia(o.DescripcionRiesgo);
    if (nombre) out.nombreRiesgo = nombre;
    if (descripcion) out.descripcionRiesgo = descripcion;
  }
  // 04/10/2026 — ramos sin extractor propio: solo QUÉ ramo es. Sus hojas no se leen
  // aquí a propósito: así caen en `cimaExtra` (con la lista de exclusión).
  const generico = BLOQUES_RIESGO_GENERICOS.find((b) => riesgo[b] != null);
  if (generico && out.nombreRiesgo === undefined) {
    out.bloqueRiesgo = generico;
    out.nombreRiesgo = NOMBRE_RAMO_GENERICO[generico];
  }
  // 04/10/2026 — vida y decesos con sus VALORES (antes solo se clasificaban).
  const vida = extractVida(riesgo);
  if (vida) out.vida = vida;
  const decesos = extractDecesos(riesgo);
  if (decesos) out.decesos = decesos;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * La persona asegurada de vida/decesos (`tipo_personafisica`, sin envoltorio) →
 * figura con papel `asegurado` + `fechaNacimiento`. EN CLARO: el persist la cifra
 * (`cifrarPiiAnidadaCima`). Sexo, estado civil, profesión, idioma: fuera.
 */
function personaAseguradaVida(raw: unknown): (FiguraCima & { fechaNacimiento: string | null }) | null {
  const p = asArray(raw as Record<string, unknown> | Record<string, unknown>[] | undefined)[0];
  if (p == null || typeof p !== "object") return null;
  const f = figuraDePersona(p, "asegurado");
  if (!f) return null;
  const pf = ((p as Record<string, unknown>).PersonaFisica ?? p) as Record<string, unknown>;
  return { ...f, fechaNacimiento: toIsoDate(pf.FechaNacimiento) };
}

/** `tipo_prestamo` (13.71) → préstamo vinculado. El `TitularPrestamo` (persona) NO se lee. */
function prestamoCima(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const out = {
    numero: str(p.NumeroPrestamo),
    descripcion: texto(p.DescripcionPrestamo),
    clase: str(p.ClasePrestamo),
    contratacion: str(p.Contratacion),
    importeInicial: toDecimalString(p.ImporteInicial),
    importeNominal: toDecimalString(p.ImporteNominal),
    cuotaInicial: toDecimalString(p.CuotaInicial),
    unidadDuracion: str(p.UnidadDuracion),
    duracion: str(p.DuracionPrestamo),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

/**
 * `RiesgoVida` (EIAC V07.1, `tipo_riesgovida` 13.61) → `datos_especificos.vida`.
 * Forma FIJA (cada clave siempre; `null` = no consta). Los CAPITALES de vida no
 * están en este bloque: van en `DatosCoberturas/Cobertura/CapitalAsegurado`
 * (→ `poliza_coberturas`) y en `ImportesDEC/CapitalAseguradoAgregado`
 * (→ `capitalAgregado`). Los beneficiarios, en `figuras` (papel `beneficiario`).
 * `Maquinas`/`Vehiculos`: solo qué son (descripción/clase, marca, modelo), sin
 * matrícula ni bastidor (identifican a la persona). null si no hay bloque.
 */
export function extractVida(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  const v = riesgo?.RiesgoVida;
  if (v == null || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const maquinas = listaDe((b.Maquinas as { Maquina?: unknown } | undefined)?.Maquina, (m) =>
    limpio({ descripcion: texto(m.Descripcion), marca: str(m.Marca), modelo: str(m.Modelo) }),
  );
  const vehiculos = listaDe((b.Vehiculos as { Vehiculo?: unknown } | undefined)?.Vehiculo, (x) =>
    limpio({ clase: str(x.ClaseVehiculo), marca: str(x.Marca), modelo: str(x.Modelo) }),
  );
  return {
    persona: personaAseguradaVida(b.Persona),
    idAplicacion: str(b.IdAplicacion),
    idEmpleado: str(b.IdEmpleado),
    convenio: str(b.Convenio),
    claseSeguro: str(b.ClaseSeguro),
    edadJubilacion: str(b.EdadJubilacion),
    prestamo: prestamoCima(b.Prestamo),
    actividadesRiesgo: toBool(b.ActividadesRiesgo),
    usoMaquinaria: toBool(b.UsoMaquinaria),
    maquinas: maquinas.length > 0 ? maquinas : null,
    usoVehiculo: toBool(b.UsoVehiculo),
    usoVehiculoPesado: toBool(b.UsoVehiculoPesado),
    vehiculos: vehiculos.length > 0 ? vehiculos : null,
    usoHerramientasCorte: toBool(b.UsoHerramientasCorte),
    usoArmas: toBool(b.UsoArmas),
    contactoQuimicos: toBool(b.ContactoQuimicos),
    trabajoAltura: toBool(b.TrabajoAltura),
  };
}

/**
 * `RiesgoDecesos` (EIAC V07.1, `tipo_riesgodecesos` 13.53) → `datos_especificos.decesos`.
 * La norma solo trae Persona, IdAplicacion, IdEmpleado y Modalidad. Forma fija.
 */
export function extractDecesos(riesgo: ParsedRiesgo | undefined): Record<string, unknown> | null {
  const d = riesgo?.RiesgoDecesos;
  if (d == null || typeof d !== "object") return null;
  const b = d as Record<string, unknown>;
  return {
    persona: personaAseguradaVida(b.Persona),
    idAplicacion: str(b.IdAplicacion),
    idEmpleado: str(b.IdEmpleado),
    modalidad: texto(b.Modalidad),
  };
}

/** `true`/`false`/`1`/`0` del EIAC → boolean; cualquier otra cosa → null. */
function toBool(raw: unknown): boolean | null {
  const t = str(raw)?.toLowerCase();
  if (t === "true" || t === "1" || t === "s") return true;
  if (t === "false" || t === "0" || t === "n") return false;
  return null;
}

/**
 * 28/09/2026 — el resto del `Vehiculo` que CIMA manda y se tiraba (medido en los
 * 36 POL: 17 vehículos, todos con Version/Potencia/Uso/Valor). Nada es PII: el
 * bastidor identifica el COCHE, igual que la matrícula que ya se guarda en claro.
 * Códigos (Combustible GA/DI/GE, UsoVehiculo PA/NI…) TAL CUAL, sin traducir.
 * `Antiguedad` en autos es una FECHA (coincide con la matriculación en el feed
 * medido), no un año: va cruda a `antiguedad` sin interpretar.
 */
function extractVehiculoExtra(
  v: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!v) return out;
  const pares: Array<[string, string | null]> = [
    ["bastidor", str(v.Bastidor)],
    ["version", str(v.Version)],
    ["potencia", str(v.Potencia)],
    ["combustible", str(v.Combustible)],
    ["fechaMatriculacion", toIsoDate(v.FechaMatriculacion) ?? str(v.FechaMatriculacion)],
    ["plazas", str(v.Plazas)],
    ["pma", str(v.PMA)],
    ["usoVehiculo", str(v.UsoVehiculo)],
    ["valorVehiculo", str(v.Valor)],
    ["antiguedad", str(v.Antiguedad)],
  ];
  for (const [k, val] of pares) if (val) out[k] = val;
  const remolque = toBool(v.Remolque);
  if (remolque !== null) out.remolque = remolque;
  return out;
}

/**
 * LOO-918 — instrumentación para el mapper de hogar (Slice 4 de LOO-887).
 *
 * Hoy `extractDatosEspecificos` solo lee `RiesgoAutos`; para hogar/RC/vida el
 * contenido del bloque se descarta y `datos_especificos` queda null. La queja de
 * Alberto (Costa Ballena, `GPDFL0600228`) es que no ve la dirección del riesgo.
 *
 * No podemos escribir el mapper de hogar sin conocer los nombres de campo del
 * bloque `RiesgoHogar` del EIAC — no tenemos ni la spec ni una muestra de XML
 * crudo (`cima_ficheros` solo guarda el hash). Este helper devuelve **la FORMA**
 * del bloque (nombres de clave anidados, 2 niveles) para aprenderla del feed real.
 *
 * ⚠️ SOLO nombres de clave, NUNCA valores: la dirección es PII. Devuelve p.ej.
 * `["Situacion", "Situacion.Direccion", "Situacion.CodigoPostal", "Continente"]`.
 * El caller emite esto en un `operationalEvent` (sin PII) para cuarentena/análisis.
 */
export function describeRiesgoShape(
  riesgo: ParsedRiesgo | undefined,
  bloque:
    | "RiesgoHogar"
    | "RiesgoRC"
    | "RiesgoVida"
    | "RiesgoDecesos"
    | "RiesgoSalud"
    | "RiesgoComercio"
    | "RiesgoComercios" // LOO-807 — plural de Occident (C0468)
    | "RiesgoAccidentes" // Occident (C0468), ramo DGS 211 (BIDV004566)
    | "RiesgoComunidades"
    | "RiesgoEmbarcaciones",
): string[] {
  const raw = riesgo?.[bloque];
  if (raw == null || typeof raw !== "object") return [];
  const paths: string[] = [];
  // `leerSinContar` en vez de `Object.entries`: esto MIRA la forma, no aprovecha
  // el dato. Leerlo por la vía normal haría que la cobertura de campos
  // (`field-coverage.ts`) contase como «leído» todo el contenido del bloque, que
  // es justo lo que aquí se está tirando. Cepo: field-coverage-mapper.test.ts.
  for (const k of Object.keys(raw as Record<string, unknown>)) {
    const v = leerSinContar(raw as object, k);
    paths.push(k);
    // Un solo nivel más de profundidad: los campos del EIAC anidan poco
    // (Situacion/Direccion, DatosContinente/Capital, ...). Nunca los valores.
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      for (const k2 of Object.keys(v as Record<string, unknown>)) {
        paths.push(`${k}.${k2}`);
      }
    }
  }
  return paths.sort();
}

/** EIAC int string ("1") → number o null. PURA, nunca throw. */
function toInt(raw: unknown): number | null {
  const s = str(raw);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/**
 * LOO-751 — claves de Cobertura que SÍ tienen columna tipada en `MappedCobertura`.
 * El resto del objeto Cobertura va a `datosExtra` (cola heterogénea por ramo).
 */
const COBERTURA_MAPPED_KEYS = new Set<string>([
  "NumeroOrden",
  "IdCobertura",
  "DescripcionCobertura",
  "CapitalAsegurado",
  "DescripcionCapitalAsegurado",
  "Franquicia",
  "FechaInicio",
  "FechaFin",
  "ModalidadValoracion",
]);

/**
 * Copia profunda LEYENDO cada hoja. No es por gusto: el medidor de cobertura
 * (`field-coverage.ts`) cuenta como «leído» lo que el mapper accede por `get`, y
 * antes `datosExtra[k] = v` guardaba la REFERENCIA al contenedor — las hojas de
 * `DatosFranquicias`/`DatosLimitesAsegurados`/`DatosImportes` se persistían en
 * `poliza_coberturas.datos_extra` pero la medición decía «no leídas». Misma forma
 * de salida que antes (objeto/array tal cual), así que los lectores no cambian.
 */
function copiaLeida(v: unknown, profundidad = 0): unknown {
  if (v === null || v === undefined || typeof v !== "object" || profundidad > 8) return v;
  if (Array.isArray(v)) return v.map((x) => copiaLeida(x, profundidad + 1));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = copiaLeida((v as Record<string, unknown>)[k], profundidad + 1);
  return out;
}

/**
 * L2 (28/09/2026) — `poliza_coberturas.franquicia` NO se rellenaba nunca: el
 * mapper buscaba `Cobertura.Franquicia` y el EIAC la manda en
 * `DatosFranquicias.Franquicia[]` (ValorExacto / Porcentaje / ValorMinimo /
 * ValorMaximo). Se escribe la PRIMERA en texto legible; el desglose completo
 * sigue en `datosExtra.DatosFranquicias`.
 */
export function franquiciaPrincipal(datosFranquicias: unknown): string | null {
  const lista = asArray(
    (datosFranquicias as { Franquicia?: unknown } | undefined)?.Franquicia as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  );
  const f = lista[0];
  if (!f || typeof f !== "object") return null;
  const exacto = str(f.ValorExacto);
  const pct = str(f.Porcentaje);
  const min = str(f.ValorMinimo);
  const max = str(f.ValorMaximo);
  const partes: string[] = [];
  if (exacto && Number(exacto) !== 0) partes.push(exacto);
  if (pct && Number(pct) !== 0) partes.push(`${pct}%`);
  const rango = [min && Number(min) !== 0 ? `mín. ${min}` : null, max && Number(max) !== 0 ? `máx. ${max}` : null]
    .filter((x): x is string => x !== null)
    .join(", ");
  if (rango) partes.push(partes.length > 0 ? `(${rango})` : rango);
  if (partes.length > 0) return partes.join(" ");
  // Todo a 0: la compañía declara franquicia 0, que ES un dato (no «sin informar»).
  return exacto ?? pct ?? null;
}

/** Mapea UNA Cobertura del EIAC a `MappedCobertura`. PURA, nunca throw. */
function mapCobertura(c: ParsedCobertura): MappedCobertura {
  // Cola heterogénea: cualquier clave de la Cobertura NO mapeada a columna
  // tipada (Limite/Prima/Recargo/...) → datosExtra, para no perder dato por ramo.
  // `copiaLeida`: ver arriba (el medidor tiene que ver estas hojas como leídas).
  const datosExtra: Record<string, unknown> = {};
  for (const k of Object.keys(c)) {
    if (COBERTURA_MAPPED_KEYS.has(k)) continue;
    const v = c[k];
    if (v === null || v === undefined) continue;
    datosExtra[k] = copiaLeida(v);
  }
  return {
    numeroOrden: toInt(c.NumeroOrden),
    codigo: str(c.IdCobertura),
    descripcion: str(c.DescripcionCobertura),
    capitalAsegurado: str(c.CapitalAsegurado),
    descripcionCapital: str(c.DescripcionCapitalAsegurado),
    franquicia: str(c.Franquicia) ?? franquiciaPrincipal(c.DatosFranquicias),
    fechaInicio: toIsoDate(c.FechaInicio),
    fechaFin: toIsoDate(c.FechaFin),
    modalidadValoracion: str(c.ModalidadValoracion),
    datosExtra: Object.keys(datosExtra).length > 0 ? datosExtra : null,
  };
}

/**
 * LOO-751 — aplana las coberturas de TODOS los riesgos de la póliza
 * (Riesgo[]/DatosCoberturas/Cobertura[]). Cada Riesgo y cada Cobertura pueden ser
 * objeto único o array (fast-xml-parser) → asArray en ambos niveles. Devuelve `[]`
 * si no hay ninguna. PURA, nunca throw. Dato de contrato, NO PII.
 */
export function extractCoberturas(
  riesgos: ParsedRiesgo[] | undefined,
): MappedCobertura[] {
  const out: MappedCobertura[] = [];
  for (const riesgo of riesgos ?? []) {
    for (const cobertura of asArray(riesgo?.DatosCoberturas?.Cobertura)) {
      out.push(mapCobertura(cobertura));
    }
  }
  return out;
}

// --- LOO-752: extracción de intervinientes (PII en claro; cifrado en persist) ---

/**
 * Primer teléfono de un `DatosContacto` (EIAC: Telefonos/Telefono[]/Numero).
 * Telefono colapsa a objeto o array (fast-xml-parser). PURA, nunca throw.
 */
function contactoTelefono(c: ParsedDatosContacto | undefined): string | null {
  for (const t of asArray(c?.Telefonos?.Telefono)) {
    const num = str((t as { Numero?: unknown })?.Numero);
    if (num) return num;
  }
  return null;
}

/** Primer email de un `DatosContacto` (EIAC: Emails/Email[]/Direccion). */
function contactoEmail(c: ParsedDatosContacto | undefined): string | null {
  for (const e of asArray(c?.Emails?.Email)) {
    const dir = str((e as { Direccion?: unknown })?.Direccion);
    if (dir) return dir;
  }
  return null;
}

/** Nombre de pila (PersonaFisica/Nombre) o null. */
function personaNombre(p: ParsedPersonaFisica | undefined): string | null {
  return str(p?.Nombre);
}

/** Apellidos concatenados (Apellido1 + Apellido2) o null. */
function personaApellidos(p: ParsedPersonaFisica | undefined): string | null {
  const ap = [str(p?.Apellido1), str(p?.Apellido2)]
    .filter((x): x is string => x !== null)
    .join(" ");
  return ap === "" ? null : ap;
}

/**
 * LOO-752 — proyecta una PersonaFisica del EIAC a un `MappedInterviniente`.
 * `rol`, `fechaCarnet` y `claseFiguraRaw` los aporta el caller (dependen del
 * bloque). PII en CLARO (el cifrado Tier-1 lo hace el persist). PURA, nunca throw.
 * Devuelve null si la persona no trae NI nif NI nombre (fila vacía, se descarta).
 */
function mapPersonaFisicaInterviniente(
  pf: ParsedPersonaFisica | undefined,
  rol: EiacIntervinienteRol,
  opts: { fechaCarnet?: string | null; claseFiguraRaw?: string | null } = {},
): MappedInterviniente | null {
  if (!pf) return null;
  const nif = str(pf.IdPersona);
  const nombre = personaNombre(pf);
  const apellidos = personaApellidos(pf);
  // Fila vacía (ni identificador ni nombre) → no aporta nada, se descarta.
  if (nif === null && nombre === null && apellidos === null) return null;
  return {
    rol,
    nif,
    nombre,
    apellidos,
    fechaNacimiento: toIsoDate(pf.FechaNacimiento),
    telefono: contactoTelefono(pf.DatosContacto),
    email: contactoEmail(pf.DatosContacto),
    fechaCarnet: opts.fechaCarnet ?? null,
    claseFiguraRaw: opts.claseFiguraRaw ?? null,
  };
}

/**
 * Figuras completas (28/09/2026) — proyecta una persona del EIAC, FÍSICA o
 * JURÍDICA, a un `MappedInterviniente`. Hasta hoy solo se leía la física, y el
 * propietario que es una EMPRESA desaparecía (caso Esquiansa: su BMW salía sin
 * propietario). La jurídica va con la razón social en `nombre` y el CIF en `nif`;
 * sin apellidos ni fecha de nacimiento. PURA, nunca throw.
 */
function mapPersonaInterviniente(
  p: ParsedPersona | undefined,
  rol: EiacIntervinienteRol,
  opts: { fechaCarnet?: string | null; claseFiguraRaw?: string | null } = {},
): MappedInterviniente | null {
  if (!p) return null;
  if (p.PersonaFisica) return mapPersonaFisicaInterviniente(p.PersonaFisica, rol, opts);
  const pj = p.PersonaJuridica;
  if (!pj) return null;
  const nif = str(pj.IdPersona);
  const nombre = str(pj.RazonSocial);
  if (nif === null && nombre === null) return null;
  return {
    rol,
    nif,
    nombre,
    apellidos: null,
    fechaNacimiento: null,
    telefono: contactoTelefono(pj.DatosContacto),
    email: contactoEmail(pj.DatosContacto),
    fechaCarnet: opts.fechaCarnet ?? null,
    claseFiguraRaw: opts.claseFiguraRaw ?? null,
  };
}

/**
 * LOO-752 — NIF/identificador normalizado (upper+trim) para comparar identidad.
 * null si vacío. Usado para deduplicar el Asegurado que coincide con el Tomador
 * (minimización Art.5.1.c: no duplicar la PII del tomador como interviniente).
 */
function normalizeNif(raw: string | null | undefined): string | null {
  const t = raw?.trim().toUpperCase();
  return t ? t : null;
}

/**
 * LOO-752 — clasifica `ClaseFigura` de OtrasFiguras a un rol del enum (best-effort,
 * CONFIRMAR codes TIREA). BE/BN → beneficiario; PA → pagador (28/09/2026, rol
 * propio: mig 0103); el resto → contacto genérico (no se pierde el dato).
 */
export function classifyClaseFigura(raw: unknown): EiacIntervinienteRol {
  switch (str(raw)?.toUpperCase()) {
    case "BE":
    case "BN":
      return "beneficiario";
    case "PA":
      return "pagador";
    default:
      return "contacto";
  }
}

/**
 * LOO-752 — extrae TODOS los intervinientes de una póliza:
 *  - `Asegurado[]` (nivel póliza) → rol `asegurado`. Si su NIF coincide con el
 *    del Tomador se guarda SIN contacto ni fecha de nacimiento (eso ya está en
 *    `clientes`): solo la figura, para poder decir «tomador y asegurado».
 *  - `RiesgoAutos/Propietario` de cada Riesgo → rol `propietario`.
 *  - `RiesgoAutos/Conductores/Conductor[]` → rol `conductor_habitual`/`_ocasional`
 *    (ClaseConductor OC → ocasional; default habitual) + fechaCarnet (FechaPermiso).
 *  - `OtrasFiguras/Figura[]` → rol por `ClaseFigura` (beneficiario/contacto).
 * Persona física o jurídica (desde el 28/09/2026: el propietario EMPRESA se
 * perdía). PURA, nunca throw.
 *
 * `tomadorNif` (idPersona del Tomador) marca el Asegurado que es el propio
 * tomador. La misma persona en dos papeles (propietario Y conductor) se guarda
 * en los DOS: el persist deduplica por (persona, rol), no por persona.
 */
export function extractIntervinientes(
  poliza: ParsedPoliza | undefined,
  riesgos: ParsedRiesgo[],
  tomadorNif?: string | null,
): MappedInterviniente[] {
  const out: MappedInterviniente[] = [];
  const tomadorId = normalizeNif(tomadorNif);

  // Asegurado(s) a nivel póliza — iteramos TODOS con asArray (el feed real trae
  // uno, pero alineamos el patrón con Conductores/Figuras). Omitimos el que
  // comparte identidad con el Tomador (no duplicar su PII como interviniente).
  for (const aseguradoNode of asArray(poliza?.Asegurado)) {
    const aseg = mapPersonaInterviniente(aseguradoNode, "asegurado");
    if (!aseg) continue;
    const asegId = normalizeNif(aseg.nif);
    // == Tomador: se guarda la FIGURA («tomador y asegurado»), no su contacto,
    // que ya vive en `clientes` (minimización Art.5.1.c). Antes se omitía entera
    // y el cliente no podía saber que también es el asegurado (28/09/2026).
    if (tomadorId && asegId && asegId === tomadorId) {
      out.push({ ...aseg, fechaNacimiento: null, telefono: null, email: null });
      continue;
    }
    out.push(aseg);
  }

  for (const riesgo of riesgos) {
    const autos =
      riesgo?.RiesgoAutos != null
        ? (riesgo.RiesgoAutos as ParsedRiesgoAutos)
        : undefined;

    // Propietario del vehículo, persona física o jurídica.
    const prop = mapPersonaInterviniente(autos?.Propietario, "propietario");
    if (prop) out.push(prop);

    // Conductores (objeto único o array).
    for (const c of asArray(autos?.Conductores?.Conductor)) {
      const rol: EiacIntervinienteRol =
        str(c?.ClaseConductor)?.toUpperCase() === "OC"
          ? "conductor_ocasional"
          : "conductor_habitual";
      const cond = mapPersonaFisicaInterviniente(c?.DatosConductor, rol, {
        fechaCarnet: toIsoDate(c?.FechaPermiso),
      });
      if (cond) out.push(cond);
    }

    // OtrasFiguras (pagador, beneficiario, ...).
    for (const f of asArray(riesgo?.OtrasFiguras?.Figura)) {
      const claseRaw = str(f?.ClaseFigura);
      const figura = mapPersonaInterviniente(
        f?.DatosFigura,
        classifyClaseFigura(f?.ClaseFigura),
        { claseFiguraRaw: claseRaw },
      );
      if (figura) out.push(figura);
    }

    // L6 (28/09/2026) — en vida y decesos el riesgo ES una persona:
    // `RiesgoVida.Persona` / `RiesgoDecesos.Persona` traen el asegurado con los
    // campos de PersonaFisica SIN envoltorio (medido en los 36 POL). Se tiraban.
    // Mismo trato que el `Asegurado` de póliza: si es el tomador, solo la figura.
    for (const bloque of ["RiesgoVida", "RiesgoDecesos"] as const) {
      const b = riesgo?.[bloque] as { Persona?: unknown } | undefined;
      if (b == null || typeof b !== "object") continue;
      for (const pNode of asArray(b.Persona as Record<string, unknown> | Record<string, unknown>[])) {
        const p = pNode as ParsedPersona & ParsedPersonaFisica;
        const aseg =
          p?.PersonaFisica || p?.PersonaJuridica
            ? mapPersonaInterviniente(p, "asegurado")
            : mapPersonaFisicaInterviniente(p, "asegurado");
        if (!aseg) continue;
        const asegId = normalizeNif(aseg.nif);
        if (tomadorId && asegId && asegId === tomadorId) {
          out.push({ ...aseg, fechaNacimiento: null, telefono: null, email: null });
        } else {
          out.push(aseg);
        }
      }
    }

    // Beneficiario PERSONA (si el EIAC la trae identificada) → rol beneficiario
    // cifrado. En el feed medido el beneficiario es un préstamo HIPOTECARIO sin
    // persona: eso va a `datos_especificos.beneficiarios`, no aquí.
    for (const ben of beneficiariosDe(riesgo)) {
      const persona = personaDeBeneficiario(ben);
      if (!persona) continue;
      const b = mapPersonaInterviniente(persona, "beneficiario");
      if (b) out.push(b);
    }
  }

  return out;
}

function beneficiariosDe(riesgo: ParsedRiesgo | undefined): Record<string, unknown>[] {
  return asArray(
    (riesgo?.Beneficiarios as { Beneficiario?: unknown } | undefined)?.Beneficiario as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  ).filter((b) => b != null && typeof b === "object");
}

/** La persona de un Beneficiario, si la trae (defensivo: el feed medido no la trae). */
function personaDeBeneficiario(ben: Record<string, unknown>): ParsedPersona | null {
  if (ben.PersonaFisica || ben.PersonaJuridica) return ben as ParsedPersona;
  const d = ben.DatosBeneficiario as ParsedPersona | undefined;
  if (d && (d.PersonaFisica || d.PersonaJuridica)) return d;
  return null;
}

// --- 28/09/2026: huecos de la auditoría de CIMA (póliza) ---
//
// Todo lo de esta sección es dato de CONTRATO salvo lo que se marca: va en claro
// a `datos_especificos` (fusión `jsonb ||` en el persist). Los CÓDIGOS se guardan
// crudos: no hay catálogo EIAC en el repo (misma regla que `claseVehiculo`).

/** IBAN normalizado (sin espacios, mayúsculas) o null. */
function normalizarIban(raw: unknown): string | null {
  const t = str(raw)?.replace(/[\s-]/g, "").toUpperCase();
  return t ? t : null;
}

/**
 * Cobro: clase de gestión (CO compañía / ME mediador…), forma de pago (CC…),
 * IBAN y BIC de domiciliación.
 *
 * 🚨 `iban` es PII financiera y sale EN CLARO de aquí (mapper puro): el persist
 * la cifra con `encryptPolizaDatosEspecificos` (clave `iban`, ya en su lista) y
 * la DESCARTA si el cifrado no devuelve `v1:` (`prepararDatosEspecificosCima`).
 * `ibanUltimos4` son SOLO los 4 últimos dígitos, en claro, para poder pintar
 * «···· 1234» sin descifrar.
 *
 * Del titular de la cuenta NO se guarda la persona: solo si es distinto del
 * tomador, comparando por NIF en memoria (`titularCuentaDistinto`). Sin NIF en
 * alguno de los dos → la clave no se escribe (no se sabe ≠ no es distinto).
 */
export function extractCobro(
  poliza: ParsedPoliza | undefined,
  tomadorNif: string | null,
): Record<string, unknown> | null {
  const gc = poliza?.GestionCobro;
  if (gc == null || typeof gc !== "object") return null;
  const out: Record<string, unknown> = {};
  const gestion = str(gc.ClaseGestion);
  const fp = gc.DatosFormaPago;
  const formaPago = str(fp?.ClaseFormaPago);
  if (gestion) out.gestionCobro = gestion;
  if (formaPago) out.formaPago = formaPago;
  const cc = fp?.DatosCuentaCorriente;
  if (cc && typeof cc === "object") {
    const iban = normalizarIban(cc.IBAN);
    if (iban) {
      out.iban = iban;
      const digitos = iban.replace(/\D/g, "");
      if (digitos.length >= 8) out.ibanUltimos4 = digitos.slice(-4);
    }
    const bic = str(cc.BIC);
    if (bic) out.bic = bic;
    const t = cc.Titular;
    const titularNif = normalizeNif(
      str(t?.PersonaFisica?.IdPersona) ?? str(t?.PersonaJuridica?.IdPersona),
    );
    const tomadorId = normalizeNif(tomadorNif);
    if (titularNif && tomadorId) out.titularCuentaDistinto = titularNif !== tomadorId;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Lista de objetos de un nodo EIAC repetible, cada uno proyectado por `fn`. */
function listaDe(
  nodo: unknown,
  fn: (o: Record<string, unknown>) => Record<string, unknown> | null,
): Record<string, unknown>[] {
  return asArray(nodo as Record<string, unknown> | Record<string, unknown>[] | undefined)
    .filter((o) => o != null && typeof o === "object")
    .map(fn)
    .filter((o): o is Record<string, unknown> => o !== null && Object.keys(o).length > 0)
    .slice(0, MAX_LISTA);
}

/** Objeto con solo las claves con valor (null/undefined fuera). */
function limpio(pares: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(pares)) if (v !== null && v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Lo que la compañía dice del CONTRATO y no tenía sitio: duración y clase de
 * póliza, mediador, producto (modalidad/ramo de la entidad), desglose de la
 * prima, capital agregado, comisiones, comercialización, origen de la
 * contratación, regularización y suspensiones. `DatosMoneda` solo se guarda si
 * NO es EUR — y entonces la póliza va a `review` (`moneda_no_eur:XXX`): todos los
 * importes del repo se pintan como euros, y una prima en otra divisa leída como
 * euros es el «dato leído mal» que no deja hueco que lo delate.
 */
export function extractContrato(poliza: ParsedPoliza | undefined): {
  datos: Record<string, unknown> | null;
  reviewReasons: string[];
} {
  const reviewReasons: string[] = [];
  if (!poliza) return { datos: null, reviewReasons };
  const out: Record<string, unknown> = {};

  const duracion = str(poliza.DuracionPoliza);
  const clasePoliza = str(poliza.ClasePoliza);
  if (duracion) out.duracion = duracion;
  if (clasePoliza) out.clasePoliza = clasePoliza;
  const numeroSuplemento = str(poliza.DatosPoliza?.NumeroSuplemento);
  if (numeroSuplemento) out.numeroSuplemento = numeroSuplemento;

  const med = poliza.DatosPoliza?.DatosMediador;
  if (med && typeof med === "object") {
    const mediador = limpio({
      clase: str(med.ClaseMediador),
      codigoInterno: str(med.IdMediador?.CodigoInterno),
      nombre: str(med.NombreMediador),
    });
    if (mediador) out.mediador = mediador;
  }

  const ramo = poliza.DatosPoliza?.DatosRamo;
  if (ramo && typeof ramo === "object") {
    const producto = limpio({
      modalidad: str(ramo.ModalidadRamo),
      descripcion: str(ramo.DescripcionModalidad),
      ramoEntidad: str(ramo.RamoEntidad),
      descripcionRamo: str(ramo.DescripcionRamo),
    });
    if (producto) out.producto = producto;
  }

  const importes = poliza.DatosImportes?.Importes;
  const desglose = listaDe(importes?.DatosCargos?.Cargo, (c) =>
    limpio({ clase: str(c.ClaseCargo), descripcion: texto(c.DescripcionCargo), importe: str(c.Importe) }),
  );
  if (desglose.length > 0) out.desglosePrima = desglose;
  const dec = poliza.DatosImportes?.ImportesDEC;
  const capitalAgregado = str(dec?.CapitalAseguradoAgregado);
  const comisionAnual = str(dec?.ComisionAnualizada);
  if (capitalAgregado) out.capitalAgregado = capitalAgregado;
  if (comisionAnual) out.comisionAnual = comisionAnual;
  const comisiones = listaDe(poliza.DatosComisiones?.Comision, (c) =>
    limpio({ clase: str(c.ClaseComision), bruta: str(c.ComisionBruta) }),
  );
  if (comisiones.length > 0) out.comisiones = comisiones;

  const comercializacion = listaDe(poliza.DatosComercializacion?.Comercializacion, (c) =>
    limpio({ id: str(c.IdComercializacion), clase: str(c.Clase), descripcion: texto(c.Descripcion) }),
  );
  if (comercializacion.length > 0) out.comercializacion = comercializacion;

  const origen = listaDe(poliza.OrigenesContratacion?.OrigenContratacion, (o) =>
    limpio({
      numeroOrden: str(o.NumeroOrden),
      clase: str(o.ClaseContratacion),
      descripcionClase: texto(o.DescripcionClase),
      codigoCentro: str(o.CodigoCentro),
      descripcionCentro: texto(o.DescripcionCentro),
    }),
  );
  if (origen.length > 0) out.origenContratacion = origen;

  const regularizable = toBool(poliza.DatosRegularizacion?.PolizaRegularizable);
  if (regularizable !== null) out.regularizable = regularizable;

  const suspensiones = listaDe(poliza.DatosSuspensiones?.Suspension, (x) =>
    limpio({ numeroOrden: str(x.NumeroOrden), fecha: toIsoDate(x.FechaSuspension) }),
  );
  if (suspensiones.length > 0) out.suspensiones = suspensiones;

  const moneda = str(importes?.DatosMoneda?.Moneda)?.toUpperCase() ?? null;
  if (moneda && moneda !== "EUR") {
    out.moneda = moneda;
    reviewReasons.push(`moneda_no_eur:${moneda}`);
  }
  // 03/10/2026 — `TipoCambio`/`FechaCambio` (Gen, Map). Solo si vienen: el tipo es
  // un ratio (no se redondea a 2 decimales como un importe) y debe ser numérico.
  const cambioRaw = str(importes?.DatosMoneda?.TipoCambio);
  if (cambioRaw !== null && Number.isFinite(Number(cambioRaw)) && Number(cambioRaw) > 0) out.tipoCambio = cambioRaw;
  const fechaCambio = toIsoDate(importes?.DatosMoneda?.FechaCambio);
  if (fechaCambio) out.fechaCambio = fechaCambio;

  return { datos: Object.keys(out).length > 0 ? out : null, reviewReasons };
}

/** Bloques en los que el riesgo ES una persona: su descripción puede ser un nombre. */
const BLOQUES_PERSONA = ["RiesgoVida", "RiesgoDecesos", "RiesgoSalud"] as const;

/**
 * Tipo de vía al empezar una dirección («CL », «AV. », «C/ », «URB »…). Lo que
 * viene DESPUÉS es la calle de alguien.
 */
const INICIO_DE_VIA =
  /(?:^|[\s,(-])(?:C\/|(?:CL|CALLE|AV|AVD|AVDA|AVENIDA|URB|UR|CRA|CTRA|CARRETERA|PZ|PZA|PLAZA|PS|CM|TRAV|TRAVESIA|RD|RONDA|GL|GLORIETA|BDA|BARRIADA|PJ|PASAJE|POL|POLIGONO|ZZ)\b\.?)\s*/i;

/** `texto` (enmascara números largos) cortado en el primer tipo de vía (la dirección es Tier-1). Núcleo común de `descripcionRiesgoSegura` y de `OtrosRiesgos`. null si no queda nada. */
export function textoSinVia(raw: unknown): string | null {
  let d = texto(raw);
  if (d === null) return null;
  const via = INICIO_DE_VIA.exec(d);
  if (via) d = d.slice(0, via.index).replace(/[\s,(-]+$/, "").trim();
  return d === "" ? null : d;
}

/**
 * `DescripcionRiesgo` sin PII. Medido en los 36 POL, la compañía mete LA
 * DIRECCIÓN en la descripción: «Piso-CL <calle>, <nº>…» (Occident),
 * «CL <calle> … SEVILLA» (Generali, sin guion) y hasta en RC («Caseta de feria
 * temporal-C/ <calle>, <nº>…»). Es Tier-1 y aquí iría en claro. Reglas:
 *  - se corta en el primer tipo de vía (`INICIO_DE_VIA`); si no queda nada
 *    delante, no se guarda;
 *  - en inmuebles, además, solo el tipo (antes del primer «-») y sin dígitos;
 *  - en vida/decesos/salud (el riesgo es una persona) no se guarda nunca;
 *  - todo pasa por `taparNumerosLargos`.
 */
export function descripcionRiesgoSegura(r: ParsedRiesgo): string | null {
  if (BLOQUES_PERSONA.some((b) => r[b] != null)) return null;
  const d = textoSinVia(r.DescripcionRiesgo);
  if (d === null) return null;
  if (BLOQUES_CON_SITUACION_RIESGO.some((b) => r[b] != null)) {
    const tipo = d.split("-")[0].trim();
    return tipo === "" || /\d/.test(tipo) ? null : tipo;
  }
  return d;
}

/** L1 — beneficiarios (sin persona) de un riesgo → `{orden, descripcion, prestamo}`. */
function beneficiariosSinPersona(r: ParsedRiesgo): Record<string, unknown>[] {
  return beneficiariosDe(r)
    .map((b) =>
      limpio({
        orden: str(b.Orden) ?? str(b.NumeroOrden),
        // Si trae persona, la descripción puede ser su nombre: va cifrada como
        // interviniente y aquí no se repite.
        descripcion: personaDeBeneficiario(b) ? null : texto(b.DescripcionBeneficiario),
        prestamo: texto((b.Prestamo as { DescripcionPrestamo?: unknown } | undefined)?.DescripcionPrestamo),
      }),
    )
    .filter((x): x is Record<string, unknown> => x !== null)
    .slice(0, MAX_LISTA);
}

/**
 * L1 (28/09/2026) — TODOS los riesgos de la póliza. Hasta hoy `datos_especificos`
 * salía de UN solo riesgo (el que clasificaba) y `extractEmbarcacion` tomaba el
 * `[0]`: una póliza con dos inmuebles o dos barcos perdía el segundo. Las claves
 * planas del primer riesgo se MANTIENEN (las lee central); esto añade la lista.
 *
 * 🚨 Cada elemento puede traer `direccion` EN CLARO (la del inmueble de ESE
 * riesgo): el persist la cifra (`prepararDatosEspecificosCima`, que recorre
 * `riesgos[]`) y la descarta si el cifrado no da `v1:`.
 */
export function extractRiesgos(riesgos: ParsedRiesgo[]): Record<string, unknown> | null {
  const lista: Record<string, unknown>[] = [];
  const beneficiarios: Record<string, unknown>[] = [];
  for (const r of riesgos.slice(0, MAX_LISTA)) {
    if (!r || typeof r !== "object") continue;
    const bens = beneficiariosSinPersona(r);
    beneficiarios.push(...bens);
    const item = limpio({
      id: str(r.IdRiesgo),
      numeroOrden: str(r.NumeroOrden),
      tipo: classifyTipoSeguro(r),
      descripcion: descripcionRiesgoSegura(r),
      inicio: toIsoDate(r.FechaInicio),
      fin: toIsoDate(r.FechaFin),
      ...(extractDatosEspecificos(r) ?? {}),
      ...(bens.length > 0 ? { beneficiarios: bens } : {}),
    });
    // Un riesgo del que solo se sabe el tipo no aporta nada que no diga ya
    // `polizas.tipo`: no se ensucia el JSONB con `[{tipo:'hogar'}]`.
    if (item && Object.keys(item).some((k) => k !== "tipo")) lista.push(item);
  }
  const out: Record<string, unknown> = {};
  if (lista.length > 0) out.riesgos = lista;
  if (beneficiarios.length > 0) out.beneficiarios = beneficiarios.slice(0, MAX_LISTA);
  return Object.keys(out).length > 0 ? out : null;
}

/** EIAC EstadoCivil → texto. Códigos medidos en los 36 POL; `NI` = no informado. */
const ESTADO_CIVIL: Record<string, string | null> = {
  CA: "Casado/a",
  SO: "Soltero/a",
  DI: "Divorciado/a",
  VI: "Viudo/a",
  SE: "Separado/a",
  NI: null,
};

function recorta(v: string | null, n: number): string | null {
  return v === null ? null : v.slice(0, n);
}

/** Código INE de provincia (1–2 dígitos) → nombre; el CP como respaldo; si no, crudo. */
function nombreProvincia(raw: unknown, cp: string | null): string | null {
  const t = str(raw);
  if (t !== null && /^\d{1,2}$/.test(t)) return provinciaPorCp(t.padStart(2, "0")) ?? provinciaPorCp(cp);
  return t ?? provinciaPorCp(cp);
}

/**
 * L14 (28/09/2026) — contacto del tomador → `clientes`. PII EN CLARO (la cifra el
 * persist). `null` si el tomador no trae nada de esto.
 */
export function extractTomadorContacto(p: ParsedPersona | undefined): MappedTomadorContacto | null {
  if (!p) return null;
  const pf = p.PersonaFisica;
  const pj = p.PersonaJuridica;
  const dom = pf?.Domicilio ?? pj?.Domicilio;
  const contacto = pf?.DatosContacto ?? pj?.DatosContacto;
  if (!pf && !pj) return null;
  const direccion = [str(dom?.NombreVia), str(dom?.OtrosDatosVia)]
    .filter((x): x is string => x !== null)
    .join(" ");
  const cp = recorta(str(dom?.CodigoPostal), 10);
  const ec = str(pf?.EstadoCivil)?.toUpperCase() ?? null;
  const out: MappedTomadorContacto = {
    direccion: direccion === "" ? null : direccion,
    codigoPostal: cp,
    ciudad: recorta(str(dom?.Poblacion), 100),
    provincia: recorta(nombreProvincia(dom?.Provincia, cp), 100),
    telefono: contactoTelefono(contacto),
    email: contactoEmail(contacto),
    fechaNacimiento: pf ? toIsoDate(pf.FechaNacimiento) : null,
    estadoCivil: ec === null ? null : recorta(ec in ESTADO_CIVIL ? ESTADO_CIVIL[ec] : ec, 40),
    ocupacion: pf ? recorta(strUtil(pf.Profesion?.Descripcion), 120) : null,
    sector: pj ? recorta(strUtil(pj.Actividad?.DescripcionActividad), 120) : null,
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

/** Nº de recibos al año por `FraccionPago` (AN/UN = 1). null si desconocido. */
const FRACCIONES_POR_ANIO: Record<string, number> = { AN: 1, UN: 1, SE: 2, TR: 4, ME: 12 };

/**
 * Compañías cuyo `Importes.PrimaTotal/PrimaNeta` es la prima ANUAL aunque la
 * póliza fraccione. MEDIDO el 28/09/2026 sobre los 36 POL + 62 REC del Portal
 * CIMA, no supuesto:
 *  - C0058 Mapfre: nunca manda `ImportesDEC`; póliza SE con PrimaTotal 593,80
 *    y sus recibos de ~297 (la mitad) → el de la póliza es el anual.
 *  - C0072 Generali: en TR/SE `PrimaTotal` == `PrimaTotalAnualizada`.
 * Occident (C0468) NO está: su `PrimaTotal` es el del PERIODO (TR 190,29 ↔
 * anualizada 761,17). Una compañía nueva entra aquí solo tras medirla igual.
 */
export const COMPANIAS_PRIMA_TOTAL_ANUAL: ReadonlySet<string> = new Set(["C0058", "C0072"]);

/**
 * L10 (28/09/2026) — prima ANUAL desde el EIAC.
 *
 * 1. `ImportesDEC.*Anualizada` si viene: es la anual por definición.
 * 2. Si no, `Importes.PrimaTotal/PrimaNeta` SOLO si el pago es anual o único
 *    (`AN`/`UN`): entonces el importe del periodo ES el anual.
 * 2b. Compañía de `COMPANIAS_PRIMA_TOTAL_ANUAL` (medidas): la del fichero ES anual.
 * 3. Resto, fraccionada sin anualizada → `null` y `primaAnualDudosa`. NO se multiplica
 *    por el nº de fracciones: medido en los 36 POL, el significado de
 *    `Importes.PrimaTotal` depende de la COMPAÑÍA — Occident (C0468) manda el
 *    importe del PERIODO (TR 190,29 ↔ anualizada 761,17), Generali (C0072) y
 *    Mapfre (C0058) mandan el ANUAL (Mapfre SE 593,80 con recibos de ~297).
 *    Multiplicar duplicaría o cuadruplicaría la prima de Mapfre: un número
 *    plausible y falso, peor que un hueco. El importe del fichero se conserva
 *    crudo en `primaTotalFichero` para no perderlo.
 */
export function primaAnualDesdeEiac(poliza: ParsedPoliza | undefined): {
  primaBruta: string | null;
  primaAnual: string | null;
  dudosa: boolean | null;
  primaTotalFichero: string | null;
} {
  const dec = poliza?.DatosImportes?.ImportesDEC;
  const imp = poliza?.DatosImportes?.Importes;
  const brutaDec = toDecimalString(dec?.PrimaTotalAnualizada);
  const netaDec = toDecimalString(dec?.PrimaNetaAnualizada);
  const brutaPer = toDecimalString(imp?.PrimaTotal);
  const netaPer = toDecimalString(imp?.PrimaNeta);
  const fp = str(poliza?.FraccionPago)?.toUpperCase() ?? null;
  const dgs = codigoDgsDe(poliza?.DatosPoliza?.CodigoEntidad)?.toUpperCase() ?? null;
  const periodoEsAnual =
    (fp !== null && FRACCIONES_POR_ANIO[fp] === 1) ||
    (dgs !== null && COMPANIAS_PRIMA_TOTAL_ANUAL.has(dgs));
  const primaBruta = brutaDec ?? (periodoEsAnual ? brutaPer : null);
  const primaAnual = netaDec ?? (periodoEsAnual ? netaPer : null);
  const hayImporte = brutaPer !== null || netaPer !== null || brutaDec !== null || netaDec !== null;
  const dudosa = !hayImporte
    ? null
    : (brutaDec === null && brutaPer !== null && !periodoEsAnual) ||
      (netaDec === null && netaPer !== null && !periodoEsAnual);
  return { primaBruta, primaAnual, dudosa, primaTotalFichero: dudosa ? brutaPer : null };
}

function mapPersona(p: ParsedPersona | undefined): MappedTomador | null {
  if (!p) return null;
  if (p.PersonaJuridica) {
    return {
      tipoPersona: "juridica",
      tipoIdentificacion: str(p.PersonaJuridica.TipoIdentificacion) ?? "OT",
      idPersona: str(p.PersonaJuridica.IdPersona),
      nombreCompleto: str(p.PersonaJuridica.RazonSocial),
    };
  }
  if (p.PersonaFisica) {
    const nombre = [
      str(p.PersonaFisica.Nombre),
      str(p.PersonaFisica.Apellido1),
      str(p.PersonaFisica.Apellido2),
    ]
      .filter((x): x is string => x !== null)
      .join(" ");
    return {
      tipoPersona: "fisica",
      tipoIdentificacion: str(p.PersonaFisica.TipoIdentificacion) ?? "OT",
      idPersona: str(p.PersonaFisica.IdPersona),
      nombreCompleto: nombre === "" ? null : nombre,
    };
  }
  return null;
}

/**
 * LOO-748 — Mapea TODAS las pólizas de un EIAC POL. Los ficheros de cartera
 * (proceso 132) contienen N pólizas en `<Objetos><Poliza>` (array); antes se
 * tomaba solo la `[0]` y se perdía el resto de la cartera. Devuelve una entrada
 * por póliza. Si el fichero no trae ninguna, devuelve un único `review` (faltan
 * datos) para que el pipeline lo registre sin perderlo. PURA, nunca throw.
 */
export function mapEiacPolAll(parsed: ParsedEiacPol): EiacPolMapped[] {
  const polizas = asArray(unwrapObjetos(parsed)?.Poliza);
  if (polizas.length === 0) return [mapOnePoliza(undefined)];
  return polizas.map((poliza) => mapOnePoliza(poliza));
}

/**
 * Backward-compat (DEPRECATED, LOO-748): mapea solo la PRIMERA póliza. Se
 * mantiene para tests/callers legacy; el pipeline usa `mapEiacPolAll`.
 */
export function mapEiacPol(parsed: ParsedEiacPol): EiacPolMapped {
  return mapOnePoliza(asArray(unwrapObjetos(parsed)?.Poliza)[0]);
}

/**
 * Mapea UNA póliza + su «resto» (`datos_especificos.cimaExtra`): toda hoja del EIAC
 * que ningún extractor lee y no está en la lista de exclusión (`cima-extra.ts`).
 * `cimaExtra: []` solo se escribe si ya hay algo en `datos_especificos` (la fusión
 * `jsonb ||` borra así el resto viejo); una ficha NULL no pasa a `{cimaExtra:[]}`.
 */
function mapOnePoliza(poliza: ParsedPoliza | undefined): EiacPolMapped {
  const { resultado, cimaExtra } = conCimaExtra(poliza, "Poliza", (p) =>
    mapOnePolizaEspecifico(p as ParsedPoliza | undefined),
  );
  if (cimaExtra.entradas === null || (cimaExtra.entradas.length === 0 && resultado.datosEspecificos === null)) return resultado;
  return {
    ...resultado,
    datosEspecificos: { ...(resultado.datosEspecificos ?? {}), ...camposCimaExtra(cimaExtra) },
  };
}

/** Mapea UNA póliza EIAC a `EiacPolMapped` (extractores específicos). PURA, nunca throw por datos. */
function mapOnePolizaEspecifico(poliza: ParsedPoliza | undefined): EiacPolMapped {
  const reviewReasons: string[] = [];

  const idPolizaEntidad = str(poliza?.DatosPoliza?.IdPoliza);
  const codigoEntidadDgs = codigoDgsDe(poliza?.DatosPoliza?.CodigoEntidad);
  const ramoDgs = str(poliza?.DatosPoliza?.DatosRamo?.RamoDGS);
  const situacion = str(poliza?.SituacionPoliza);
  // LOO-915 — el código crudo se sigue guardando tal cual en `polizas.situacion`;
  // `estado` solo se deriva cuando sabemos traducirlo.
  const { estado: estadoDerivado, conocido: situacionConocida } =
    mapSituacionPoliza(situacion);
  // LOO-828 — `aseguradora` = nombre de COMPAÑÍA por código DGS (CIMA_DGS_CARRIERS,
  // fuente única en labels.ts). Antes se usaba DescripcionRamo, que describe el
  // PRODUCTO ("ALLIANZ AUTO", "AUTOMOVILES..."), no la entidad — la ficha/listado
  // mostraban el ramo como aseguradora. Fallback si el DGS no está en el catálogo:
  // comportamiento anterior (DescripcionRamo → código DGS crudo), nunca null-out.
  const aseguradora =
    nombreCarrierCima(codigoEntidadDgs) ??
    str(poliza?.DatosPoliza?.DatosRamo?.DescripcionRamo) ??
    codigoEntidadDgs;

  // Fechas (locked): vencimiento del EIAC; fallback FechaFinSeguro. Sin derivar.
  const fechaEfectoInicial = toIsoDate(poliza?.Fechas?.FechaEfectoInicial);
  const fechaVencimiento =
    toIsoVencimiento(poliza?.Fechas?.FechaVencimiento) ??
    toIsoVencimiento(poliza?.Fechas?.FechaFinSeguro);
  if (!fechaEfectoInicial) reviewReasons.push("falta_fecha_efecto_inicial");
  // Propuesta (PR): aún sin vencimiento real (Allianz manda 2000-01-01) → null SIN review.
  // Cualquier otra situación sin vencimiento (incluido el cajón 2000-01-01) sigue a review.
  if (!fechaVencimiento && situacion?.trim().toUpperCase() !== "PR") {
    reviewReasons.push("falta_fecha_vencimiento");
  }

  // Producto por <RiesgoXxx>, no por RamoDGS. LOO-XXX — una póliza multi-riesgo
  // (fast-xml-parser colapsa <Riesgo> repetido a array) puede traer el bloque
  // clasificable en CUALQUIER posición, no solo en riesgos[0]: medido en prod,
  // 2 POL de Occident seguían en review tras el fix LOO-807 (RiesgoComercios ya
  // reconocido) porque ese bloque no iba primero en el array. Probamos todos los
  // riesgos y nos quedamos con el primero que clasifique.
  const riesgos = asArray(poliza?.DatosRiesgos?.Riesgo);
  let tipoSeguro: EiacTipoSeguro | null = null;
  let riesgoClasificado: ParsedRiesgo | undefined;
  for (const r of riesgos) {
    const t = classifyTipoSeguro(r, ramoDgs);
    if (t !== null) {
      tipoSeguro = t;
      riesgoClasificado = r;
      break;
    }
  }
  if (tipoSeguro === null) {
    reviewReasons.push("tipo_seguro_no_clasificable");
    // LOO-806 — diagnóstico: registrar QUÉ bloques RiesgoXxx no se reconocieron
    // en NINGUNO de los riesgos (solo nombres de nodo XML, NO PII) → el evento de
    // review revela el ramo del carrier (p.ej. Occident M00171) sin re-inspeccionar
    // el rawXml no persistido.
    const bloques = Array.from(
      new Set(riesgos.flatMap((r) => unrecognizedRiesgoBlocks(r))),
    ).sort();
    reviewReasons.push(
      bloques.length > 0 ? `riesgo_no_reconocido:${bloques.join(",")}` : "riesgo_sin_bloque",
    );
  }

  // Datos NO-PII del objeto asegurado (vehículo) → datos_especificos. Del mismo
  // riesgo que clasificó el producto (no necesariamente riesgos[0]).
  const datosDelRiesgo = extractDatosEspecificos(riesgoClasificado ?? riesgos[0]);
  // Lo que la compañía dice de la PÓLIZA (anulación, reemplazada, suplementos,
  // otros datos) va a la misma columna: la lee la ficha de /correduria.
  const datosDePoliza = extractDatosPoliza(poliza, riesgos);

  // 28/09/2026 — huecos de la auditoría (ver sección «huecos de la auditoría»).
  // Tomador primero: el cobro compara su NIF con el del titular de la cuenta.
  const tomador = mapPersona(poliza?.Tomador);
  const cobro = extractCobro(poliza, tomador?.idPersona ?? null);
  const contrato = extractContrato(poliza);
  reviewReasons.push(...contrato.reviewReasons);
  const todosLosRiesgos = extractRiesgos(riesgos);
  const primas = primaAnualDesdeEiac(poliza);
  const idClienteCompania =
    str(poliza?.Tomador?.PersonaFisica?.IdCliente) ?? str(poliza?.Tomador?.PersonaJuridica?.IdCliente);
  const idActividadTomador = str(poliza?.Tomador?.PersonaJuridica?.Actividad?.IdActividad);
  const figuras = extractFigurasPoliza(poliza);
  const extra: Record<string, unknown> = {
    ...(cobro ?? {}),
    ...(contrato.datos ?? {}),
    ...(todosLosRiesgos ?? {}),
    ...(idClienteCompania ? { idClienteCompania } : {}),
    ...(idActividadTomador ? { idActividadTomador } : {}),
    ...(primas.dudosa !== null ? { primaAnualDudosa: primas.dudosa } : {}),
    ...(primas.primaTotalFichero ? { primaTotalFichero: primas.primaTotalFichero } : {}),
    // 04/10/2026 — figuras con estructura (EN CLARO aquí; las cifra el persist).
    ...(figuras.length > 0 ? { figuras } : {}),
  };
  const hayExtra = Object.keys(extra).length > 0;

  // Una póliza EN VIGOR cuyo fichero ya no trae `DatosAnulacion` manda
  // `anulacion: null`: la fusión `jsonb ||` borra así la anulación vieja de una
  // póliza rehabilitada. Solo cuando ya hay algo que escribir, para no convertir
  // en `{anulacion:null}` una ficha que hoy es NULL (hay lectores que distinguen).
  const limpiaAnulacion = estadoDerivado === "activa" && !datosDePoliza?.anulacion;
  const datosEspecificos =
    datosDelRiesgo || datosDePoliza || hayExtra
      ? {
          ...(datosDelRiesgo ?? {}),
          ...(datosDePoliza ?? {}),
          ...extra,
          ...(limpiaAnulacion ? { anulacion: null } : {}),
        }
      : null;

  // LOO-918 — mientras no exista el mapper de hogar/RC/vida, aprender la FORMA
  // del bloque de riesgo (solo nombres de clave, sin valores → sin PII) para
  // poder escribir el extractor con datos reales. Solo cuando extractDatos no
  // sacó nada (auto ya está cubierto) y hay un bloque no-auto presente.
  // LOO-807 — un tipo puede tener varios nombres de bloque (comercio singular/
  // plural): se describe el PRIMER candidato presente en el riesgo; si no, la
  // instrumentación saldría vacía en silencio con el plural de Occident.
  const bloquesCandidatos: readonly Parameters<typeof describeRiesgoShape>[1][] =
    tipoSeguro && tipoSeguro !== "auto" && datosDelRiesgo == null
      ? (RIESGO_BLOQUES_POR_TIPO[tipoSeguro] ?? ["RiesgoHogar"])
      : [];
  const bloqueRiesgo =
    bloquesCandidatos.find((b) => riesgoClasificado?.[b] != null) ?? bloquesCandidatos[0];
  const riesgoShape =
    bloqueRiesgo != null ? describeRiesgoShape(riesgoClasificado ?? riesgos[0], bloqueRiesgo) : [];

  // Coberturas/garantías de TODOS los riesgos (LOO-751) → poliza_coberturas. Dato
  // de contrato (NO PII). Su ausencia NO manda a review (es informativa).
  const coberturas = extractCoberturas(riesgos);

  // Primas (EIAC §3.5) + fraccionamiento (§3.1). Dato de NEGOCIO (no PII). Su ausencia
  // NO manda a review (la prima es informativa, no gating de identidad/fechas/producto).
  // Preferimos las cifras ANUALIZADAS (comparables entre fraccionamientos); fallback a las
  // del periodo. bruta = con impuestos (PrimaTotal); anual = neta (PrimaNeta).
  // L10 (28/09/2026): la del periodo solo cuenta como anual si el pago es anual
  // o único — ver `primaAnualDesdeEiac`.
  const { primaBruta, primaAnual } = primas;
  const fraccionamiento = classifyFraccionPago(poliza?.FraccionPago);

  // Tomador → cliente de cartera (única PII promovida a `clientes`).
  if (!tomador) reviewReasons.push("falta_tomador");
  const tomadorContacto = extractTomadorContacto(poliza?.Tomador);

  // LOO-752 (D6): el Asegurado distinto del Tomador YA NO manda la póliza a
  // review. Decisión LOPD D1=A: se importa la PII Tier-1 del asegurado/conductor/
  // propietario/figuras CIFRADA (Art.14) en `poliza_intervinientes` → la regla
  // `art14_asegurado_distinto` se elimina. Los intervinientes se extraen abajo
  // (Asegurado + Propietario + Conductores + OtrasFiguras de TODOS los Riesgo[])
  // y el persist los inserta con PII Tier-1 cifrada. Pasamos el NIF del Tomador
  // para no duplicar su PII si el Asegurado es la misma persona (Art.5.1.c).
  const intervinientes = extractIntervinientes(
    poliza,
    riesgos,
    tomador?.idPersona ?? null,
  );

  // Salud (defensivo): solo por bloque <RiesgoSalud> (el RamoDGS no es fiable).
  // 04/10/2026 — CUALQUIER riesgo de salud o asistencia sanitaria (no solo el primero
  // que clasifica): una POL [RiesgoIncendios, RiesgoAsistenciaSanitaria] es Art. 9.
  const esSalud =
    tipoSeguro === "salud" ||
    riesgos.some((r) => r?.RiesgoSalud != null || r?.RiesgoAsistenciaSanitaria != null);

  // outcome: review_salud gana sobre review; review gana sobre ok.
  let outcome: EiacPolOutcome = "ok";
  if (esSalud) {
    outcome = "review_salud";
    reviewReasons.push("salud_riesgo_art9");
  } else if (reviewReasons.length > 0) {
    outcome = "review";
  }
  // V07.1 — CodigoEntidad presente con forma ilegible: nota DESPUÉS de fijar el
  // outcome (no manda a review: una POL sin DGS ya entraba así). El pipeline la deja
  // en un audit event para que el DGS nulo no pase en silencio.
  if (codigoEntidadFormatoDesconocido(poliza?.DatosPoliza?.CodigoEntidad)) {
    reviewReasons.push(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO);
  }

  return {
    outcome,
    reviewReasons,
    idPolizaEntidad,
    codigoEntidadDgs,
    ramoDgs,
    situacion,
    estado: estadoDerivado,
    situacionConocida,
    riesgoShape,
    fechaEfectoInicial,
    fechaVencimiento,
    tipoSeguro,
    aseguradora,
    // Devolvemos el Tomador aunque vaya a review (el persist decide según outcome).
    tomador,
    datosEspecificos,
    primaBruta,
    primaAnual,
    fraccionamiento,
    coberturas,
    intervinientes,
    fechasExtra: {
      emision: toIsoDate(poliza?.Fechas?.FechaEmision),
      efectoActual: toIsoDate(poliza?.Fechas?.FechaEfectoActual),
      situacion: toIsoDate(poliza?.Fechas?.FechaSituacion),
      solicitud: toIsoDate(poliza?.Fechas?.FechaSolicitud),
    },
    tomadorContacto,
  };
}
