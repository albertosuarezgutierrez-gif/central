/**
 * LOO-753 (épica CIMA LOO-515) — Mapper PURO de un EIAC REC (recibo) parseado a la
 * forma intermedia `EiacRecMapped` que el pipeline de ingesta y el persist
 * (`persist-recibo.ts`) consumen. Espejo de `eiac-sin-mapper.ts`.
 *
 * CONTRATO DE ENTRADA — anclado a la estructura REAL del REC verificada contra
 * prod (probe 2026-06-24, muestras Allianz C0109; EIAC 6.0, proceso 211). Rutas:
 *   - `Objetos.Recibo` (objeto único o array; `asArray` colapsa arrays de 1).
 *   - póliza: `DatosPoliza/{IdPoliza, CodigoEntidad/CodigoDGS}` (para el matching).
 *   - recibo: `DatosRecibo/{IdRecibo, SituacionRecibo, ClaseRecibo,
 *     Fechas/{FechaSituacion, FechaEfectoInicial, FechaEfectoActual,
 *     FechaVencimiento, FechaEmision},
 *     GestionCobro/DatosFormaPago/{ClaseFormaPago, DatosCuentaCorriente/IBAN},
 *     DatosImportes/Importes/{PrimaTotal, PrimaNeta, DatosCargos/Cargo[]},
 *     DatosComisiones/Comision[], MovimientosRecibo/Movimiento, OtrosDatos/Dato[]}`.
 *
 * Diseño (paralelo a SIN):
 *  - GATING (D2/D8 espejo): sin `IdRecibo` → `needsReview` (no hay clave de negocio).
 *    El matching/cuarentena por póliza lo decide el pipeline (D2), NO el mapper.
 *  - `SituacionRecibo`: tabla oficial EIAC V07.1 §13.3.33 (PE, CO, DE, AN, LI, RE);
 *    EM/PD/DV/EX son defensivos, fuera del estándar. DESCONOCIDO → default
 *    `pendiente` + `reviewReason` (`estado_recibo_desconocido:<COD>`) para no
 *    mostrar un recibo devuelto como pendiente en silencio.
 *  - **IBAN (PII Tier-1)**: el mapper lo extrae en CLARO; el cifrado AES-256-GCM lo
 *    hace el persist (`persist-recibo.ts`), igual que la PII de terceros del SIN.
 *  - Primas/comisiones/cargos = dato de NEGOCIO del recibo (no PII) → claro.
 *  - `datosExtra` recoge la cola heterogénea (cargos[], comisiones>1, movimientos,
 *    otrosDatos) sin perder dato. SIN PII (no contiene IBAN ni datos de persona).
 *  - Función PURA: sin BD, sin red, sin crypto, sin process.env.
 *
 * Toda navegación es defensiva (optional chaining + `asArray`): nunca lanzamos por
 * datos basura; reusamos `asArray`/`toIsoDate` del POL mapper para no duplicar.
 */

import { camposCimaExtra, conCimaExtra } from "./cima-extra.ts";
import { codigoDgsDe, codigoEntidadFormatoDesconocido, CODIGO_ENTIDAD_FORMATO_DESCONOCIDO, type CodigoEntidadEiac } from "./codigo-entidad.ts";
import { asArray, esOtroDatoPersonal, toIsoDate } from "./eiac-pol-mapper.ts";

// --- Tipos de salida ---

/** Subset del enum `recibo_estado` del schema (schema.ts). */
export type EiacReciboEstado =
  | "cobrado"
  | "pendiente"
  | "devuelto"
  | "anulado"
  | "emitido";

export type EiacRecOutcome = "ok" | "review";

/** Forma intermedia de UN recibo EIAC. NO contiene raw_xml. El `iban` viene en
 * CLARO (el cifrado Tier-1 lo hace el persist). */
