/**
 * Fase 4 (sombra) — PURO. Normalización y comparación de valores, y ENMASCARADO del
 * informe: el informe se sube como artefacto de GitHub, así que no lleva PII en claro.
 *
 * Política de valores en el informe (`valorVisible`): LISTA BLANCA. Solo salen en claro las
 * columnas explícitamente no personales de `COLUMNAS_VISIBLES` (estados, fechas, importes,
 * códigos de entidad/ramo/situación, booleanos, ids técnicos uuid), y solo si el valor tiene
 * la forma de su clase (un importe que no es número, una fecha que no es fecha → `<oculto>`).
 *  - claves naturales (nº de póliza/recibo/siniestro de la entidad) y hash de fichero →
 *    seudónimo `h:xxxxxxxx` (HMAC-SHA256 con sal aleatoria POR EJECUCIÓN, 8 hex): «igual/difiere»
 *    sigue siendo útil dentro del informe y no es reversible;
 *  - cifrado (`v1:`) → `<cifrado>`; uuid → `<uuid>`;
 *  - TODO lo demás (texto libre, columnas no listadas, JSON) → `<oculto>`.
 * Y al final `enmascararInforme` pasa `sanitizePiiES` por TODAS las cadenas (defensa en
 * profundidad: nombres de fichero, motivos de error, claves…).
 */
import { createHmac, randomBytes } from "node:crypto";
import { sanitizePiiES } from "../pii-sanitizer.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/;
const NUM_RE = /^-?\d+(?:\.\d+)?$/;

type Clase = "importe" | "fecha" | "booleano" | "codigo" | "uuid" | "seudonimo";

/** LISTA BLANCA de columnas visibles (nombre exacto → clase). Lo que no esté aquí sale oculto. */
export const COLUMNAS_VISIBLES: Readonly<Record<string, Clase>> = Object.freeze({
  ...Object.fromEntries(
    ["id", "correduria_id", "cliente_id", "poliza_id", "comercial_id", "poliza_padre_id", "oportunidad_origen_id", "merged_into_poliza_id"].map((c) => [c, "uuid" as Clase]),
  ),
  ...Object.fromEntries(
    ["estado", "situacion", "ramo_dgs", "codigo_entidad_dgs", "posicion_cima", "responsabilidad_cima", "clase_recibo", "forma_pago", "clase_comision", "gestion_cobro"].map((c) => [c, "codigo" as Clase]),
  ),
  ...Object.fromEntries(
    ["fecha_inicio", "fecha_vencimiento", "fecha_efecto_inicial", "fecha_efecto_actual", "fecha_emision", "fecha_situacion", "fecha_solicitud", "fecha_hora", "fecha_declaracion", "periodo_inicio", "periodo_fin", "created_at", "updated_at"].map((c) => [c, "fecha" as Clase]),
  ),
  ...Object.fromEntries(
    [
      "prima_anual", "prima_mensual", "prima_bruta", "prima_total", "prima_neta", "comision_bruta", "comision_liquida", "base_comision",
      "retencion_irpf", "reserva_importe", "indemnizacion_importe", "reserva_cima", "indemnizacion_cima", "total_pagos_cima", "total_recobros_cima",
      "saldo_inicial", "saldo_final", "recibos_cobrados", "comisiones_recibos", "retencion_comisiones", "siniestros_pagados", "otros_conceptos",
      "retencion_otros", "remesas",
    ].map((c) => [c, "importe" as Clase]),
  ),
  ...Object.fromEntries(
    ["verificado_por_correduria", "auditar_seguimiento", "se_considera_culpable", "daa_cima"].map((c) => [c, "booleano" as Clase]),
  ),
  // Claves naturales de la entidad (nº de póliza/recibo/siniestro) y hash del fichero: seudónimo.
  ...Object.fromEntries(
    ["id_poliza_entidad", "id_recibo", "id_siniestro_entidad", "eiac_xml_hash"].map((c) => [c, "seudonimo" as Clase]),
  ),
});

/** Sal aleatoria por ejecución (proceso): los seudónimos no se pueden cruzar entre informes. */
const SAL = randomBytes(32);

/** Seudónimo no reversible de un valor: HMAC-SHA256(sal de la ejecución), 8 hex. */
export function seudonimo(v: unknown): string {
  const t = typeof v === "string" ? v : JSON.stringify(normalizarValor(v));
  return `h:${createHmac("sha256", SAL).update(t).digest("hex").slice(0, 8)}`;
}

