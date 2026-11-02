/**
 * LOO-757 (épica CIMA LOO-515) — Mapper PURO de un EIAC CEF (cuenta de efectivo /
 * liquidaciones, proceso 502) parseado a la forma intermedia `MappedCuentaEfectivo`
 * que el pipeline de ingesta y el persist (`persist-cef.ts`) consumen. Espejo de
 * `eiac-rec-mapper.ts`.
 *
 * CONTRATO DE ENTRADA — anclado a la estructura REAL del CEF verificada contra prod
 * (probe 2026-06-24, muestras Allianz C0109; EIAC 6.0, proceso 502). Rutas:
 *   - `Objetos.CuentaEfectivo` (objeto único; `asArray` colapsa por robustez).
 *   - `CodigoEntidad/CodigoDGS`, `Periodo/{FechaInicio,FechaFin}`,
 *     `Saldos/{SaldoInicial,SaldoFinal}`, `Conceptos/{RecibosCobrados,...,Remesas}`.
 *   - `Liquidaciones/Liquidacion[]` (objeto único o array → `asArray`):
 *     `DatosLiquidacion/{IdLiquidacionEntidad, EstadoLiquidacion, FechaLiquidacion,
 *     FechaPago, ImporteRemesa, MovimientosLiquidacion/MovimientoLiquidacion[]}`.
 *   - movimiento: `{NumeroOrden, FechaMovimiento, ImporteMovimiento/{ClaseImporte,
 *     Importe}, MovimientoRecibo/DatosPoliza/{IdPoliza, CodigoEntidad/CodigoDGS} +
 *     MovimientoRecibo/DatosRecibo/IdRecibo}`.
 *
 * Diseño (paralelo a REC):
 *  - CEF = DATO FINANCIERO del corredor, **NO PII de persona**. El EIAC puede traer
 *    un bloque `FormaPago/Titular/PersonaFisica` + IBAN embebido en la liquidación;
 *    el mapper lo IGNORA (no lo extrae). NUNCA toca IBAN/Titular de persona.
 *  - `EstadoLiquidacion` (dict best-effort, CONFIRMAR codes TIREA): LI→liquidada
 *    (visto en prod); resto defensivo; default `pendiente` (no bloquea la ingesta).
 *  - Importes/saldos/conceptos = dato de NEGOCIO → claro (no hay nada que cifrar).
 *  - Función PURA: sin BD, sin red, sin crypto, sin process.env. Reusa
 *    `asArray`/`toIsoDate` del POL mapper para no duplicar.
 */

import { camposCimaExtra, conCimaExtra } from "./cima-extra.ts";
import { codigoDgsDe, codigoEntidadFormatoDesconocido, CODIGO_ENTIDAD_FORMATO_DESCONOCIDO, type CodigoEntidadEiac } from "./codigo-entidad.ts";
import { asArray, toIsoDate } from "./eiac-pol-mapper.ts";
import { dec, mapMediador, type ParsedDatosMediador } from "./eiac-rec-mapper.ts";

// --- Tipos de salida ---

/** Subset del enum `liquidacion_estado` del schema (schema.ts). */
export type LiquidacionEstado =
  | "liquidada"
  | "pendiente"
  | "parcial"
  | "anulada";