export interface EiacRecMapped {
  outcome: EiacRecOutcome;
  /** Motivos legibles (SIN PII) por los que va a review. Vacío si outcome='ok'. */
  reviewReasons: string[];
  // -- Clave de negocio / matching --
  /** EIAC `DatosRecibo/IdRecibo` → poliza_recibos.id_recibo (clave de negocio). */
  idRecibo: string | null;
  /** EIAC `CodigoEntidad/CodigoDGS` → poliza_recibos.codigo_entidad_dgs (+ matching). */
  codigoEntidadDgs: string | null;
  /** EIAC `DatosPoliza/IdPoliza` → matching contra polizas.numero_poliza. */
  idPolizaEntidad: string | null;
  // -- Estado VIVO --
  /** Situación mapeada al enum (best-effort + default `pendiente`). */
  situacion: EiacReciboEstado;
  /** EIAC `ClaseRecibo` (NP, ...). */
  claseRecibo: string | null;
  // -- Fechas (ISO `YYYY-MM-DD` o null) --
  fechaEfectoInicial: string | null;
  fechaEfectoActual: string | null;
  fechaVencimiento: string | null;
  fechaEmision: string | null;
  fechaSituacion: string | null;
  // -- Importes (dato de negocio, NO PII, en claro) --
  primaTotal: string | null;
  primaNeta: string | null;
  /** EIAC `ClaseFormaPago` (CC=domiciliación, IN=ingreso, ...). */
  formaPago: string | null;
  /** ⚠️ PII Tier-1 (IBAN) — en CLARO; el persist lo cifra. */
  iban: string | null;
  /** Primera comisión (si hay >1, el resto va a datosExtra). Dato de negocio. */
  comisionBruta: string | null;
  comisionLiquida: string | null;
  // Campos 0104 (auditoría 28/09/2026). Opcionales SOLO en el tipo, para que los
  // fakes de DI anteriores sigan tipando; el mapper los rellena SIEMPRE.
  /** Primera comisión: `ClaseComision` (ME, OT, ...). Crudo. */
  claseComision?: string | null;
  /** Primera comisión: `Base` sobre la que se calcula. Dato de negocio. */
  baseComision?: string | null;
  /** Primera comisión: `RetencionIRPF`. Dato de negocio. */
  retencionIrpf?: string | null;
  /** EIAC `DatosRecibo/IdRemesa` — casa el recibo con la remesa de la liquidación CEF. */
  idRemesa?: string | null;
  /** EIAC `GestionCobro/ClaseGestion`, crudo (CO=cobra la compañía; ME=cobra la
   * correduría). */
  gestionCobro?: string | null;
  /** Cola no mapeada: cargos[], comisionesExtra[], movimientos[] (con
   * motivoAnulacion/descripcionMotivo), otrosImportes[], otrosDatos[], importesDec,
   * numeroSuplemento, mediador {clase, codigoInterno, nombre}, fechaFinSeguro y
   * `moneda` (solo si NO es EUR). Sin PII de persona (Titular no se lee). */
  datosExtra: Record<string, unknown> | null;
}

