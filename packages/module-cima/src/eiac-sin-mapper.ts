/**
 * LOO-750 (épica CIMA LOO-515) — Mapper PURO de un EIAC SIN (siniestro) parseado
 * a la forma intermedia `EiacSinMapped` que el pipeline de ingesta y el persist
 * (`persist-siniestro.ts`) consumen. Espejo de `eiac-pol-mapper.ts`.
 *
 * CONTRATO DE ENTRADA — anclado a la estructura REAL del SIN verificada contra
 * prod (probe 2026-06-24, 2 muestras Allianz C0109; EIAC 6.0). Rutas:
 *   - `Objetos.Siniestro` (objeto único o array; el adapter colapsa arrays de 1).
 *   - cabecera: `DatosSiniestro/{IdSiniestroEntidad, FechaOcurrencia,
 *     PosicionSiniestro, SituacionesSiniestro/Situacion/SituacionSiniestro,
 *     DescripcionSiniestro, TipologiaSiniestro, LugarSiniestro/*}`.
 *   - póliza: `DatosPoliza/{IdPoliza, CodigoEntidad/CodigoDGS}` (para el matching).
 *   - terceros: `DatosSiniestro/FigurasSiniestro/Figura[]` con
 *     `DatosFigura/(PersonaFisica|PersonaJuridica)` + `ClaseFigura`.
 *   - lesionados: `DatosSiniestro/Asegurado/Lesionados` (en las muestras solo
 *     `Numero` = conteo; si hay detalle de persona, se trata como Art.9 salud).
 *
 * Diseño (decisiones operador D1/D7/D8 LOCKED):
 *  - Importa TODA la info (cabecera + Figuras/terceros + lesionados) — Alberto es
 *    responsable con acceso lícito preexistente; la plataforma espeja (encargada).
 *  - GATING ESTRICTO (D8): sin `FechaOcurrencia` → `needsReview` con razón. Dato de
 *    SALUD (lesionado con detalle de persona, Art.9) → `needsReviewSalud`
 *    (precedencia salud > resto). El matching/cuarentena por póliza lo decide el
 *    pipeline (D2), NO el mapper.
 *  - `ClaseFigura` (D7 híbrido, dict best-effort, CONFIRMAR codes TIREA): AD →
 *    contrario; TE/TG → testigo; LE/PE → lesionado; DESCONOCIDO → contrario
 *    genérico + `flagReview` (no se pierde el dato, va a revisión humana).
 *  - Estado → `estadoSiniestroEnum` con dict best-effort + default `abierto`
 *    (CONFIRMAR codes SituacionSiniestro/PosicionSiniestro TIREA).
 *  - Función PURA: sin BD, sin red, sin crypto, sin process.env. El cifrado de PII
 *    de terceros y el matching ocurren en el persist / pipeline.
 *
 * Toda navegación es defensiva (optional chaining + `asArray`): nunca lanzamos por
 * datos basura; reusamos `asArray`/`toIsoDate` del POL mapper para no duplicar.
 */

import { camposCimaExtra, conCimaExtra, type CimaExtraEntrada } from "./cima-extra.ts";
import { codigoDgsDe, codigoEntidadFormatoDesconocido, CODIGO_ENTIDAD_FORMATO_DESCONOCIDO, type CodigoEntidadEiac } from "./codigo-entidad.ts";
import { asArray, taparNumerosLargos, textoSinVia, toIsoDate, toDecimalString } from "./eiac-pol-mapper.ts";
import { extractTercerosSiniestro, type FiguraCima } from "./figuras-cima.ts";

// --- Tipos de salida ---

/** Subset del enum `estado_siniestro` del schema (schema.ts). */
export type EiacSiniestroEstado =
  | "abierto"
  | "en_tramitacion"
  | "cerrado"
  | "rechazado";

export type EiacSinOutcome = "ok" | "review" | "review_salud";

/**
 * Un daño del `Asegurado/ImplicadoDiversos/DanosSiniestro/DanoSiniestro`. NO es PII
 * (describe el DAÑO al bien, no a una persona) y NO tiene catálogo de códigos que
 * traducir: `DescripcionDano` ya es texto legible y `ValorDano` un importe, al
 * contrario que `ClaseAnimal`/`UsoAnimal` del POL mapper (esos SÍ son códigos sin
 * catálogo documentado, por eso se dejan sin mapear).
 */
export interface MappedDano {
  /** Pasa por `textoSinVia`: corta en el primer tipo de vía y tapa números largos. */
  descripcion: string | null;
  valor: string | null;
  /** true = daño de un CONTRARIO (`Contrarios/Contrario/ImplicadoDiversos`). Ausente = del asegurado. */
  contrario?: true;
}

/**
 * Una situación del historial del siniestro (`SituacionesSiniestro/Situacion`).
 * Claves oficiales TIREA (`claves_situacionsiniestro`, Documentos Estándar V07.1
 * §13.3.48): AP Abierto · CE Cerrado · RA Reabierto · RC Rechazado. El código se
 * guarda CRUDO; traducirlo es cosa de quien lo pinta.
 */
export interface MappedSituacion {
  codigo: string;
  /** ISO `YYYY-MM-DD` o null. */
  fecha: string | null;
  descripcion: string | null;
}

/**
 * Una acción de tramitación (`AccionesSiniestro/Accion`). Claves oficiales:
 * `claves_accionsiniestro` (DI Documentación · EJ Judicial · EP Peritación ·
 * ER Reparación · IN Indemnización), `claves_situacionaccion` (PD Pendiente de
 * inicio · EC En curso · FI Finalizada) y `claves_figuraaccion` (AB Abogado ·
 * EA Empresa de asistencia · PE Perito · RE Reparador · TA Taller · TR
 * Tramitador). Aquí van la CLASE y el nombre; la identificación completa (documento,
 * domicilio, contacto) va CIFRADA a `cima_extra.terceros` (20/10/2026, figuras-cima.ts).
 */
export interface MappedAccion {
  accion: string;
  fecha: string | null;
  descripcion: string | null;
  situacion: string | null;
  /** Claves `claves_figuraaccion` CRUDAS. Se queda como `string[]` a propósito:
   * `module-seguros`/`module-seguros-portal` (central) lo leen como códigos. */
  figuras: string[];
  /**
   * 28/09/2026 — el NOMBRE de cada figura (`FigurasAccion/FiguraAccion/DatosFigura`),
   * paralelo a `figuras` para no romper a quien lee `figuras` como códigos.
   * Empresa (`PersonaJuridica`) → `razonSocial` en claro; persona física →
   * `nombre`, que el persist CIFRA. Descartados: IdPersona, sexo, fecha nac.
   */
  figurasDetalle: MappedFiguraNombrada[];
}

/** Una figura con nombre (acción o asistencia). PF → `nombre` (el persist lo
 * cifra); PJ → `razonSocial` (en claro, es una empresa). */
export interface MappedFiguraNombrada {
  clase: string | null;
  razonSocial: string | null;
  /** Solo persona física. En CLARO aquí; el persist lo cifra. */
  nombre: string | null;
}

/** Un pago del siniestro (`PagosSiniestro/PagoSiniestro`). Importe como decimal-string. */
export interface MappedPago {
  fecha: string | null;
  importe: string | null;
  descripcion: string | null;
  /** `ClaseFigura` del receptor (PE, TA…) o null si no consta. */
  receptor: string | null;
  /** 28/09/2026. ISO o null. */
  fechaLiquidacion?: string | null;
  /** `ClaseFormaPago` CRUDA (CC…). El IBAN del perceptor se DESCARTA a propósito. */
  formaPago?: string | null;
  /** 03/10/2026 — `ReceptoresPago/Figura/DatosFigura/PersonaJuridica/RazonSocial` (empresa
   * que cobra: taller, perito…). SOLO persona jurídica; el nombre de una persona física no
   * se guarda. Ausente = no vino o era persona física. */
  receptorRazonSocial?: string;
  /** `CoberturasIndemnizadas/Cobertura[]`: id + descripción + `ModalidadValoracion` cruda. */
  coberturas?: Array<{ id: string | null; descripcion: string | null; modalidad: string | null }>;
}

/** `Expedientes/Expediente` (claves_claseexpediente / estadoexpediente CRUDAS). */
export interface MappedExpediente {
  numero: string | null;
  clase: string | null;
  estado: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  importeReserva: string | null;
  totalPagos: string | null;
  totalRecobros: string | null;
  coberturas: Array<{
    id: string | null;
    descripcion: string | null;
    capital: string | null;
    fechaInicio: string | null;
    fechaFin: string | null;
  }>;
}

