/**
 * Fase 4 (sombra) — PURO. Normalización y comparación de valores, y ENMASCARADO del
 * informe: el informe se sube como artefacto de GitHub, así que no lleva PII en claro.
 *
 * Política de valores en el informe (`valorVisible`), del más al menos conservador:
 *  - columna con nombre sensible (nombre, NIF, IBAN, email, teléfono, dirección,
 *    matrícula, descripción, datos/extra/json…) → `<oculto>`, sea cual sea el valor;
 *  - cifrado (`v1:`) → `<cifrado>`; uuid → `<uuid>`; objeto → `<json>`;
 *  - números, booleanos, fechas y códigos cortos (≤24, pasados por `sanitizePiiES`) en claro;
 *  - texto largo → `<texto N car.>`.
 * Y al final `enmascararInforme` pasa `sanitizePiiES` por TODAS las cadenas (defensa en
 * profundidad: nombres de fichero, motivos de error, claves…).
 */
import { sanitizePiiES } from "../pii-sanitizer.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/;
const NUM_RE = /^-?\d+(?:\.\d+)?$/;

export const COLUMNA_SENSIBLE =
  /(nombre|apellid|dni|nif|nie\b|cif|document|iban|cuenta_banc|email|correo|telefono|movil|direcc|domicil|calle|postal|matricula|bastidor|descrip|observ|nota|lugar|conductor|tomador|asegurad|beneficiar|lookup|hash|datos|extra|json|danos|terceros|contrario)/i;

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

/** PURO. Cómo aparece un valor en el informe (ver política arriba). */
export function valorVisible(columna: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (COLUMNA_SENSIBLE.test(columna)) return "<oculto>";
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return normalizarValor(v);
  if (typeof v === "string") {
    if (esCifrado(v)) return "<cifrado>";
    if (UUID_RE.test(v)) return "<uuid>";
    const n = normalizarValor(v);
    if (typeof n === "string" && (FECHA_RE.test(n) || /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(n))) return n;
    if (NUM_RE.test(v)) return v;
    if (typeof n === "string" && (n.startsWith("{") || n.startsWith("["))) return "<json>";
    if (v.length <= 24) return sanitizePiiES(v, { maxLength: 24 });
    return `<texto ${v.length} car.>`;
  }
  return "<json>";
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