// --- Helper local (str): idéntico al privado del SIN mapper. PURO, nunca throw. ---
function str(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/** Decimal EIAC (`NNN.NN`, con signo opcional) para columnas `numeric`: un texto
 * que no lo sea haría fallar el INSERT entero → null. PURO, nunca throw. */
export function dec(raw: unknown): string | null {
  const s = str(raw);
  return s != null && /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

// --- Forma de entrada laxa (superset estructural del REC del adapter) ---

export interface ParsedReciboCargo {
  NumeroOrden?: unknown;
  ClaseCargo?: unknown;
  Importe?: unknown;
  DescripcionCargo?: unknown;
  [k: string]: unknown;
}

export interface ParsedReciboComision {
  NumeroOrden?: unknown;
  ClaseComision?: unknown;
  ComisionBruta?: unknown;
  ComisionLiquida?: unknown;
  Base?: unknown;
  RetencionIRPF?: unknown;
  [k: string]: unknown;
}

export interface ParsedReciboMovimiento {
  NumeroOrden?: unknown;
  ClaseMovimiento?: unknown;
  FechaMovimiento?: unknown;
  Anulacion?: { MotivoAnulacion?: unknown; DescripcionMotivo?: unknown };
  [k: string]: unknown;
}

export interface ParsedReciboOtroImporte {
  ClaseOtroImporte?: unknown;
  Importe?: unknown;
  DescripcionOtroImporte?: unknown;
  [k: string]: unknown;
}

export interface ParsedDatosMediador {
  IdMediador?: { CodigoDGS?: unknown; CodigoInterno?: unknown };
  ClaseMediador?: unknown;
  NombreMediador?: unknown;
}

export interface ParsedReciboOtroDato {
  NumeroOrden?: unknown;
  IdDato?: unknown;
  DescripcionDato?: unknown;
  IdSubdato?: unknown;
  ValorSubdato?: unknown;
  [k: string]: unknown;
}

export interface ParsedDatosRecibo {
  IdRecibo?: unknown;
  IdRemesa?: unknown;
  SituacionRecibo?: unknown;
  ClaseRecibo?: unknown;
  Fechas?: {
    FechaSituacion?: unknown;
    FechaEfectoInicial?: unknown;
    FechaEfectoActual?: unknown;
    FechaVencimiento?: unknown;
    FechaEmision?: unknown;
    FechaFinSeguro?: unknown;
  };
  GestionCobro?: {
    ClaseGestion?: unknown;
    DatosFormaPago?: {
      ClaseFormaPago?: unknown;
      DatosCuentaCorriente?: { IBAN?: unknown; BIC?: unknown };
    };
  };
  DatosImportes?: {
    Importes?: {
      PrimaTotal?: unknown;
      PrimaNeta?: unknown;
      DatosCargos?: { Cargo?: ParsedReciboCargo | ParsedReciboCargo[] };
      OtrosImportes?: {
        Importe?: ParsedReciboOtroImporte | ParsedReciboOtroImporte[];
      };
      DatosMoneda?: { Moneda?: unknown; TipoCambio?: unknown; FechaCambio?: unknown };
    };
    ImportesDEC?: Record<string, unknown>;
  };
  DatosComisiones?: {
    Comision?: ParsedReciboComision | ParsedReciboComision[];
  };
  MovimientosRecibo?: {
    Movimiento?: ParsedReciboMovimiento | ParsedReciboMovimiento[];
  };
  OtrosDatos?: { Dato?: ParsedReciboOtroDato | ParsedReciboOtroDato[] };
}

export interface ParsedRecibo {
  DatosPoliza?: {
    IdPoliza?: unknown;
    NumeroSuplemento?: unknown;
    CodigoEntidad?: CodigoEntidadEiac;
    DatosMediador?: ParsedDatosMediador;
  };
  DatosRecibo?: ParsedDatosRecibo;
}

/** Entrada del mapper: el árbol JSON del EIAC REC (lo produce el adapter en
 * `fichero.datos`). Aceptamos el wrapper `ProcesosEIAC` o sin él (defensivo). */
export interface ParsedEiacRec {
  ProcesosEIAC?: { Objetos?: { Recibo?: ParsedRecibo | ParsedRecibo[] } };
  Objetos?: { Recibo?: ParsedRecibo | ParsedRecibo[] };
}

/** Desenvuelve el wrapper ProcesosEIAC si está presente. */
function unwrapRecibos(
  parsed: ParsedEiacRec,
): ParsedRecibo | ParsedRecibo[] | undefined {
  return parsed?.ProcesosEIAC?.Objetos?.Recibo ?? parsed?.Objetos?.Recibo;
}

/** Resultado de `mapReciboSituacion`: el estado + si el código fue reconocido por
 * el dict verificado (`conocido=false` ⇒ cayó al default `pendiente` en silencio). */
export interface MappedReciboEstado {
  situacion: EiacReciboEstado;
  /** true si un case explícito del switch matcheó; false si cayó al default final. */
  conocido: boolean;
}

/**
 * Mapea `SituacionRecibo` al enum `recibo_estado`. Base: tabla oficial EIAC V07.1
 * §13.3.33 claves_situacionrecibo; default `pendiente` para no bloquear la ingesta por un código
 * nuevo. Devuelve `conocido`: si el código no matchea el dict verificado,
 * `conocido=false` para que el caller mande a review (no mostrar un recibo
 * devuelto/anulado como `pendiente` en silencio).
 *
 * Oficiales §13.3.33: PE=Pendiente, CO=Cobrado, DE=Devuelto, AN=Anulado,
 * LI=Liquidado (cobrado y liquidado a la compañía → `cobrado`), RE=Rehabilitado
 * (vuelve al cobro → `pendiente`). Defensivos, fuera del estándar: EM=Emitido,
 * PD=Pendiente, DV=Devuelto, EX=Extornado.
 */
export function mapReciboSituacion(raw: unknown): MappedReciboEstado {
  switch (str(raw)?.toUpperCase()) {
    case "CO": // Cobrado
    case "LI": // Liquidado (cobrado y liquidado a la compañía)
      return { situacion: "cobrado", conocido: true };
    case "EM": // Emitido (sin gestión de cobro aún)
      return { situacion: "emitido", conocido: true };
    case "PE": // Pendiente
    case "RE": // Rehabilitado (vuelve al cobro)
    case "PD": // defensivo
      return { situacion: "pendiente", conocido: true };
    case "DE": // Devuelto (impago bancario)
    case "DV":
      return { situacion: "devuelto", conocido: true };
    case "AN": // Anulado
    case "EX": // Extornado
      return { situacion: "anulado", conocido: true };
    default:
      // default defensivo: nunca bloquea la ingesta, pero señala `conocido=false`
      // para que el caller mande a review si había un código presente.
      return { situacion: "pendiente", conocido: false };
  }
}

/** Construye `datosExtra` con la cola heterogénea no mapeada a columna. Devuelve
 * null si no hay nada (no inventa claves). SIN PII (no incluye IBAN ni persona). */
/** `DatosMediador` → `{clase, codigoInterno, nombre}` o null si viene vacío. Es el
 * propio corredor (o su auxiliar), no el cliente. Lo reusa el CEF mapper. */
export function mapMediador(
  dm: ParsedDatosMediador | undefined,
): { clase: string | null; codigoInterno: string | null; nombre: string | null } | null {
  const m = {
    clase: str(dm?.ClaseMediador),
    codigoInterno: str(dm?.IdMediador?.CodigoInterno),
    nombre: str(dm?.NombreMediador),
  };
  return m.clase || m.codigoInterno || m.nombre ? m : null;
}

/** Moneda del recibo si NO es euro (null si EUR o ausente: ausente = euro, como
 * siempre se ha leído). Un importe en otra divisa pintado como € es el «dato leído
 * mal» de CLAUDE.md → el caller lo manda a revisión. */
function monedaNoEur(dr: ParsedDatosRecibo | undefined): string | null {
  const m = str(dr?.DatosImportes?.Importes?.DatosMoneda?.Moneda)?.toUpperCase() ?? null;
  return m && m !== "EUR" ? m : null;
}

function buildDatosExtra(
  recibo: ParsedRecibo | undefined,
): Record<string, unknown> | null {
  const dr = recibo?.DatosRecibo;
  const extra: Record<string, unknown> = {};

  // DatosPoliza: suplemento y mediador (el propio corredor, no el cliente).
  const numeroSuplemento = str(recibo?.DatosPoliza?.NumeroSuplemento);
  if (numeroSuplemento) extra.numeroSuplemento = numeroSuplemento;
  const mediador = mapMediador(recibo?.DatosPoliza?.DatosMediador);
  if (mediador) extra.mediador = mediador;
  if (!dr) return Object.keys(extra).length > 0 ? extra : null;

  const fechaFinSeguro = toIsoDate(dr.Fechas?.FechaFinSeguro);
  if (fechaFinSeguro) extra.fechaFinSeguro = fechaFinSeguro;

  const moneda = monedaNoEur(dr);
  if (moneda) extra.moneda = moneda;

  // OtrosImportes/Importe[] (BO=bonificación, ...). Dato de negocio.
  const otrosImportes = asArray(dr.DatosImportes?.Importes?.OtrosImportes?.Importe)
    .map((i) => ({
      clase: str(i?.ClaseOtroImporte),
      importe: str(i?.Importe),
      descripcion: str(i?.DescripcionOtroImporte),
    }))
    .filter((i) => i.clase || i.importe || i.descripcion);
  if (otrosImportes.length > 0) extra.otrosImportes = otrosImportes;

  // Cargos (EIAC DatosCargos/Cargo[]). Dato de negocio.
  const cargos = asArray(dr.DatosImportes?.Importes?.DatosCargos?.Cargo)
    .map((c) => ({
      numeroOrden: str(c?.NumeroOrden),
      claseCargo: str(c?.ClaseCargo),
      importe: str(c?.Importe),
      descripcion: str(c?.DescripcionCargo),
    }))
    .filter((c) => c.claseCargo || c.importe || c.descripcion);
  if (cargos.length > 0) extra.cargos = cargos;

  // Comisiones extra (la [0] va a columna; el resto aquí para no perder dato).
  const comisiones = asArray(dr.DatosComisiones?.Comision);
  if (comisiones.length > 1) {
    extra.comisionesExtra = comisiones.slice(1).map((c) => ({
      numeroOrden: str(c?.NumeroOrden),
      claseComision: str(c?.ClaseComision),
      comisionBruta: str(c?.ComisionBruta),
      comisionLiquida: str(c?.ComisionLiquida),
      base: str(c?.Base),
      retencionIrpf: str(c?.RetencionIRPF),
    }));
  }

  // Movimientos del recibo (EM=emisión, AN=anulación...). Dato operativo. El motivo
  // de anulación (FA=falta de pago, SE=sin efecto, NI...) va crudo, solo si viene.
  const movimientos = asArray(dr.MovimientosRecibo?.Movimiento)
    .map((m) => {
      const mov: Record<string, string | null> = {
        numeroOrden: str(m?.NumeroOrden),
        claseMovimiento: str(m?.ClaseMovimiento),
        fechaMovimiento: toIsoDate(m?.FechaMovimiento),
      };
      const motivo = str(m?.Anulacion?.MotivoAnulacion);
      const descripcion = str(m?.Anulacion?.DescripcionMotivo);
      if (motivo || descripcion) {
        mov.motivoAnulacion = motivo;
        mov.descripcionMotivo = descripcion;
      }
      return mov;
    })
    .filter((m) => m.claseMovimiento || m.fechaMovimiento || m.motivoAnulacion);
  if (movimientos.length > 0) extra.movimientos = movimientos;

  // OtrosDatos/Dato[]. Cola libre del EIAC. 🚨 NO es «no de persona»: Mapfre
  // manda ahí NIF_PAGADOR, PAGADOR, DOCUMENTO TOMADOR y NIF_CIF, y hasta el
  // 28/09/2026 se guardaban EN CLARO (154 recibos). Mismo filtro que la póliza.
  const otros = asArray(dr.OtrosDatos?.Dato)
    .map((d) => ({
      idDato: str(d?.IdDato),
      descripcion: str(d?.DescripcionDato),
      idSubdato: str(d?.IdSubdato),
      valorSubdato: str(d?.ValorSubdato),
    }))
    .filter((d) => d.idDato || d.descripcion || d.valorSubdato)
    .filter((d) => !esOtroDatoPersonal(d.idDato, d.descripcion, d.valorSubdato));
  if (otros.length > 0) extra.otrosDatos = otros;

  // ImportesDEC (PrimaTotalAnualizada, etc.) — dato de negocio agregado.
  const dec = dr.DatosImportes?.ImportesDEC;
  if (dec && typeof dec === "object") {
    const decClean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dec)) {
      const s = str(v);
      if (s != null) decClean[k] = s;
    }
    if (Object.keys(decClean).length > 0) extra.importesDec = decClean;
  }

  return Object.keys(extra).length > 0 ? extra : null;
}