/** El riesgo afectado (`RiesgosSiniestro/RiesgoRecSin` elegido por `Asegurado/IdRiesgo`). */
export interface MappedRiesgo {
  id: string | null;
  descripcion: string | null;
  coberturas: Array<{
    id: string | null;
    descripcion: string | null;
    capital: string | null;
    /** 03/10/2026 — por cobertura (Occident). Ausentes si no vinieron (nunca 0/''). */
    primaNeta?: string;
    primaTotal?: string;
    fechaInicio?: string;
    descripcionCapital?: string;
  }>;
}

/** Reserva desglosada (`DescripcionReserva` = «RESERVA POR COBERTURAS=16-400.00/43-78.00»). */
export interface MappedReservaDesglose {
  /** Texto crudo tal cual lo manda la compañía. */
  descripcion: string;
  /** Pares cobertura-importe si el texto sigue el patrón; `[]` si no se ha sabido leer. */
  coberturas: Array<{ cobertura: string; importe: string | null }>;
}

/** Vehículo del ASEGURADO (`Asegurado/ImplicadoAutos`). Matrícula/marca/modelo en
 * claro como en la póliza; `conductorNombre` en CLARO aquí, lo cifra el persist. */
export interface MappedVehiculo {
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  conductorNombre: string | null;
  /** 03/10/2026 — resto del vehículo del asegurado. Códigos CRUDOS (sin catálogo en el
   * repo); ausentes si no vinieron. NUNCA bastidor. */
  clase?: string;
  categoria?: string;
  combustible?: string;
  uso?: string;
  valor?: string;
  potencia?: string;
  cilindrada?: string;
  plazas?: string;
  fechaMatriculacion?: string;
}

/**
 * Vehículo/conductor del CONTRARIO, que Allianz manda en `OtrosDatos/Dato` con
 * `IdDato` CONT_VEHICULO_MAT / CONT_VEHICULO_MARCA / CONT_CONDUCTOR_NOM. Va aparte
 * del vehículo del asegurado a propósito: mezclarlos sería un dato leído mal. Todo
 * en CLARO aquí; el persist cifra matrícula, conductor y el valor de lo desconocido
 * (dato de tercero, igual que `siniestro_contrarios.matricula`).
 */
export interface MappedVehiculoContrario {
  matricula: string | null;
  marcaModelo: string | null;
  conductorNombre: string | null;
  /** `IdDato` no reconocidos: se guardan con su valor (cifrado en el persist). */
  otros: Array<{ idDato: string; descripcion: string | null; valor: string | null }>;
}

/** Una asistencia (`Asegurado/Asistencias/Asistencia`). */
export interface MappedAsistencia extends MappedFiguraNombrada {
  descripcion: string | null;
}

/** Clasificación normalizada del tercero (a qué subtabla va). */
export type FiguraKind = "contrario" | "testigo" | "lesionado";

/** Un tercero implicado (Figura) ya clasificado. PII en CLARO (el cifrado es del
 * persist). Campos opcionales según el tipo de figura. */
export interface MappedFigura {
  kind: FiguraKind;
  /** PersonaFisica: Nombre+Apellidos. PersonaJuridica: RazonSocial. PII Tier-1. */
  nombre: string | null;
  /** PII Tier-1. */
  telefono: string | null;
  /** Solo contrario — PII Tier-1 (matrícula del vehículo del tercero). */
  matricula: string | null;
  /** Solo contrario — claro (atributo del vehículo, no PII Tier-1). */
  marcaModelo: string | null;
  /** Solo contrario — claro. */
  compania: string | null;
  /** Solo contrario — claro. */
  numeroPoliza: string | null;
  /** Solo contrario — ¿es el conductor? nullable. */
  esConductor: boolean | null;
  /** Solo lesionado — ¿iba en el coche del cliente? nullable. */
  ibaEnCocheCliente: boolean | null;
  /** `ClaseFigura` cruda del EIAC (para trazabilidad / confirmar codes TIREA). */
  claseFiguraRaw: string | null;
  /** Solo contrario de `Contrarios/Contrario`: `DatosPoliza/CodigoEntidad/CodigoDGS` de SU compañía. */
  codigoEntidadDgs?: string | null;
  /** Solo contrario de `Contrarios/Contrario`: `Responsabilidad` (CAUSANTE/PERJUDICADO…) CRUDA. */
  responsabilidad?: string | null;
  /** Solo contrario de `Contrarios/Contrario`: `Lesionados/Numero`. null = no vino. */
  numeroLesionados?: number | null;
}

/** Forma intermedia de UN siniestro EIAC. NO contiene raw_xml. PII en claro
 * (terceros): el cifrado Tier-1 lo hace el persist. */
export interface EiacSinMapped {
  outcome: EiacSinOutcome;
  /** Motivos legibles (SIN PII) por los que va a review. Vacío si outcome='ok'. */
  reviewReasons: string[];
  // -- Cabecera (→ columnas de `siniestros`) --
  /** EIAC `IdSiniestroEntidad` → siniestros.id_siniestro_entidad + .referencia. */
  idSiniestroEntidad: string | null;
  /** EIAC `CodigoEntidad/CodigoDGS` → siniestros.codigo_entidad_dgs (+ matching). */
  codigoEntidadDgs: string | null;
  /** EIAC `DatosPoliza/IdPoliza` → matching contra polizas.numero_poliza. */
  idPolizaEntidad: string | null;
  /** ISO date `YYYY-MM-DD` o null. EIAC `FechaOcurrencia` (o `FechaDeclaracion` como
   * fallback, N5). Faltan AMBAS → review (D8). */
  fechaOcurrencia: string | null;
  /** Estado mapeado al enum (best-effort + default abierto). */
  estado: EiacSiniestroEstado;
  /** EIAC `TipologiaSiniestro` (código DGS crudo; sin dict autoritativo). */
  tipo: string | null;
  // Lugar del siniestro.
  /** PII Tier-1 (lugar exacto) — `LugarSiniestro/NombreVia` (cifrado en persist). */
  lugarDireccion: string | null;
  lugarCp: string | null;
  lugarCiudad: string | null;
  lugarProvincia: string | null;
  /** EIAC `DescripcionSiniestro` (free-text operativo, NO cifrado). */
  comentario: string | null;
  /** Terceros clasificados (contrarios/testigos/lesionados). PII en claro. */
  figuras: MappedFigura[];
  /**
   * Conteo de lesionados declarado en `Asegurado/Lesionados/Numero` (sumado sobre
   * los bloques). NO es PII (es un entero); preserva la señal operativa de que hubo
   * heridos aunque no venga el detalle de persona (M1, LOO-750 review). 0 si no hay.
   */
  numeroLesionados: number;
  /**
   * Desglose de daños (`Asegurado/ImplicadoDiversos/DanosSiniestro/DanoSiniestro[]`).
   * Medido el 20/09/2026 en `cima_cobertura_campos`: CIMA lo manda y `veces_leido`
   * era 0 — un siniestro se abría sin decir en qué consistió el daño. `[]` si el
   * EIAC no trae ninguno.
   */
  danos: MappedDano[];
  /**
   * 24/09/2026: lo que el EIAC trae de la TRAMITACIÓN y se tiraba. Medido en
   * `cima_cobertura_campos`: Occident manda `ImporteReserva`, `TotalPagos` y el
   * historial de situaciones con descripción; Allianz manda `AccionesSiniestro`.
   * `veces_leido` era 0 en todos. Norma de uso EIAC §6.1.3: los bloques de
   * histórico traen SOLO lo nuevo del periodo → el persist FUSIONA, no sustituye.
   */
  situaciones: MappedSituacion[];
  acciones: MappedAccion[];
  pagos: MappedPago[];
  /** Decimal-string o null. `null` = no vino (≠ 0). */
  importeReserva: string | null;
  importeIndemnizacion: string | null;
  totalPagos: string | null;
  /**
   * `PosicionSiniestro` crudo (`claves_posicionsiniestro`: CU Culpa · RE
   * Reclamación · IN Indeterminado · NA No aplica). Va a `posicion_cima` y NO a
   * `se_considera_culpable`, que es un campo que rellena el corredor a mano.
   */
  posicion: string | null;
  // -- 28/09/2026: huecos de la auditoría de cobertura. OPCIONALES en el tipo
  //    solo para no obligar a reescribir los literales de otros tests; el mapper
  //    SIEMPRE los rellena (null / [] = no vino). Códigos TIREA siempre CRUDOS. --
  /** ISO `YYYY-MM-DD`. `FechaDeclaracion` propia (ya no solo fallback de la ocurrencia). */
  fechaDeclaracion?: string | null;
  /** `DAA` (true/false). null = no vino. */
  daa?: boolean | null;
  /** `Asegurado/Responsabilidad` cruda (CAUSANTE/PERJUDICADO…). ≠ `posicion`. */
  responsabilidad?: string | null;
  totalRecobros?: string | null;
  reservaDesglose?: MappedReservaDesglose | null;
  /** `Convenios/Convenio/ConvenioSiniestro` CRUDOS (SC, AS…). */
  convenios?: string[];
  expedientes?: MappedExpediente[];
  riesgo?: MappedRiesgo | null;
  /** `Asegurado/PersonaContacto/Persona` — PII, en claro aquí; el persist la cifra. */
  contactoNombre?: string | null;
  contactoTelefono?: string | null;
  vehiculo?: MappedVehiculo | null;
  vehiculoContrario?: MappedVehiculoContrario | null;
  asistencias?: MappedAsistencia[];
  /** `IdSiniestroMediador`. NO cae a `DatosPoliza/IdSolicitudMediador`: esa es una
   * referencia de la PÓLIZA, y guardarla con nombre de siniestro sería un dato leído mal. */
  refMediador?: string | null;
  /** `Asegurado/ImplicadoDiversos/Descripcion` (la descripción del siniestro que da la
   * compañía), con `taparNumerosLargos` aplicado. Varios implicados → unidos por « · ». */
  descripcion?: string | null;
  /** `Asegurado/PersonaContacto/Observaciones` — texto libre de una persona: en CLARO
   * aquí, el persist lo CIFRA. */
  contactoObservaciones?: string | null;
  /**
   * 03/10/2026 — hojas del EIAC que ningún extractor lee (salvo lista de exclusión).
   * Se persiste en `siniestros.cima_extra` (0106, ver `persist-siniestro.ts`).
   * Ausente = no se sabe (no se escribe); `[]` = mirado, no hay nada.
   */
  cimaExtra?: CimaExtraEntrada[];
  cimaExtraTruncado?: boolean;
  /**
   * 04/10/2026 — TERCEROS del siniestro con estructura (perjudicado, contrario,
   * testigos…: papel, nombre, documento, domicilio, teléfono, email, matrícula y
   * compañía del contrario). EN CLARO aquí: el persist los CIFRA
   * (`fusionarTercerosCima`) y los guarda en `siniestros.cima_extra.terceros`.
   * Opcional en el tipo para no romper a quien construye un `EiacSinMapped` a mano.
   */
  terceros?: FiguraCima[];
}

