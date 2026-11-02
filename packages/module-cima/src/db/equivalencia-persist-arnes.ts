/**
 * ARNÉS del cepo de equivalencia de ESCRITURAS con el CRM (fase 3). Solo lo usan
 * `equivalencia-persist.test.ts` (código de central) y el generador del golden, que
 * corre el MISMO arnés con el código ORIGINAL del CRM (`asegura/src/lib/integrations/cima`).
 *
 * No importa NADA de drizzle ni del paquete: todo entra inyectado, para que el mismo
 * fichero sirva a los dos lados (cada uno con su copia de drizzle y su código).
 *
 * Qué hace: corre `runCimaPull` en modo REAL con un `db` de Drizzle sobre el driver
 * `pg-proxy` que NO toca ninguna BD: GRABA cada sentencia SQL con sus parámetros y
 * responde de forma determinista (SELECT → sin filas; `returning` → ids sintéticos;
 * catálogo de columnas → «existe»). `transaction(cb)` se emula con BEGIN/COMMIT/ROLLBACK
 * grabados. Los valores no deterministas se normalizan: cifrado AES-GCM (IV aleatorio)
 * → `<cifrado>`, «ahora» → `<ahora>`, «ahora + retención del crudo» → `<ahora+retencion>`.
 */

export interface SentenciaGrabada {
  sql: string;
  params: unknown[];
}

export type ProxyCallback = (
  sql: string,
  params: unknown[],
  method: "all" | "execute",
) => Promise<{ rows: unknown[] }>;

export interface ArnesOpts {
  xml: string;
  nombreFichero: string;
  tipoObjeto: "POL" | "REC" | "SIN" | "CEF";
  codigoEntidad: string;
  parseEiacXml: (xml: string) => unknown;
  /** `(cb) => drizzle(cb, { schema })` de `drizzle-orm/pg-proxy` del lado que corre. */
  drizzleProxy: (cb: ProxyCallback) => unknown;
  /** Construye las deps del pipeline con ESE db (cada lado con su `buildCimaPullDeps`). */
  construirDeps: (db: unknown) => Promise<unknown>;
  runCimaPull: (ficheros: unknown[], deps: never, opts: { dryRun: boolean }) => Promise<unknown>;
  ahoraMs: number;
}

/** Entorno común de los dos lados (claves de PRUEBA; nada real). */
export const ENV_ARNES: Record<string, string> = {
  NODE_ENV: "test",
  PII_ENCRYPTION_KEY: "a".repeat(64),
  PII_LOOKUP_KEY: "b".repeat(64),
  CIMA_INGESTA_CORREDURIA_ID: "11111111-2222-3333-4444-555555555555",
  CIMA_INGESTA_CODIGOS_ENTIDAD: "C0001",
  CIMA_INGESTA_SIN_ENABLED: "true",
  CIMA_INGESTA_REC_ENABLED: "true",
  CIMA_INGESTA_CEF_ENABLED: "true",
  CIMA_CODIGO_PLATAFORMA: "PLAT",
  CIMA_ESCRITOR: "central",
  CIMA_ADAPTER_URL: "https://adapter.example.test",
  CIMA_ADAPTER_INTERNAL_TOKEN: "T".repeat(32),
};

/** ACK OK de TIREA (lo que devuelve el adaptador a `confirmarDescarga`). */
export function respuestaAckOk(): Response {
  return new Response(JSON.stringify({ codigoRespuesta: "CIMA-200", descripcionRespuesta: "OK" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const RETENCION_MS = 6 * 366 * 24 * 60 * 60 * 1000;
const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

function normalizar(v: unknown, ahoraMs: number): unknown {
  if (typeof v === "string") {
    if (v.startsWith("v1:")) return "<cifrado>";
    if (ISO_TS.test(v)) {
      const t = Date.parse(v.includes("T") || v.endsWith("Z") ? v : `${v.replace(" ", "T")}Z`);
      if (!Number.isNaN(t)) {
        if (Math.abs(t - ahoraMs) < 60 * 60 * 1000) return "<ahora>";
        if (Math.abs(t - ahoraMs - RETENCION_MS) < 60 * 60 * 1000) return "<ahora+retencion>";
      }
    }
    // JSON con cifrados dentro (jsonb serializado).
    if ((v.startsWith("{") || v.startsWith("[")) && v.includes('"v1:')) {
      try {
        return { json: normalizar(JSON.parse(v), ahoraMs) };
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => normalizar(x, ahoraMs));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizar(x, ahoraMs)]));
  }
  return v;
}

/** Nº de columnas del `returning` (para devolver una fila de ids sintéticos). */
function columnasReturning(sql: string): number {
  const i = sql.toLowerCase().lastIndexOf(" returning ");
  if (i < 0) return 0;
  return sql.slice(i + 11).split(",").length;
}

export async function capturarEscrituras(o: ArnesOpts): Promise<{
  sentencias: SentenciaGrabada[];
  resultado: unknown;
}> {
  const sentencias: SentenciaGrabada[] = [];
  let id = 0;
  const cb: ProxyCallback = async (sql, params, method) => {
    sentencias.push({ sql, params: normalizar(params, o.ahoraMs) as unknown[] });
    if (/pg_catalog\.pg_attribute/.test(sql)) return { rows: [{ existe: true }] };
    const n = columnasReturning(sql);
    if (n > 0) {
      id++;
      const fila = Array.from({ length: n }, () => `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`);
      return { rows: method === "all" ? [fila] : [] };
    }
    return { rows: [] };
  };
  const base = o.drizzleProxy(cb) as Record<string | symbol, unknown>;
  // pg-proxy no soporta transacciones: se emulan sobre el mismo db, grabando los límites.
  const db: unknown = new Proxy(base, {
    get(t, prop) {
      if (prop === "transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          sentencias.push({ sql: "BEGIN", params: [] });
          try {
            const r = await fn(db);
            sentencias.push({ sql: "COMMIT", params: [] });
            return r;
          } catch (e) {
            sentencias.push({ sql: "ROLLBACK", params: [] });
            throw e;
          }
        };
      }
      const v = Reflect.get(t, prop, t);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
  const deps = await o.construirDeps(db);
  const fichero = {
    nombreFicheroComprimido: o.nombreFichero,
    tipoObjeto: o.tipoObjeto,
    versionEiac: "7.1",
    codigoEntidad: o.codigoEntidad,
    checksumVerified: false,
    datos: o.parseEiacXml(o.xml),
    rawXml: o.xml,
    zipEntryCount: 1,
  };
  const resultado = await o.runCimaPull([fichero], deps as never, { dryRun: false });
  return { sentencias, resultado: normalizar(JSON.parse(JSON.stringify(resultado)), o.ahoraMs) };
}