/**
 * Mapea TODOS los recibos de un EIAC REC. Normalmente 1 por fichero, pero el
 * adapter podría traer un array. Si el fichero no trae ninguno, devuelve un único
 * `review` (faltan datos) para que el pipeline lo registre sin perderlo. PURA.
 */
export function mapEiacRecAll(parsed: ParsedEiacRec): EiacRecMapped[] {
  const recibos = asArray(unwrapRecibos(parsed));
  if (recibos.length === 0) return [mapOneRecibo(undefined)];
  return recibos.map((r) => mapOneRecibo(r));
}

/** Mapea UN recibo + su «resto» → `poliza_recibos.datos_extra.cimaExtra` (ver `cima-extra.ts`). */
function mapOneRecibo(recibo: ParsedRecibo | undefined): EiacRecMapped {
  const { resultado, cimaExtra } = conCimaExtra(recibo, "Recibo", (r) =>
    mapOneReciboEspecifico(r as ParsedRecibo | undefined),
  );
  if (cimaExtra.entradas === null || (cimaExtra.entradas.length === 0 && resultado.datosExtra === null)) return resultado;
  return { ...resultado, datosExtra: { ...(resultado.datosExtra ?? {}), ...camposCimaExtra(cimaExtra) } };
}

/** Mapea UN recibo EIAC a `EiacRecMapped` (extractores específicos). PURA, nunca throw por datos. */
function mapOneReciboEspecifico(recibo: ParsedRecibo | undefined): EiacRecMapped {
  const reviewReasons: string[] = [];
  let reviewBlockers = 0;
  const pushReview = (reason: string) => {
    reviewReasons.push(reason);
    reviewBlockers += 1;
  };

  const dr = recibo?.DatosRecibo;
  const idRecibo = str(dr?.IdRecibo);
  const codigoEntidadDgs = codigoDgsDe(recibo?.DatosPoliza?.CodigoEntidad);
  // V07.1 — CodigoEntidad presente con forma ilegible: nota (NO review, el flujo de
  // cuarentena no cambia); el pipeline la usa de motivo en vez de «clave_incompleta».
  if (codigoEntidadFormatoDesconocido(recibo?.DatosPoliza?.CodigoEntidad)) {
    reviewReasons.push(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO);
  }
  const idPolizaEntidad = str(recibo?.DatosPoliza?.IdPoliza);

  // Clave de negocio: sin IdRecibo no hay idempotencia → review (no se persiste).
  if (!idRecibo) pushReview("falta_id_recibo");

  // Estado VIVO: si el código no está en el dict verificado y había un valor
  // presente, mandamos a review en vez de mostrar `pendiente` en silencio.
  const { situacion, conocido } = mapReciboSituacion(dr?.SituacionRecibo);
  if (!conocido && str(dr?.SituacionRecibo) != null) {
    pushReview(
      `estado_recibo_desconocido:${(str(dr?.SituacionRecibo) ?? "").toUpperCase().slice(0, 10)}`,
    );
  }

  // Divisa: primas y comisiones se leen y pintan como euros. Si el recibo viene en
  // otra moneda, a revisión en vez de guardar un número plausible y falso.
  if (monedaNoEur(dr)) pushReview("moneda_no_eur");

  // Importes (negocio). Primera comisión a columna; resto a datosExtra.
  const importes = dr?.DatosImportes?.Importes;
  const comision0 = asArray(dr?.DatosComisiones?.Comision)[0];

  // IBAN — PII Tier-1, en CLARO aquí (el persist lo cifra).
  const iban = str(
    dr?.GestionCobro?.DatosFormaPago?.DatosCuentaCorriente?.IBAN,
  );

  const fechas = dr?.Fechas;

  const outcome: EiacRecOutcome = reviewBlockers > 0 ? "review" : "ok";

  return {
    outcome,
    reviewReasons,
    idRecibo,
    codigoEntidadDgs,
    idPolizaEntidad,
    situacion,
    claseRecibo: str(dr?.ClaseRecibo),
    fechaEfectoInicial: toIsoDate(fechas?.FechaEfectoInicial),
    fechaEfectoActual: toIsoDate(fechas?.FechaEfectoActual),
    fechaVencimiento: toIsoDate(fechas?.FechaVencimiento),
    fechaEmision: toIsoDate(fechas?.FechaEmision),
    fechaSituacion: toIsoDate(fechas?.FechaSituacion),
    primaTotal: str(importes?.PrimaTotal),
    primaNeta: str(importes?.PrimaNeta),
    formaPago: str(dr?.GestionCobro?.DatosFormaPago?.ClaseFormaPago),
    iban,
    comisionBruta: str(comision0?.ComisionBruta),
    comisionLiquida: str(comision0?.ComisionLiquida),
    claseComision: str(comision0?.ClaseComision),
    baseComision: dec(comision0?.Base),
    retencionIrpf: dec(comision0?.RetencionIRPF),
    idRemesa: str(dr?.IdRemesa),
    gestionCobro: str(dr?.GestionCobro?.ClaseGestion),
    datosExtra: buildDatosExtra(recibo),
  };
}