// --- Helper local (str): idéntico al privado del POL mapper, re-declarado para
//     no exportar uno nuevo desde el POL mapper. PURO, nunca throw. ---
function str(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/** Entero EIAC no-negativo: parsea string/number → int ≥0; basura/negativo → 0. */
function toCount(raw: unknown): number {
  const s = str(raw);
  if (s == null) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Booleano EIAC: 'S'/'true'/'1' → true; 'N'/'false'/'0' → false; resto → null. */
function toBool(raw: unknown): boolean | null {
  const s = str(raw)?.toUpperCase();
  if (s == null) return null;
  if (s === "S" || s === "SI" || s === "TRUE" || s === "1") return true;
  if (s === "N" || s === "NO" || s === "FALSE" || s === "0") return false;
  return null;
}

// --- Forma de entrada laxa (superset estructural del SIN del adapter) ---

export interface ParsedFiguraPersona {
  TipoIdentificacion?: unknown;
  IdPersona?: unknown;
  Nombre?: unknown;
  Apellido1?: unknown;
  Apellido2?: unknown;
  RazonSocial?: unknown;
  Telefono?: unknown;
  Contacto?: { Telefono?: unknown };
  /** Ruta REAL del teléfono en el EIAC 6.0 (medido 28/09/2026). */
  DatosContacto?: { Telefonos?: { Telefono?: ParsedTelefono | ParsedTelefono[] } };
  Vehiculo?: { Matricula?: unknown; Marca?: unknown; Modelo?: unknown };
  Matricula?: unknown;
  [k: string]: unknown;
}

export interface ParsedTelefono {
  Clase?: unknown;
  Numero?: unknown;
}

export interface ParsedFigura {
  ClaseFigura?: unknown;
  EsConductor?: unknown;
  IbaEnVehiculoAsegurado?: unknown;
  DatosFigura?: {
    PersonaFisica?: ParsedFiguraPersona;
    PersonaJuridica?: ParsedFiguraPersona;
    Vehiculo?: { Matricula?: unknown; Marca?: unknown; Modelo?: unknown };
  };
  [k: string]: unknown;
}

/** `Contrarios/Contrario` — el contrario REAL del EIAC 6.0 (no es una Figura). */
export interface ParsedContrario {
  DatosPoliza?: {
    NombreEntidad?: unknown;
    IdPoliza?: unknown;
    CodigoEntidad?: CodigoEntidadEiac;
  };
  Responsabilidad?: unknown;
  Lesionados?: { Numero?: unknown; Lesionado?: unknown } | Array<{ Numero?: unknown; Lesionado?: unknown }>;
  PersonaContacto?: { Persona?: ParsedFiguraPersona };
  ImplicadoDiversos?: ParsedImplicadoDiversos | ParsedImplicadoDiversos[];
  [k: string]: unknown;
}

/** `DatosFigura` de una figura con nombre (acción/asistencia). */
export interface ParsedDatosFigura {
  PersonaFisica?: ParsedFiguraPersona;
  PersonaJuridica?: ParsedFiguraPersona;
}

/** Una situación del historial (campos extra del EIAC tolerados vía index sig). */
export interface ParsedSituacion {
  SituacionSiniestro?: unknown;
  /** Orden cronológico de la situación (para ordenar el historial — M4). */
  NumeroOrden?: unknown;
  /** Fecha de la situación (desempate al ordenar — M4). */
  FechaSituacion?: unknown;
  [k: string]: unknown;
}

export interface ParsedSituaciones {
  Situacion?: ParsedSituacion | ParsedSituacion[];
}

/** Un daño concreto sobre el bien del implicado (`DanosSiniestro/DanoSiniestro`). */
export interface ParsedDanoSiniestro {
  NumeroOrden?: unknown;
  DescripcionDano?: unknown;
  ValorDano?: unknown;
}

/** `Asegurado/ImplicadoDiversos` — objeto único o array (fast-xml-parser). */
export interface ParsedImplicadoDiversos {
  Descripcion?: unknown;
  DanosSiniestro?: { DanoSiniestro?: ParsedDanoSiniestro | ParsedDanoSiniestro[] };
  [k: string]: unknown;
}

/** `Asegurado/ImplicadoAutos` — vehículo + conductor del asegurado. */
export interface ParsedImplicadoAutos {
  Vehiculo?: {
    Matricula?: unknown;
    Marca?: unknown;
    Modelo?: unknown;
    ClaseVehiculo?: unknown;
    CategoriaVehiculo?: unknown;
    Combustible?: unknown;
    UsoVehiculo?: unknown;
    Valor?: unknown;
    Potencia?: unknown;
    Cilindrada?: unknown;
    Plazas?: unknown;
    FechaMatriculacion?: unknown;
    [k: string]: unknown;
  };
  Conductor?: ParsedFiguraPersona;
  DanosSiniestro?: { DanoSiniestro?: ParsedDanoSiniestro | ParsedDanoSiniestro[] };
  [k: string]: unknown;
}

export interface ParsedAsistencia {
  Descripcion?: unknown;
  Asistente?: { ClaseFigura?: unknown; DatosFigura?: ParsedDatosFigura; [k: string]: unknown };
}

export interface ParsedAsegurado {
  Lesionados?:
    | { Numero?: unknown; Lesionado?: unknown }
    | Array<{ Numero?: unknown; Lesionado?: unknown }>;
  ImplicadoDiversos?: ParsedImplicadoDiversos | ParsedImplicadoDiversos[];
  ImplicadoAutos?: ParsedImplicadoAutos | ParsedImplicadoAutos[];
  Responsabilidad?: unknown;
  IdRiesgo?: unknown;
  PersonaContacto?: { Persona?: ParsedFiguraPersona; Observaciones?: unknown };
  Asistencias?: { Asistencia?: ParsedAsistencia | ParsedAsistencia[] };
}

export interface ParsedLugarSiniestro {
  NombreVia?: unknown;
  OtrosDatosVia?: unknown;
  CodigoPostal?: unknown;
  Poblacion?: unknown;
  Provincia?: unknown;
  Pais?: unknown;
}

export interface ParsedAccion {
  AccionSiniestro?: unknown;
  FechaAccion?: unknown;
  DescripcionAccion?: unknown;
  SituacionAccion?: unknown;
  FigurasAccion?: {
    FiguraAccion?:
      | { ClaseFigura?: unknown; DatosFigura?: ParsedDatosFigura }
      | Array<{ ClaseFigura?: unknown; DatosFigura?: ParsedDatosFigura }>;
  };
  [k: string]: unknown;
}

export interface ParsedPago {
  FechaPago?: unknown;
  ImportePago?: unknown;
  DescripcionPago?: unknown;
  ReceptoresPago?: {
    Figura?:
      | { ClaseFigura?: unknown; DatosFigura?: ParsedDatosFigura }
      | Array<{ ClaseFigura?: unknown; DatosFigura?: ParsedDatosFigura }>;
  };
  FechaLiquidacion?: unknown;
  FormaPago?: { ClaseFormaPago?: unknown; [k: string]: unknown };
  CoberturasIndemnizadas?: {
    Cobertura?:
      | { IdCobertura?: unknown; DescripcionCobertura?: unknown; ModalidadValoracion?: unknown }
      | Array<{ IdCobertura?: unknown; DescripcionCobertura?: unknown; ModalidadValoracion?: unknown }>;
  };
  [k: string]: unknown;
}

export interface ParsedCobertura {
  IdCobertura?: unknown;
  DescripcionCobertura?: unknown;
  CapitalAsegurado?: unknown;
  DescripcionCapitalAsegurado?: unknown;
  DatosImportes?: { PrimaNeta?: unknown; PrimaTotal?: unknown };
  FechaInicio?: unknown;
  FechaFin?: unknown;
  [k: string]: unknown;
}

export interface ParsedExpediente {
  NumeroExpediente?: unknown;
  ClaseExpediente?: unknown;
  EstadoExpediente?: unknown;
  FechaInicio?: unknown;
  FechaFin?: unknown;
  ImporteReserva?: unknown;
  TotalPagos?: unknown;
  TotalRecobros?: unknown;
  /** En el XML real el bloque se llama `Cobertura` y dentro trae `Cobertura[]`. */
  Cobertura?: { Cobertura?: ParsedCobertura | ParsedCobertura[] } | ParsedCobertura | ParsedCobertura[];
  [k: string]: unknown;
}

export interface ParsedRiesgoRecSin {
  IdRiesgo?: unknown;
  DescripcionRiesgo?: unknown;
  DatosCoberturas?: { Cobertura?: ParsedCobertura | ParsedCobertura[] };
  [k: string]: unknown;
}

export interface ParsedOtroDato {
  IdDato?: unknown;
  IdSubdato?: unknown;
  DescripcionDato?: unknown;
  ValorSubdato?: unknown;
  [k: string]: unknown;
}

export interface ParsedDatosSiniestro {
  AccionesSiniestro?: { Accion?: ParsedAccion | ParsedAccion[] };
  PagosSiniestro?: { PagoSiniestro?: ParsedPago | ParsedPago[] };
  ImporteReserva?: unknown;
  ImporteIndemnizacion?: unknown;
  TotalPagos?: unknown;
  IdSiniestroEntidad?: unknown;
  FechaDeclaracion?: unknown;
  FechaOcurrencia?: unknown;
  PosicionSiniestro?: unknown;
  SituacionesSiniestro?: ParsedSituaciones;
  DescripcionSiniestro?: unknown;
  TipologiaSiniestro?: unknown;
  Asegurado?: ParsedAsegurado;
  FigurasSiniestro?: { Figura?: ParsedFigura | ParsedFigura[] };
  LugarSiniestro?: ParsedLugarSiniestro;
  DAA?: unknown;
  TotalRecobros?: unknown;
  DescripcionReserva?: unknown;
  Convenios?: { Convenio?: { ConvenioSiniestro?: unknown } | Array<{ ConvenioSiniestro?: unknown }> };
  Expedientes?: { Expediente?: ParsedExpediente | ParsedExpediente[] };
  RiesgosSiniestro?: { RiesgoRecSin?: ParsedRiesgoRecSin | ParsedRiesgoRecSin[] };
  Contrarios?: { Contrario?: ParsedContrario | ParsedContrario[] };
  OtrosDatos?: { Dato?: ParsedOtroDato | ParsedOtroDato[] };
  IdSiniestroMediador?: unknown;
}

export interface ParsedSiniestro {
  DatosPoliza?: {
    IdPoliza?: unknown;
    IdSolicitudMediador?: unknown;
    CodigoEntidad?: CodigoEntidadEiac;
  };
  DatosSiniestro?: ParsedDatosSiniestro;
}

/** Entrada del mapper: el árbol JSON del EIAC SIN (lo produce el adapter en
 * `fichero.datos`). Aceptamos el wrapper `ProcesosEIAC` o sin él (defensivo). */
export interface ParsedEiacSin {
  ProcesosEIAC?: { Objetos?: { Siniestro?: ParsedSiniestro | ParsedSiniestro[] } };
  Objetos?: { Siniestro?: ParsedSiniestro | ParsedSiniestro[] };
}

/** Desenvuelve el wrapper ProcesosEIAC si está presente. */
function unwrapSiniestros(
  parsed: ParsedEiacSin,
): ParsedSiniestro | ParsedSiniestro[] | undefined {
  return parsed?.ProcesosEIAC?.Objetos?.Siniestro ?? parsed?.Objetos?.Siniestro;
}

/**
 * Dict best-effort `ClaseFigura` (cód EIAC) → subtabla. SOLO "AD" verificado en
 * las muestras prod; el resto es defensivo (CONFIRMAR codes TIREA). Desconocido →
 * `null` (el caller lo trata como contrario genérico + flagReview).
 */
export function classifyClaseFigura(raw: unknown): FiguraKind | null {
  switch (str(raw)?.toUpperCase()) {
    case "AD": // Adverso / contrario (verificado en prod)
      return "contrario";
    // Enrutado a SUBTABLA (no es el papel): se mantiene el de siempre para no mover
    // filas entre siniestro_testigos/lesionados ni romper la deduplicación del persist.
    // El papel según la norma §13.3.22 (TE tercero, PE perjudicado, TS testigo) va en
    // `cima_extra.terceros[].papel` (figuras-cima.ts).
    case "TE":
    case "TG":
      return "testigo";
    case "LE":
    case "PE":
      return "lesionado";
    default:
      return null; // desconocido → contrario genérico + review (no perder dato)
  }
}

/** Resultado de `mapSiniestroEstado`: el estado + si el código fue reconocido por
 * el dict verificado (`conocido=false` ⇒ cayó al default `abierto` en silencio). */
export interface MappedEstado {
  estado: EiacSiniestroEstado;
  /** true si un case explícito del switch matcheó; false si cayó al default final. */
  conocido: boolean;
}

/**
 * Mapea `SituacionSiniestro` (clave oficial `claves_situacionsiniestro`, Documentos
 * Estándar EIAC V07.1 §13.3.81: AP Abierto · CE Cerrado · RA Reabierto · RC
 * Rechazado) al enum `estado_siniestro`.
 *
 * 🚨 `PosicionSiniestro` NO es un estado: es la posición de CULPA
 * (`claves_posicionsiniestro`: CU Culpa · RE Reclamación · IN Indeterminado · NA
 * No aplica). Hasta el 24/09/2026 este dict leía `IN` como «instruido / en curso»
 * y marcaba `en_tramitacion` un siniestro de culpa indeterminada. La posición se
 * guarda aparte (`posicion_cima`) y aquí no participa.
 *
 * Solo claves oficiales: un código fuera de la tabla devuelve `conocido=false` y
 * el caller manda el fichero a review en vez de adivinar (M3). Sin situación, el
 * fichero no dice nada del estado: `abierto` por defecto, `conocido=false`.
 */
export function mapSiniestroEstado(situacion: unknown): MappedEstado {
  switch (str(situacion)?.toUpperCase()) {
    case "AP": // Abierto
    case "RA": // Reabierto
      return { estado: "abierto", conocido: true };
    case "CE": // Cerrado
      return { estado: "cerrado", conocido: true };
    case "RC": // Rechazado
      return { estado: "rechazado", conocido: true };
    default:
      return { estado: "abierto", conocido: false };
  }
}

/** Nombre legible de una persona/figura (PersonaFisica: Nombre+Apellidos;
 * PersonaJuridica: RazonSocial). null si no hay nada. */
function figuraNombre(p: ParsedFiguraPersona | undefined): string | null {
  if (!p) return null;
  if (str(p.RazonSocial)) return str(p.RazonSocial);
  const nombre = [str(p.Nombre), str(p.Apellido1), str(p.Apellido2)]
    .filter((x): x is string => x !== null)
    .join(" ");
  return nombre === "" ? null : nombre;
}

/**
 * Teléfono de una persona. Ruta REAL del EIAC 6.0 (medida 28/09/2026 sobre los
 * SIN de producción): `DatosContacto/Telefonos/Telefono[]/Numero` — el primero que
 * traiga número. Hasta ese día solo se miraban `Telefono` y `Contacto/Telefono`,
 * que no vienen nunca: el teléfono del contrario se perdía entero. Se conservan
 * como respaldo por si otra compañía los usa.
 */
function figuraTelefono(p: ParsedFiguraPersona | undefined): string | null {
  if (!p) return null;
  for (const t of asArray(p.DatosContacto?.Telefonos?.Telefono)) {
    const n = str(t?.Numero);
    if (n) return n;
  }
  return str(p.Telefono) ?? str(p.Contacto?.Telefono);
}

/** Mapea UNA Figura EIAC a `MappedFigura` clasificada. Desconocido → contrario
 * genérico (el caller marca review). PURA, nunca throw. */
function mapFigura(figura: ParsedFigura): { mapped: MappedFigura; unknown: boolean } {
  const claseRaw = str(figura.ClaseFigura);
  const kindKnown = classifyClaseFigura(figura.ClaseFigura);
  const kind: FiguraKind = kindKnown ?? "contrario";

  const persona =
    figura.DatosFigura?.PersonaFisica ?? figura.DatosFigura?.PersonaJuridica;
  const vehiculo = figura.DatosFigura?.Vehiculo ?? persona?.Vehiculo;
  const marca = str(vehiculo?.Marca);
  const modelo = str(vehiculo?.Modelo);
  const marcaModelo =
    marca || modelo ? [marca, modelo].filter((x) => x).join(" ") || null : null;

  return {
    mapped: {
      kind,
      nombre: figuraNombre(persona),
      telefono: figuraTelefono(persona),
      matricula: str(vehiculo?.Matricula) ?? str(persona?.Matricula),
      marcaModelo,
      // `DatosFigura/Compania` y `/NumeroPoliza` NO existen en el EIAC (auditoría
      // 28/09/2026): la compañía y la póliza del contrario vienen en
      // `Contrarios/Contrario/DatosPoliza` → ver `mapContrario`.
      compania: null,
      numeroPoliza: null,
      esConductor: toBool(figura.EsConductor),
      ibaEnCocheCliente: toBool(figura.IbaEnVehiculoAsegurado),
      claseFiguraRaw: claseRaw,
    },
    unknown: kindKnown === null,
  };
}

/**
 * ¿Los lesionados del bloque `Asegurado/Lesionados` traen DETALLE de persona
 * (Art.9 salud)? En las muestras prod solo viene `Numero` (conteo, NO es dato de
 * salud identificable). Si hay un sub-objeto `Lesionado` con datos de persona →
 * tratamos como Art.9 (review_salud, precedencia máxima).
 */
function tieneDetalleLesionado(
  asegurado: ParsedAsegurado | undefined,
  contrarios: ParsedContrario[] = [],
): boolean {
  const bloques = [
    ...asArray(asegurado?.Lesionados),
    ...contrarios.flatMap((c) => asArray(c?.Lesionados)),
  ];
  for (const bloque of bloques) {
    const detalle = (bloque as { Lesionado?: unknown })?.Lesionado;
    if (detalle != null) {
      // Cualquier sub-objeto/array de lesionado con contenido → detalle de salud.
      const items = asArray(detalle);
      if (items.some((it) => it != null && typeof it === "object")) return true;
    }
  }
  return false;
}

/**
 * Desglose de daños de TODOS los `ImplicadoDiversos` del asegurado
 * (`DanosSiniestro/DanoSiniestro[]`). `ImplicadoDiversos` y `DanoSiniestro` pueden
 * ser objeto único o array (fast-xml-parser) → `asArray` en los dos niveles.
 * `ValorDano` usa `toDecimalString` (mismo parser que el resto de importes EIAC:
 * punto decimal, sin separador de miles) — NUNCA `Number()` a pelo. PURA, nunca throw.
 */
function extractDanos(
  asegurado: ParsedAsegurado | undefined,
  contrarios: ParsedContrario[] = [],
): MappedDano[] {
  const out: MappedDano[] = [];
  // L12 (28/09/2026): los daños de un siniestro de AUTOS vienen en
  // `ImplicadoAutos/DanosSiniestro`, no en `ImplicadoDiversos`.
  const recoger = (implicados: Array<{ DanosSiniestro?: ParsedImplicadoDiversos["DanosSiniestro"] }>, contrario: boolean) => {
    for (const implicado of implicados) {
      for (const dano of asArray(implicado?.DanosSiniestro?.DanoSiniestro)) {
        // La descripción es texto libre: puede traer la dirección del bien dañado
        // (Tier-1) → mismo filtro que `descripcionRiesgoSegura` (corta en el primer
        // tipo de vía y tapa números largos).
        const descripcion = textoSinVia(dano?.DescripcionDano);
        const valor = toDecimalString(dano?.ValorDano);
        if (descripcion == null && valor == null) continue;
        out.push(contrario ? { descripcion, valor, contrario: true } : { descripcion, valor });
      }
    }
  };
  recoger(
    [...asArray(asegurado?.ImplicadoDiversos), ...asArray(asegurado?.ImplicadoAutos)] as Array<{
      DanosSiniestro?: ParsedImplicadoDiversos["DanosSiniestro"];
    }>,
    false,
  );
  // 03/10/2026 — daños a terceros (Generali): `Contrarios/Contrario/ImplicadoDiversos`.
  recoger(
    contrarios.flatMap((c) => asArray(c?.ImplicadoDiversos)) as Array<{
      DanosSiniestro?: ParsedImplicadoDiversos["DanosSiniestro"];
    }>,
    true,
  );
  return out;
}

/** Historial de situaciones. Sin código → se descarta (una fecha sola no dice nada). PURA. */
export function extractSituaciones(situaciones: ParsedSituaciones | undefined): MappedSituacion[] {
  const out: MappedSituacion[] = [];
  for (const sit of asArray(situaciones?.Situacion)) {
    const codigo = str(sit?.SituacionSiniestro)?.toUpperCase();
    if (!codigo) continue;
    out.push({
      codigo,
      fecha: toIsoDate(sit?.FechaSituacion),
      descripcion: str((sit as { DescripcionSituacion?: unknown })?.DescripcionSituacion),
    });
  }
  return out;
}

/** Acciones de tramitación. Sin clase de acción → se descarta. PURA, nunca throw. */
export function extractAcciones(acciones: ParsedDatosSiniestro["AccionesSiniestro"]): MappedAccion[] {
  const out: MappedAccion[] = [];
  for (const a of asArray(acciones?.Accion)) {
    const accion = str(a?.AccionSiniestro)?.toUpperCase();
    if (!accion) continue;
    const figurasAccion = asArray(a?.FigurasAccion?.FiguraAccion);
    const figuras = figurasAccion
      .map((f) => str(f?.ClaseFigura)?.toUpperCase())
      .filter((x): x is string => !!x);
    const figurasDetalle = figurasAccion
      .map((f) => figuraNombrada(f?.ClaseFigura, f?.DatosFigura))
      .filter((x): x is MappedFiguraNombrada => x !== null);
    out.push({
      accion,
      fecha: toIsoDate(a?.FechaAccion),
      descripcion: str(a?.DescripcionAccion),
      situacion: str(a?.SituacionAccion)?.toUpperCase() ?? null,
      figuras,
      figurasDetalle,
    });
  }
  return out;
}

/** Pagos. Sin fecha NI importe → se descarta. Importes con `toDecimalString`, nunca `Number()`. */
export function extractPagos(pagos: ParsedDatosSiniestro["PagosSiniestro"]): MappedPago[] {
  const out: MappedPago[] = [];
  for (const p of asArray(pagos?.PagoSiniestro)) {
    const fecha = toIsoDate(p?.FechaPago);
    const importe = toDecimalString(p?.ImportePago);
    if (fecha == null && importe == null) continue;
    const receptor = asArray(p?.ReceptoresPago?.Figura)
      .map((f) => str(f?.ClaseFigura)?.toUpperCase())
      .find((x): x is string => !!x) ?? null;
    // Solo EMPRESAS: la razón social de una PersonaJuridica. Una persona física
    // (PersonaFisica) no se lee y el IBAN tampoco.
    const receptorRazonSocial = asArray(p?.ReceptoresPago?.Figura)
      .map((f) => str(f?.DatosFigura?.PersonaJuridica?.RazonSocial))
      .find((x): x is string => !!x);
    const coberturas = asArray(p?.CoberturasIndemnizadas?.Cobertura)
      .map((c) => ({
        id: str(c?.IdCobertura),
        descripcion: str(c?.DescripcionCobertura),
        modalidad: str(c?.ModalidadValoracion)?.toUpperCase() ?? null,
      }))
      .filter((c) => c.id != null || c.descripcion != null);
    out.push({
      fecha,
      importe,
      descripcion: str(p?.DescripcionPago),
      receptor,
      fechaLiquidacion: toIsoDate(p?.FechaLiquidacion),
      // Solo la CLASE de forma de pago; `DatosCuentaCorriente/IBAN` NO se lee.
      formaPago: str(p?.FormaPago?.ClaseFormaPago)?.toUpperCase() ?? null,
      coberturas,
      ...(receptorRazonSocial ? { receptorRazonSocial } : {}),
    });
  }
  return out;
}

/** Nombre de una figura con `DatosFigura` (acción, asistencia). PJ → razonSocial
 * en claro; PF → nombre (el persist lo cifra). Sin clase ni nombre → null. */
function figuraNombrada(
  clase: unknown,
  datos: ParsedDatosFigura | undefined,
): MappedFiguraNombrada | null {
  const claseStr = str(clase)?.toUpperCase() ?? null;
  const razonSocial = str(datos?.PersonaJuridica?.RazonSocial);
  const nombre = datos?.PersonaJuridica ? null : figuraNombre(datos?.PersonaFisica);
  if (claseStr == null && razonSocial == null && nombre == null) return null;
  return { clase: claseStr, razonSocial, nombre };
}

/** Suma `Numero` de los bloques `Lesionados`; null si no vino ningún bloque con número. */
function sumaLesionados(bloques: unknown): number | null {
  let visto = false;
  let total = 0;
  for (const b of asArray(bloques)) {
    const s = str((b as { Numero?: unknown })?.Numero);
    if (s == null) continue;
    visto = true;
    total += toCount(s);
  }
  return visto ? total : null;
}

/**
 * Un `Contrarios/Contrario` → contrario. Es el contrario REAL del EIAC 6.0: la
 * compañía (`DatosPoliza/NombreEntidad` + `CodigoDGS`), su póliza (`IdPoliza`), la
 * `Responsabilidad` y el contacto (`PersonaContacto/Persona`, nombre + teléfono,
 * que el persist cifra). NO se funde con la Figura `AD` de `FigurasSiniestro`:
 * medido el 28/09/2026, en los SIN reales son personas distintas.
 */
function mapContrario(c: ParsedContrario): MappedFigura | null {
  const persona = c?.PersonaContacto?.Persona;
  const out: MappedFigura = {
    kind: "contrario",
    nombre: figuraNombre(persona),
    telefono: figuraTelefono(persona),
    matricula: null,
    marcaModelo: null,
    compania: str(c?.DatosPoliza?.NombreEntidad),
    numeroPoliza: str(c?.DatosPoliza?.IdPoliza),
    esConductor: null,
    ibaEnCocheCliente: null,
    claseFiguraRaw: null,
    codigoEntidadDgs: codigoDgsDe(c?.DatosPoliza?.CodigoEntidad)?.toUpperCase() ?? null,
    responsabilidad: str(c?.Responsabilidad)?.toUpperCase() ?? null,
    numeroLesionados: sumaLesionados(c?.Lesionados),
  };
  const algo = [out.nombre, out.telefono, out.compania, out.numeroPoliza, out.codigoEntidadDgs, out.responsabilidad]
    .some((x) => x != null) || out.numeroLesionados != null;
  return algo ? out : null;
}

/** Coberturas de un bloque (`Cobertura` puede ser objeto, array o envoltorio `{Cobertura}`). */
function coberturasDe(raw: unknown): ParsedCobertura[] {
  const out: ParsedCobertura[] = [];
  for (const x of asArray(raw as ParsedCobertura | ParsedCobertura[])) {
    const inner = (x as { Cobertura?: unknown })?.Cobertura;
    if (inner != null && typeof inner === "object") out.push(...asArray(inner as ParsedCobertura | ParsedCobertura[]));
    else if (x != null) out.push(x);
  }
  return out;
}

/** Expedientes. Sin número ni clase → se descarta. Claves CRUDAS. PURA. */
export function extractExpedientes(exps: ParsedDatosSiniestro["Expedientes"]): MappedExpediente[] {
  const out: MappedExpediente[] = [];
  for (const e of asArray(exps?.Expediente)) {
    const numero = str(e?.NumeroExpediente);
    const clase = str(e?.ClaseExpediente)?.toUpperCase() ?? null;
    if (numero == null && clase == null) continue;
    out.push({
      numero,
      clase,
      estado: str(e?.EstadoExpediente)?.toUpperCase() ?? null,
      fechaInicio: toIsoDate(e?.FechaInicio),
      fechaFin: toIsoDate(e?.FechaFin),
      importeReserva: toDecimalString(e?.ImporteReserva),
      totalPagos: toDecimalString(e?.TotalPagos),
      totalRecobros: toDecimalString(e?.TotalRecobros),
      coberturas: coberturasDe(e?.Cobertura).map((c) => ({
        id: str(c?.IdCobertura),
        descripcion: str(c?.DescripcionCobertura),
        capital: toDecimalString(c?.CapitalAsegurado),
        fechaInicio: toIsoDate(c?.FechaInicio),
        fechaFin: toIsoDate(c?.FechaFin),
      })),
    });
  }
  return out;
}

/**
 * El riesgo AFECTADO. `RiesgosSiniestro` trae todos los riesgos de la póliza (una
 * flota trae un riesgo por vehículo); el del siniestro lo dice `Asegurado/IdRiesgo`.
 * Sin `IdRiesgo` y con un solo riesgo → ese. Con varios y sin `IdRiesgo` → null
 * (no se adivina). `IdRiesgo` que no casa con ninguno → solo el id.
 */
export function extractRiesgo(
  riesgos: ParsedDatosSiniestro["RiesgosSiniestro"],
  idRiesgoAsegurado: unknown,
): MappedRiesgo | null {
  const lista = asArray(riesgos?.RiesgoRecSin);
  const idBuscado = str(idRiesgoAsegurado);
  let elegido: ParsedRiesgoRecSin | undefined;
  if (idBuscado != null) {
    elegido =
      lista.find((r) => str(r?.IdRiesgo) === idBuscado) ??
      lista.find((r) => {
        const a = Number(str(r?.IdRiesgo));
        return Number.isFinite(a) && a === Number(idBuscado);
      });
    if (!elegido) return { id: idBuscado, descripcion: null, coberturas: [] };
  } else if (lista.length === 1) {
    elegido = lista[0];
  } else {
    return null;
  }
  return {
    id: str(elegido?.IdRiesgo) ?? idBuscado,
    descripcion: str(elegido?.DescripcionRiesgo),
    coberturas: coberturasDe(elegido?.DatosCoberturas?.Cobertura)
      .map((c) => {
        const primaNeta = toDecimalString(c?.DatosImportes?.PrimaNeta);
        const primaTotal = toDecimalString(c?.DatosImportes?.PrimaTotal);
        const fechaInicio = toIsoDate(c?.FechaInicio);
        const descripcionCapital = textoSinVia(c?.DescripcionCapitalAsegurado);
        return {
          id: str(c?.IdCobertura),
          descripcion: str(c?.DescripcionCobertura),
          capital: toDecimalString(c?.CapitalAsegurado),
          ...(primaNeta ? { primaNeta } : {}),
          ...(primaTotal ? { primaTotal } : {}),
          ...(fechaInicio ? { fechaInicio } : {}),
          ...(descripcionCapital ? { descripcionCapital } : {}),
        };
      })
      .filter((c) => c.id != null || c.descripcion != null),
  };
}

/** «RESERVA POR COBERTURAS=16-400.00/43-78.00» → pares. Texto crudo siempre. */
export function parseReservaDesglose(raw: unknown): MappedReservaDesglose | null {
  const descripcion = str(raw);
  if (descripcion == null) return null;
  const tras = descripcion.includes("=") ? descripcion.slice(descripcion.indexOf("=") + 1) : "";
  const coberturas: MappedReservaDesglose["coberturas"] = [];
  for (const trozo of tras.split("/")) {
    const m = /^\s*([^-\s]+)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/.exec(trozo);
    if (!m) continue;
    coberturas.push({ cobertura: m[1], importe: toDecimalString(m[2]) });
  }
  return { descripcion, coberturas };
}

/** `ImplicadoDiversos/Descripcion` de todos los implicados, tapando números largos
 * (cuentas, DNI, teléfonos) con el mismo `taparNumerosLargos` del mapper de pólizas. */
function descripcionImplicados(asegurado: ParsedAsegurado | undefined): string | null {
  const textos = asArray(asegurado?.ImplicadoDiversos)
    .map((i) => str(i?.Descripcion))
    .filter((x): x is string => x !== null)
    .map(taparNumerosLargos);
  return textos.length > 0 ? textos.join(" · ") : null;
}

/** Vehículo + conductor del asegurado (primer `ImplicadoAutos` con algo). */
function extractVehiculo(asegurado: ParsedAsegurado | undefined): MappedVehiculo | null {
  for (const ia of asArray(asegurado?.ImplicadoAutos)) {
    const v: MappedVehiculo = {
      matricula: str(ia?.Vehiculo?.Matricula),
      marca: str(ia?.Vehiculo?.Marca),
      modelo: str(ia?.Vehiculo?.Modelo),
      // Aquí solo el nombre. Domicilio, fecha de nacimiento, IdPersona y contacto
      // del conductor van CIFRADOS a `cima_extra.terceros` (`conductor_asegurado`,
      // 20/10/2026); sexo y estado civil no se leen nunca.
      conductorNombre: figuraNombre(ia?.Conductor),
    };
    // 03/10/2026 — resto del vehículo del asegurado (omitidos si no vinieron).
    // NO se lee `Bastidor`.
    const veh = ia?.Vehiculo;
    const extra: Array<[keyof MappedVehiculo, string | null]> = [
      ["clase", str(veh?.ClaseVehiculo)],
      ["categoria", str(veh?.CategoriaVehiculo)],
      ["combustible", str(veh?.Combustible)],
      ["uso", str(veh?.UsoVehiculo)],
      ["valor", toDecimalString(veh?.Valor)],
      ["potencia", str(veh?.Potencia)],
      ["cilindrada", str(veh?.Cilindrada)],
      ["plazas", str(veh?.Plazas)],
      ["fechaMatriculacion", toIsoDate(veh?.FechaMatriculacion)],
    ];
    for (const [k, val] of extra) if (val) (v as unknown as Record<string, unknown>)[k] = val;
    if (v.matricula || v.marca || v.modelo || v.conductorNombre || extra.some(([, val]) => val)) return v;
  }
  return null;
}

/** `OtrosDatos/Dato` de Allianz → vehículo/conductor del contrario. */
function extractVehiculoContrario(otros: ParsedDatosSiniestro["OtrosDatos"]): MappedVehiculoContrario | null {
  const out: MappedVehiculoContrario = { matricula: null, marcaModelo: null, conductorNombre: null, otros: [] };
  let algo = false;
  for (const d of asArray(otros?.Dato)) {
    const id = str(d?.IdDato)?.toUpperCase();
    const valor = str(d?.ValorSubdato);
    if (!id) continue;
    algo = true;
    if (id === "CONT_VEHICULO_MAT") out.matricula = valor;
    else if (id === "CONT_VEHICULO_MARCA") out.marcaModelo = valor;
    else if (id === "CONT_CONDUCTOR_NOM") out.conductorNombre = valor;
    else out.otros.push({ idDato: id, descripcion: str(d?.DescripcionDato), valor });
  }
  return algo ? out : null;
}

/** Asistencias del asegurado. Sin clase, nombre ni descripción → se descarta. */
export function extractAsistencias(asegurado: ParsedAsegurado | undefined): MappedAsistencia[] {
  const out: MappedAsistencia[] = [];
  for (const a of asArray(asegurado?.Asistencias?.Asistencia)) {
    const f = figuraNombrada(a?.Asistente?.ClaseFigura, a?.Asistente?.DatosFigura);
    const descripcion = str(a?.Descripcion);
    if (f == null && descripcion == null) continue;
    out.push({ clase: f?.clase ?? null, razonSocial: f?.razonSocial ?? null, nombre: f?.nombre ?? null, descripcion });
  }
  return out;
}

/**
 * Suma el conteo `Numero` de lesionados declarado en los bloques
 * `Asegurado/Lesionados` (M1, LOO-750 review). NO es PII (entero); preserva la
 * señal de que hubo heridos aunque no venga el detalle de persona.
 */
function contarLesionados(asegurado: ParsedAsegurado | undefined): number {
  let total = 0;
  for (const bloque of asArray(asegurado?.Lesionados)) {
    total += toCount((bloque as { Numero?: unknown })?.Numero);
  }
  return total;
}

/**
 * Extrae el `SituacionSiniestro` de la situación MÁS RECIENTE (M4, LOO-750
 * review). El orden del XML NO es fiable: ordenamos por `NumeroOrden` (numérico)
 * descendente y, en empate/ausencia, por `FechaSituacion` (ISO) descendente, y
 * tomamos la primera. Evita derivar el estado de una situación obsoleta (ej. la
 * "Aperturado" inicial en lugar de la "Cerrado" final).
 */
function lastSituacion(
  situaciones: ParsedSituaciones | undefined,
): unknown {
  const arr = asArray(situaciones?.Situacion);
  if (arr.length === 0) return undefined;
  const ordenadas = [...arr].sort((a, b) => {
    const ordenA = toCount((a as { NumeroOrden?: unknown })?.NumeroOrden);
    const ordenB = toCount((b as { NumeroOrden?: unknown })?.NumeroOrden);
    if (ordenA !== ordenB) return ordenB - ordenA; // NumeroOrden desc
    const fechaA = toIsoDate((a as { FechaSituacion?: unknown })?.FechaSituacion) ?? "";
    const fechaB = toIsoDate((b as { FechaSituacion?: unknown })?.FechaSituacion) ?? "";
    return fechaB.localeCompare(fechaA); // FechaSituacion desc
  });
  return ordenadas[0]?.SituacionSiniestro;
}

/**
 * Mapea TODOS los siniestros de un EIAC SIN. Normalmente 1 por fichero, pero el
 * adapter podría traer un array. Si el fichero no trae ninguno, devuelve un único
 * `review` (faltan datos) para que el pipeline lo registre sin perderlo. PURA.
 */
export interface OpcionesMapSin {
  /**
   * true = `siniestros.cima_extra` (0106) EXISTE en la BD y el persist guardará el
   * resto: el medidor lo cuenta como LEÍDO. false (defecto, conservador) = la columna
   * aún no está: el resto se calcula pero se tiraría, así que NO cuenta como leído
   * (`ultima_vez_leido` es pegajoso: un «leído» falso quedaría para siempre).
   * Lo decide la capa impura (`pull-deps.ts`, `columnaExiste`).
   */
  persisteCimaExtra?: boolean;
}

export function mapEiacSinAll(parsed: ParsedEiacSin, opts: OpcionesMapSin = {}): EiacSinMapped[] {
  const siniestros = asArray(unwrapSiniestros(parsed));
  const contar = opts.persisteCimaExtra === true;
  if (siniestros.length === 0) return [mapOneSiniestro(undefined, contar)];
  return siniestros.map((s) => mapOneSiniestro(s, contar));
}

/**
 * Mapea UN siniestro + su «resto» (`cimaExtra`, ver `cima-extra.ts`), que el persist
 * guarda en su columna propia `siniestros.cima_extra` (0106; no en `riesgo_cima`, que
 * es el riesgo afectado). Solo cuenta como LEÍDO si la columna existe (`contar`).
 */
function mapOneSiniestro(siniestro: ParsedSiniestro | undefined, contar: boolean): EiacSinMapped {
  const { resultado, cimaExtra } = conCimaExtra(
    siniestro,
    "Siniestro",
    (s) => mapOneSiniestroEspecifico(s as ParsedSiniestro | undefined),
    { contar },
  );
  // `entradas: null` (no se sabe) → sin clave: null ≠ [].
  return { ...resultado, ...camposCimaExtra(cimaExtra) };
}

/** Mapea UN siniestro EIAC a `EiacSinMapped` (extractores específicos). PURA, nunca throw por datos. */
function mapOneSiniestroEspecifico(siniestro: ParsedSiniestro | undefined): EiacSinMapped {
  // `reviewReasons` mezcla motivos de review (→ outcome) y notas informativas que
  // NO fuerzan review (ej. fallback de fecha). `reviewBlockers` cuenta solo los que
  // sí mandan a review, para no enmascarar el outcome con notas (N5).
  const reviewReasons: string[] = [];
  let reviewBlockers = 0;
  const pushReview = (reason: string) => {
    reviewReasons.push(reason);
    reviewBlockers += 1;
  };
  const ds = siniestro?.DatosSiniestro;

  const idSiniestroEntidad = str(ds?.IdSiniestroEntidad);
  const codigoEntidadDgs = codigoDgsDe(siniestro?.DatosPoliza?.CodigoEntidad);
  // V07.1 — CodigoEntidad presente con forma ilegible: nota (NO review, el flujo de
  // cuarentena no cambia); el pipeline la usa de motivo en vez de «clave_incompleta».
  if (codigoEntidadFormatoDesconocido(siniestro?.DatosPoliza?.CodigoEntidad)) {
    reviewReasons.push(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO);
  }
  const idPolizaEntidad = str(siniestro?.DatosPoliza?.IdPoliza);

  // Fecha del siniestro (N5): preferimos FechaOcurrencia; si falta pero hay
  // FechaDeclaracion, la usamos como fallback (nota informativa, NO review).
  // Solo si faltan AMBAS → review por falta_fecha_ocurrencia.
  let fechaHora = toIsoDate(ds?.FechaOcurrencia);
  if (!fechaHora) {
    const fechaDeclaracion = toIsoDate(ds?.FechaDeclaracion);
    if (fechaDeclaracion) {
      fechaHora = fechaDeclaracion;
      reviewReasons.push("fecha_ocurrencia_fallback_declaracion"); // nota, no review
    } else {
      pushReview("falta_fecha_ocurrencia");
    }
  }
  if (!idSiniestroEntidad) pushReview("falta_id_siniestro_entidad");

  // Estado: si el código no está en el dict verificado y había un valor presente,
  // mandamos a review en vez de mostrar `abierto` en silencio (M3).
  const situacionRaw = lastSituacion(ds?.SituacionesSiniestro);
  const { estado, conocido: estadoConocido } = mapSiniestroEstado(situacionRaw);
  const huboValorEstado = str(situacionRaw) != null;
  if (!estadoConocido && huboValorEstado) pushReview("estado_siniestro_desconocido");
  const tipo = str(ds?.TipologiaSiniestro);

  // Lugar del siniestro: NombreVia (+ OtrosDatosVia) es PII Tier-1 (cifrado en persist).
  const lugar = ds?.LugarSiniestro;
  const via = str(lugar?.NombreVia);
  const otros = str(lugar?.OtrosDatosVia);
  const lugarDireccion =
    via || otros ? [via, otros].filter((x) => x).join(" ") || null : null;

  // Terceros (Figuras). Desconocido → contrario genérico + review.
  const figuras: MappedFigura[] = [];
  let anyUnknownFigura = false;
  for (const f of asArray(ds?.FigurasSiniestro?.Figura)) {
    const { mapped, unknown } = mapFigura(f);
    figuras.push(mapped);
    if (unknown) anyUnknownFigura = true;
  }
  if (anyUnknownFigura) pushReview("clase_figura_desconocida");
  // Contrarios REALES (`Contrarios/Contrario`): compañía, póliza, responsabilidad
  // y contacto del tercero.
  const contrariosRaw = asArray(ds?.Contrarios?.Contrario);
  for (const c of contrariosRaw) {
    const mc = mapContrario(c);
    if (mc) figuras.push(mc);
  }

  // Conteo de lesionados (M1): señal operativa no-PII, preservada aunque no haya
  // detalle de persona. NO fuerza review (la minimización Art.9 es correcta).
  const numeroLesionados = contarLesionados(ds?.Asegurado);

  // Art.9 salud: lesionado con DETALLE de persona (precedencia máxima).
  const esSalud = tieneDetalleLesionado(ds?.Asegurado, contrariosRaw);
  if (esSalud) pushReview("lesionado_detalle_art9");

  // outcome: review_salud (Art.9) gana sobre review; review gana sobre ok.
  // Las notas informativas (fallback de fecha) NO cuentan como blockers.
  let outcome: EiacSinOutcome = "ok";
  if (esSalud) outcome = "review_salud";
  else if (reviewBlockers > 0) outcome = "review";

  return {
    outcome,
    reviewReasons,
    idSiniestroEntidad,
    codigoEntidadDgs,
    idPolizaEntidad,
    // `fechaOcurrencia` puede provenir del fallback FechaDeclaracion (N5).
    fechaOcurrencia: fechaHora,
    estado,
    tipo,
    lugarDireccion,
    lugarCp: str(lugar?.CodigoPostal),
    lugarCiudad: str(lugar?.Poblacion),
    lugarProvincia: str(lugar?.Provincia),
    comentario: str(ds?.DescripcionSiniestro),
    figuras,
    numeroLesionados,
    danos: extractDanos(ds?.Asegurado, contrariosRaw),
    situaciones: extractSituaciones(ds?.SituacionesSiniestro),
    acciones: extractAcciones(ds?.AccionesSiniestro),
    pagos: extractPagos(ds?.PagosSiniestro),
    importeReserva: toDecimalString(ds?.ImporteReserva),
    importeIndemnizacion: toDecimalString(ds?.ImporteIndemnizacion),
    totalPagos: toDecimalString(ds?.TotalPagos),
    posicion: str(ds?.PosicionSiniestro)?.toUpperCase() ?? null,
    fechaDeclaracion: toIsoDate(ds?.FechaDeclaracion),
    daa: toBool(ds?.DAA),
    responsabilidad: str(ds?.Asegurado?.Responsabilidad)?.toUpperCase() ?? null,
    totalRecobros: toDecimalString(ds?.TotalRecobros),
    reservaDesglose: parseReservaDesglose(ds?.DescripcionReserva),
    convenios: asArray(ds?.Convenios?.Convenio)
      .map((c) => str(c?.ConvenioSiniestro)?.toUpperCase())
      .filter((x): x is string => !!x),
    expedientes: extractExpedientes(ds?.Expedientes),
    riesgo: extractRiesgo(ds?.RiesgosSiniestro, ds?.Asegurado?.IdRiesgo),
    // Solo nombre y teléfono del contacto; domicilio, IdPersona, sexo… se descartan.
    contactoNombre: figuraNombre(ds?.Asegurado?.PersonaContacto?.Persona),
    contactoTelefono: figuraTelefono(ds?.Asegurado?.PersonaContacto?.Persona),
    vehiculo: extractVehiculo(ds?.Asegurado),
    vehiculoContrario: extractVehiculoContrario(ds?.OtrosDatos),
    asistencias: extractAsistencias(ds?.Asegurado),
    refMediador: str(ds?.IdSiniestroMediador),
    descripcion: descripcionImplicados(ds?.Asegurado),
    contactoObservaciones: str(ds?.Asegurado?.PersonaContacto?.Observaciones),
    terceros: extractTercerosSiniestro(ds),
  };
}