/** Un movimiento de una liquidación. SIN PII (importes + ids de contrato/recibo). */
export interface MappedLiquidacionMovimiento {
  /** EIAC MovimientoLiquidacion/NumeroOrden (int o null). */
  numeroOrden: number | null;
  /** EIAC MovimientoLiquidacion/FechaMovimiento (ISO `YYYY-MM-DD` o null). */
  fechaMovimiento: string | null;
  /** EIAC ImporteMovimiento/ClaseImporte (LI, ...). */
  claseImporte: string | null;
  /** EIAC ImporteMovimiento/Importe. Dato de negocio. */
  importe: string | null;
  /** EIAC MovimientoRecibo/DatosPoliza/IdPoliza (matching de póliza, best-effort). */
  idPolizaEntidad: string | null;
  /** EIAC MovimientoRecibo/DatosPoliza/CodigoEntidad/CodigoDGS (matching). */
  codigoEntidadDgs: string | null;
  /** EIAC MovimientoRecibo/DatosRecibo/IdRecibo (matching de recibo, best-effort). */
  idReciboEiac: string | null;
  /**
   * → liquidacion_movimientos.datos_extra. SIN PII (nunca IBAN/Titular). Claves:
   *  - `comision {clase, bruta, liquida, base, retencionIrpf}`: la comisión
   *    EFECTIVAMENTE LIQUIDADA de ese recibo (Comision[0]); `comisionesExtra[]` el resto.
   *  - `idRemesa`, `situacionRecibo`, `claseRecibo` (crudos; idRemesa concilia con
   *    poliza_recibos.id_remesa).
   *  - `contable {clase, concepto, descripcion, bruto, liquido, retencionIrpf}`: el
   *    movimiento SIN recibo (saldos, ajustes). Va en la MISMA fila porque cada
   *    MovimientoLiquidacion ya es una fila (con recibo_id/poliza_id null): una fila
   *    aparte duplicaría el importe del movimiento.
   * null si no hay nada.
   */
  datosExtra?: Record<string, unknown> | null;
}

/** Una liquidación de la cuenta. SIN PII (NO incluye FormaPago/Titular/IBAN). */
export interface MappedLiquidacion {
  /** EIAC DatosLiquidacion/IdLiquidacionEntidad. */
  idLiquidacionEntidad: string | null;
  /** Estado mapeado al enum (best-effort + default `pendiente`). */
  estado: LiquidacionEstado;
  fechaLiquidacion: string | null;
  fechaPago: string | null;
  /** EIAC DatosLiquidacion/ImporteRemesa. Dato de negocio. */
  importeRemesa: string | null;
  /** → liquidaciones.datos_extra: `mediador {clase, codigoInterno, nombre}` y
   * `claseFormaPago`. NUNCA IBAN/BIC/Titular (cuenta propia de la correduría). */
  datosExtra?: Record<string, unknown> | null;
  movimientos: MappedLiquidacionMovimiento[];
}

/** Forma intermedia de UNA cuenta de efectivo EIAC. SIN raw_xml, SIN PII. */
export interface MappedCuentaEfectivo {
  /**
   * Señales legibles (SIN PII) detectadas al mapear que NO bloquean la ingesta del
   * snapshot financiero pero merecen revisión humana (ej. una liquidación con un
   * `EstadoLiquidacion` no reconocido → `estado_liquidacion_desconocido`). Vacío si
   * todo el contenido se reconoció. Espejo del `reviewReasons` de SIN/REC, salvo que
   * en CEF NUNCA cambia el outcome (CEF no tiene cuarentena): solo señaliza. */
  reviewReasons: string[];
  /** EIAC CuentaEfectivo/CodigoEntidad/CodigoDGS (clave de negocio + snapshot). */
  codigoEntidadDgs: string | null;
  periodo: { inicio: string | null; fin: string | null };
  saldos: { inicial: string | null; final: string | null };
  conceptos: {
    recibosCobrados: string | null;
    comisionesRecibos: string | null;
    retencionComisiones: string | null;
    siniestrosPagados: string | null;
    otrosConceptos: string | null;
    retencionOtros: string | null;
    remesas: string | null;
  };
  liquidaciones: MappedLiquidacion[];
  /** → cuenta_efectivo.datos_extra: `mediador {clase, codigoInterno, nombre}`. */
  datosExtra?: Record<string, unknown> | null;
}