/** Marca de cifrado de `module-seguros-pii` (AES-GCM con IV aleatorio). */
export const esCifrado = (v: unknown): boolean => typeof v === "string" && v.startsWith("v1:");

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, canonico((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** PURO. Lleva un valor de parámetro de Drizzle o de una fila de postgres.js a una forma
 * comparable: Date/timestamp → ISO UTC; JSON (texto u objeto) → JSON canónico. */
export function normalizarValor(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") {
    const ts = v.match(TS_RE);
    if (ts) {
      let zona = ts[3] ?? "Z";
      if (/^[+-]\d{2}$/.test(zona)) zona += ":00";
      else if (/^[+-]\d{4}$/.test(zona)) zona = `${zona.slice(0, 3)}:${zona.slice(3)}`;
      const d = new Date(`${ts[1]}T${ts[2]}${zona}`);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return JSON.stringify(canonico(JSON.parse(t)));
      } catch {
        return v;
      }
    }
    return v;
  }
  if (typeof v === "object") return JSON.stringify(canonico(v));
  return v;
}

export type Igualdad = "igual" | "distinto" | "no_comparable";

/** PURO. Compara un valor de central con el de la BD. Los cifrados solo se comparan si
 * hay `descifrar` (IV aleatorio: dos cifrados del mismo dato NUNCA son iguales). */
export function compararValores(central: unknown, crm: unknown, descifrar?: (v: string) => string | null): Igualdad {
  let a = central;
  let b = crm;
  if (esCifrado(a) || esCifrado(b)) {
    if (!descifrar) return "no_comparable";
    try {
      if (esCifrado(a)) a = descifrar(a as string);
      if (esCifrado(b)) b = descifrar(b as string);
    } catch {
      return "no_comparable";
    }
    // Sin clave, `decryptField` devuelve el cifrado tal cual: eso no es comparar.
    if (esCifrado(a) || esCifrado(b)) return "no_comparable";
  }
  const na = normalizarValor(a);
  const nb = normalizarValor(b);
  if (na === nb) return "igual";
  // Importes: `numeric` llega como texto ('12.50') y el parámetro puede ser número (12.5).
  const numA = typeof na === "number" || (typeof na === "string" && NUM_RE.test(na) && na.includes("."));
  const numB = typeof nb === "number" || (typeof nb === "string" && NUM_RE.test(nb) && nb.includes("."));
  if ((numA || numB) && na !== null && nb !== null && NUM_RE.test(String(na)) && NUM_RE.test(String(nb))) {
    return Number(na) === Number(nb) ? "igual" : "distinto";
  }
  // Fecha (date) frente a timestamp a medianoche UTC.
  if (typeof na === "string" && typeof nb === "string") {
    if (FECHA_RE.test(na) && nb === `${na}T00:00:00.000Z`) return "igual";
    if (FECHA_RE.test(nb) && na === `${nb}T00:00:00.000Z`) return "igual";
  }
  return "distinto";
}

const CODIGO_RE = /^[A-Za-z0-9_.\-/]{1,24}$/;
const OCULTO = "<oculto>";

/** PURO. Cómo aparece un valor en el informe (ver política arriba). */
export function valorVisible(columna: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && esCifrado(v)) return "<cifrado>";
  const clase = Object.hasOwn(COLUMNAS_VISIBLES, columna) ? COLUMNAS_VISIBLES[columna] : undefined;
  if (!clase) return OCULTO;
  switch (clase) {
    case "seudonimo":
      return seudonimo(v);
    case "uuid":
      return typeof v === "string" && UUID_RE.test(v) ? "<uuid>" : OCULTO;
    case "booleano":
      return typeof v === "boolean" ? v : OCULTO;
    case "importe":
      if (typeof v === "number") return Number.isFinite(v) ? v : OCULTO;
      return typeof v === "string" && NUM_RE.test(v) ? v : OCULTO;
    case "fecha": {
      const n = normalizarValor(v);
      return typeof n === "string" && (FECHA_RE.test(n) || /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(n)) ? n : OCULTO;
    }
    case "codigo":
      return typeof v === "string" && CODIGO_RE.test(v) ? sanitizePiiES(v, { maxLength: 24 }) : OCULTO;
  }
}

/** PURO. Pasa `sanitizePiiES` por todas las cadenas (claves incluidas) de un objeto. */
export function enmascararInforme<T>(v: T): T {
  const rec = (x: unknown): unknown => {
    if (typeof x === "string") return sanitizePiiES(x, { maxLength: 300 });
    if (Array.isArray(x)) return x.map(rec);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>).map(([k, y]) => [sanitizePiiES(k, { maxLength: 300 }), rec(y)]),
      );
    }
    return x;
  };
  return rec(v) as T;
}