// --- Helper local (str): idéntico al privado del REC/SIN mapper. PURO, nunca throw. ---
function str(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/** Parsea un entero del EIAC (string). null si no es un entero válido. */
function toInt(raw: unknown): number | null {
  const s = str(raw);
  if (s == null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// --- Forma de entrada laxa (superset estructural del CEF del adapter) ---

export interface ParsedImporteMovimiento {
  NumeroOrden?: unknown;
  ClaseImporte?: unknown;
  Importe?: unknown;
  [k: string]: unknown;
}

export interface ParsedCefComision {
  ClaseComision?: unknown;
  ComisionBruta?: unknown;
  ComisionLiquida?: unknown;
  Base?: unknown;
  RetencionIRPF?: unknown;
  [k: string]: unknown;
}

export interface ParsedMovimientoContable {
  Clase?: unknown;
  Concepto?: unknown;
  Descripcion?: unknown;
  ImporteBruto?: unknown;
  ImporteLiquido?: unknown;
  RetencionIRPF?: unknown;
  [k: string]: unknown;
}

export interface ParsedMovimientoLiquidacion {
  NumeroOrden?: unknown;
  FechaMovimiento?: unknown;
  ImporteMovimiento?: ParsedImporteMovimiento;
  MovimientoRecibo?: {
    DatosPoliza?: {
      IdPoliza?: unknown;
      CodigoEntidad?: CodigoEntidadEiac;
      NumeroSuplemento?: unknown;
    };
    DatosRecibo?: {
      IdRecibo?: unknown;
      IdRemesa?: unknown;
      SituacionRecibo?: unknown;
      ClaseRecibo?: unknown;
      DatosComisiones?: { Comision?: ParsedCefComision | ParsedCefComision[] };
      Fechas?: {
        FechaEmision?: unknown;
        FechaEfectoInicial?: unknown;
        FechaEfectoActual?: unknown;
        FechaVencimiento?: unknown;
        FechaSituacion?: unknown;
      };
      DatosImportes?: {
        Importes?: {
          PrimaNeta?: unknown;
          PrimaTotal?: unknown;
          DatosCargos?: { Cargo?: unknown };
        };
        ImportesDEC?: Record<string, unknown>;
      };
      MovimientosRecibo?: { Movimiento?: unknown };
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  MovimientoContable?: ParsedMovimientoContable;
  [k: string]: unknown;
}

export interface ParsedDatosLiquidacion {
  IdLiquidacionEntidad?: unknown;
  EstadoLiquidacion?: unknown;
  FechaLiquidacion?: unknown;
  FechaPago?: unknown;
  ImporteRemesa?: unknown;
  MovimientosLiquidacion?: {
    MovimientoLiquidacion?:
      | ParsedMovimientoLiquidacion
      | ParsedMovimientoLiquidacion[];
  };
  DatosMediador?: ParsedDatosMediador;
  /** ⚠️ FormaPago: solo se lee `ClaseFormaPago`; IBAN/BIC/Titular NUNCA. */
  FormaPago?: { ClaseFormaPago?: unknown; [k: string]: unknown };
  [k: string]: unknown;
}

export interface ParsedLiquidacion {
  DatosLiquidacion?: ParsedDatosLiquidacion;
  [k: string]: unknown;
}

export interface ParsedCuentaEfectivo {
  CodigoEntidad?: CodigoEntidadEiac;
  DatosMediador?: ParsedDatosMediador;
  Periodo?: { FechaInicio?: unknown; FechaFin?: unknown };
  Saldos?: { SaldoInicial?: unknown; SaldoFinal?: unknown };
  Conceptos?: {
    RecibosCobrados?: unknown;
    ComisionesRecibos?: unknown;
    RetencionComisiones?: unknown;
    SiniestrosPagados?: unknown;
    OtrosConceptos?: unknown;
    RetencionOtros?: unknown;
    Remesas?: unknown;
  };
  Liquidaciones?: {
    Liquidacion?: ParsedLiquidacion | ParsedLiquidacion[];
  };
  [k: string]: unknown;
}

/** Entrada del mapper: el árbol JSON del EIAC CEF (lo produce el adapter en
 * `fichero.datos`). Aceptamos el wrapper `ProcesosEIAC` o sin él (defensivo). */
export interface ParsedEiacCef {
  ProcesosEIAC?: { Objetos?: { CuentaEfectivo?: ParsedCuentaEfectivo | ParsedCuentaEfectivo[] } };
  Objetos?: { CuentaEfectivo?: ParsedCuentaEfectivo | ParsedCuentaEfectivo[] };
}

/** Desenvuelve el wrapper ProcesosEIAC si está presente. */
function unwrapCuentas(
  parsed: ParsedEiacCef,
): ParsedCuentaEfectivo | ParsedCuentaEfectivo[] | undefined {
  return (
    parsed?.ProcesosEIAC?.Objetos?.CuentaEfectivo ??
    parsed?.Objetos?.CuentaEfectivo
  );
}

/** Resultado de `mapLiquidacionEstado`: el estado + si el código fue reconocido por
 * el dict verificado (`conocido=false` ⇒ cayó al default `pendiente` en silencio). */
export interface MappedLiquidacionEstado {
  estado: LiquidacionEstado;
  /** true si un case explícito del switch matcheó; false si cayó al default final. */
  conocido: boolean;
}

/**
 * Mapea `EstadoLiquidacion` al enum `liquidacion_estado`. Dict best-effort (CONFIRMAR
 * codes TIREA); default `pendiente` para no bloquear la ingesta por un código nuevo.
 * Devuelve `conocido` (espejo de `mapReciboSituacion`/`mapSiniestroEstado`): si el
 * código no matchea el dict verificado, `conocido=false` para que el caller señalice
 * `estado_liquidacion_desconocido` en vez de mostrar una liquidación anulada/parcial
 * como `pendiente` en silencio.
 *
 * Códigos (best-effort): LI=Liquidada (visto en prod). PE/PD=Pendiente. PA=Parcial.
 * AN=Anulada. (CONFIRMAR TIREA — dict defensivo.)
 */
export function mapLiquidacionEstado(raw: unknown): MappedLiquidacionEstado {
  switch (str(raw)?.toUpperCase()) {
    case "LI": // Liquidada (visto en prod)
      return { estado: "liquidada", conocido: true };
    case "PE": // Pendiente
    case "PD":
      return { estado: "pendiente", conocido: true };
    case "PA": // Parcial
      return { estado: "parcial", conocido: true };
    case "AN": // Anulada
      return { estado: "anulada", conocido: true };
    default:
      // default defensivo: nunca bloquea la ingesta (CEF no tiene cuarentena), pero
      // señala `conocido=false` para que el caller mande la señal si había código.
      return { estado: "pendiente", conocido: false };
  }
}

/** Una comisión del recibo liquidado → forma compacta. null si viene vacía. */
function mapComision(c: ParsedCefComision | undefined) {
  const out = {
    clase: str(c?.ClaseComision),
    bruta: str(c?.ComisionBruta),
    liquida: str(c?.ComisionLiquida),
    base: str(c?.Base),
    retencionIrpf: str(c?.RetencionIRPF),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** `datos_extra` del movimiento: comisión liquidada, ids del recibo y el bloque
 * contable. SIN PII (IBAN/Titular del recibo embebido NO se leen). */
function buildMovimientoExtra(
  m: ParsedMovimientoLiquidacion | undefined,
): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  const dr = m?.MovimientoRecibo?.DatosRecibo;

  const comisiones = asArray(dr?.DatosComisiones?.Comision)
    .map((c) => mapComision(c))
    .filter((c) => c != null);
  if (comisiones.length > 0) extra.comision = comisiones[0];
  if (comisiones.length > 1) extra.comisionesExtra = comisiones.slice(1);

  const idRemesa = str(dr?.IdRemesa);
  if (idRemesa) extra.idRemesa = idRemesa;
  const situacionRecibo = str(dr?.SituacionRecibo);
  if (situacionRecibo) extra.situacionRecibo = situacionRecibo;
  const claseRecibo = str(dr?.ClaseRecibo);
  if (claseRecibo) extra.claseRecibo = claseRecibo;

  // 03/10/2026 — la copia del recibo dentro de la liquidación (Allianz, Occident):
  // importes, cargos, ImportesDEC, fechas y movimientos. Importes con `dec` (el
  // parser de importes del REC: decimal con signo, un anulado puede ser negativo);
  // lo que no sea un decimal válido se omite. NUNCA IBAN/BIC/Titular (no se leen).
  const imp = dr?.DatosImportes?.Importes;
  const primaNeta = dec(imp?.PrimaNeta);
  const primaTotal = dec(imp?.PrimaTotal);
  if (primaNeta) extra.primaNeta = primaNeta;
  if (primaTotal) extra.primaTotal = primaTotal;
  const cargos = asArray(imp?.DatosCargos?.Cargo as Record<string, unknown> | Record<string, unknown>[])
    .map((c) => {
      const o: Record<string, string> = {};
      const pares: Array<[string, string | null]> = [
        ["numeroOrden", str(c?.NumeroOrden)],
        ["clase", str(c?.ClaseCargo)],
        ["importe", dec(c?.Importe)],
        ["descripcion", str(c?.DescripcionCargo)],
      ];
      for (const [k, v] of pares) if (v) o[k] = v;
      return Object.keys(o).length > 0 ? o : null;
    })
    .filter((c): c is Record<string, string> => c !== null);
  if (cargos.length > 0) extra.cargos = cargos;
  const decIn = dr?.DatosImportes?.ImportesDEC;
  if (decIn && typeof decIn === "object") {
    const importesDec: Record<string, string> = {};
    for (const [k, v] of Object.entries(decIn)) {
      const s = dec(v);
      if (s) importesDec[k] = s;
    }
    if (Object.keys(importesDec).length > 0) extra.importesDec = importesDec;
  }
  const f = dr?.Fechas;
  const fechasRecibo: Record<string, string> = {};
  const paresFechas: Array<[string, string | null]> = [
    ["emision", toIsoDate(f?.FechaEmision)],
    ["efectoInicial", toIsoDate(f?.FechaEfectoInicial)],
    ["efectoActual", toIsoDate(f?.FechaEfectoActual)],
    ["vencimiento", toIsoDate(f?.FechaVencimiento)],
    ["situacion", toIsoDate(f?.FechaSituacion)],
  ];
  for (const [k, v] of paresFechas) if (v) fechasRecibo[k] = v;
  if (Object.keys(fechasRecibo).length > 0) extra.fechasRecibo = fechasRecibo;
  const movimientosRecibo = asArray(dr?.MovimientosRecibo?.Movimiento as Record<string, unknown> | Record<string, unknown>[])
    .map((mv) => {
      const o: Record<string, string> = {};
      const clase = str(mv?.ClaseMovimiento);
      const fecha = toIsoDate(mv?.FechaMovimiento);
      if (clase) o.clase = clase;
      if (fecha) o.fecha = fecha;
      return Object.keys(o).length > 0 ? o : null;
    })
    .filter((x): x is Record<string, string> => x !== null);
  if (movimientosRecibo.length > 0) extra.movimientosRecibo = movimientosRecibo;
  const numeroSuplemento = str(m?.MovimientoRecibo?.DatosPoliza?.NumeroSuplemento);
  if (numeroSuplemento) extra.numeroSuplemento = numeroSuplemento;

  const mc = m?.MovimientoContable;
  const contable = {
    clase: str(mc?.Clase),
    concepto: str(mc?.Concepto),
    descripcion: str(mc?.Descripcion),
    bruto: str(mc?.ImporteBruto),
    liquido: str(mc?.ImporteLiquido),
    retencionIrpf: str(mc?.RetencionIRPF),
  };
  if (Object.values(contable).some((v) => v != null)) extra.contable = contable;

  return Object.keys(extra).length > 0 ? extra : null;
}

/** Funde el «resto» de un nivel CEF en su `datosExtra` (ver `cima-extra.ts`). */
function conResto<T extends { datosExtra?: Record<string, unknown> | null }>(
  item: unknown,
  raiz: string,
  mapear: (item: unknown) => T,
  excluir: readonly string[] = [],
): T {
  const { resultado, cimaExtra } = conCimaExtra(item, raiz, mapear, { excluir });
  if (cimaExtra.entradas === null || (cimaExtra.entradas.length === 0 && (resultado.datosExtra ?? null) === null)) return resultado;
  return { ...resultado, datosExtra: { ...(resultado.datosExtra ?? {}), ...camposCimaExtra(cimaExtra) } };
}

const RAIZ_CUENTA = "CuentaEfectivo";
const RAIZ_LIQUIDACION = `${RAIZ_CUENTA}.Liquidaciones.Liquidacion`;
const RAIZ_MOVIMIENTO = `${RAIZ_LIQUIDACION}.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion`;

/** Movimiento + su resto → `liquidacion_movimientos.datos_extra.cimaExtra`. */
function mapOneMovimiento(m: ParsedMovimientoLiquidacion | undefined): MappedLiquidacionMovimiento {
  return conResto(m, RAIZ_MOVIMIENTO, (x) => mapOneMovimientoEspecifico(x as ParsedMovimientoLiquidacion | undefined));
}

/** Mapea UN movimiento de liquidación. PURA, nunca throw. SIN PII. */
function mapOneMovimientoEspecifico(
  m: ParsedMovimientoLiquidacion | undefined,
): MappedLiquidacionMovimiento {
  const mr = m?.MovimientoRecibo;
  return {
    numeroOrden: toInt(m?.NumeroOrden),
    fechaMovimiento: toIsoDate(m?.FechaMovimiento),
    claseImporte: str(m?.ImporteMovimiento?.ClaseImporte),
    importe: str(m?.ImporteMovimiento?.Importe),
    idPolizaEntidad: str(mr?.DatosPoliza?.IdPoliza),
    codigoEntidadDgs: codigoDgsDe(mr?.DatosPoliza?.CodigoEntidad),
    idReciboEiac: str(mr?.DatosRecibo?.IdRecibo),
    datosExtra: buildMovimientoExtra(m),
  };
}

/** Mapea UNA liquidación (con sus movimientos). PURA, nunca throw. SIN PII.
 * Devuelve también si el `EstadoLiquidacion` fue desconocido pese a venir presente,
 * para que `mapOneCuenta` lo agregue a `reviewReasons` (no lo bloquea). */
function mapOneLiquidacion(liq: ParsedLiquidacion | undefined): {
  mapped: MappedLiquidacion;
  estadoDesconocido: boolean;
} {
  // Resto de la liquidación → `liquidaciones.datos_extra.cimaExtra`. Los movimientos
  // guardan el suyo (subárbol excluido aquí).
  let estadoDesconocido = false;
  const mapped = conResto(
    liq,
    RAIZ_LIQUIDACION,
    (x) => {
      const r = mapOneLiquidacionEspecifico(x as ParsedLiquidacion | undefined);
      estadoDesconocido = r.estadoDesconocido;
      return r.mapped;
    },
    ["DatosLiquidacion.MovimientosLiquidacion"],
  );
  return { mapped, estadoDesconocido };
}

function mapOneLiquidacionEspecifico(liq: ParsedLiquidacion | undefined): {
  mapped: MappedLiquidacion;
  estadoDesconocido: boolean;
} {
  const dl = liq?.DatosLiquidacion;
  const movimientos = asArray(dl?.MovimientosLiquidacion?.MovimientoLiquidacion).map(
    (m) => mapOneMovimiento(m),
  );
  const { estado, conocido } = mapLiquidacionEstado(dl?.EstadoLiquidacion);
  // Señaliza solo si había un código presente que no se reconoció (ausente → sin señal).
  const estadoDesconocido = !conocido && str(dl?.EstadoLiquidacion) != null;
  const extra: Record<string, unknown> = {};
  const mediador = mapMediador(dl?.DatosMediador);
  if (mediador) extra.mediador = mediador;
  const claseFormaPago = str(dl?.FormaPago?.ClaseFormaPago);
  if (claseFormaPago) extra.claseFormaPago = claseFormaPago;
  return {
    mapped: {
      idLiquidacionEntidad: str(dl?.IdLiquidacionEntidad),
      estado,
      fechaLiquidacion: toIsoDate(dl?.FechaLiquidacion),
      fechaPago: toIsoDate(dl?.FechaPago),
      importeRemesa: str(dl?.ImporteRemesa),
      datosExtra: Object.keys(extra).length > 0 ? extra : null,
      movimientos,
    },
    estadoDesconocido,
  };
}

/** Cuenta + su resto → `cuentas` `datos_extra.cimaExtra` (liquidaciones: el suyo). */
function mapOneCuenta(cuenta: ParsedCuentaEfectivo | undefined): MappedCuentaEfectivo {
  return conResto(
    cuenta,
    RAIZ_CUENTA,
    (x) => mapOneCuentaEspecifico(x as ParsedCuentaEfectivo | undefined),
    ["Liquidaciones"],
  );
}

/** Mapea UNA cuenta de efectivo EIAC a `MappedCuentaEfectivo`. PURA, nunca throw. */
function mapOneCuentaEspecifico(
  cuenta: ParsedCuentaEfectivo | undefined,
): MappedCuentaEfectivo {
  const concept = cuenta?.Conceptos;
  const reviewReasons: string[] = [];
  const liquidaciones = asArray(cuenta?.Liquidaciones?.Liquidacion).map((l) => {
    const { mapped, estadoDesconocido } = mapOneLiquidacion(l);
    if (estadoDesconocido && !reviewReasons.includes("estado_liquidacion_desconocido")) {
      reviewReasons.push("estado_liquidacion_desconocido");
    }
    return mapped;
  });
  // V07.1 — CodigoEntidad presente con forma ilegible: señal (CEF no cambia de
  // outcome); persist-cef la usa de motivo en vez de «falta_codigo_entidad_dgs».
  if (codigoEntidadFormatoDesconocido(cuenta?.CodigoEntidad)) {
    reviewReasons.push(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO);
  }
  return {
    reviewReasons,
    codigoEntidadDgs: codigoDgsDe(cuenta?.CodigoEntidad),
    periodo: {
      inicio: toIsoDate(cuenta?.Periodo?.FechaInicio),
      fin: toIsoDate(cuenta?.Periodo?.FechaFin),
    },
    saldos: {
      inicial: str(cuenta?.Saldos?.SaldoInicial),
      final: str(cuenta?.Saldos?.SaldoFinal),
    },
    conceptos: {
      recibosCobrados: str(concept?.RecibosCobrados),
      comisionesRecibos: str(concept?.ComisionesRecibos),
      retencionComisiones: str(concept?.RetencionComisiones),
      siniestrosPagados: str(concept?.SiniestrosPagados),
      otrosConceptos: str(concept?.OtrosConceptos),
      retencionOtros: str(concept?.RetencionOtros),
      remesas: str(concept?.Remesas),
    },
    liquidaciones,
    datosExtra: (() => {
      const mediador = mapMediador(cuenta?.DatosMediador);
      return mediador ? { mediador } : null;
    })(),
  };
}

/**
 * Mapea TODAS las cuentas de efectivo de un EIAC CEF. Normalmente 1 por fichero, pero
 * el adapter podría traer un array. Si el fichero no trae ninguna, devuelve `[]`
 * (el pipeline lo registra sin perderlo). PURA.
 */
export function mapEiacCefAll(parsed: ParsedEiacCef): MappedCuentaEfectivo[] {
  return asArray(unwrapCuentas(parsed)).map((c) => mapOneCuenta(c));
}
