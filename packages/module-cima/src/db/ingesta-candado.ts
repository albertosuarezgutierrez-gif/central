/**
 * CANDADO ÚNICO entre los escritores de la ingesta CIMA (mig 0109, 02/11/2026).
 *
 * Hoy escriben dos: el cron de Actions del CRM (`cima-pull.yml`) y el respaldo de
 * plataforma (central, `/api/cron/cima-pull-respaldo`), que llama al MISMO
 * endpoint por su cuenta. Medido: 14 arranques a < 320 s en 60 días. Sin candado
 * pueden persistir y CONFIRMAR en TIREA el mismo fichero a la vez.
 *
 * Por qué una fila y no `pg_advisory_lock`: el pooler 6543 va en modo
 * transacción; un lock de sesión se queda en una conexión del pool ajena.
 *
 * - Adquirir: UN statement atómico. `ON CONFLICT … DO UPDATE … WHERE expira_en <
 *   now()` solo pisa una fila CADUCADA; si otro la tiene viva no devuelve fila.
 *   Dos INSERT simultáneos se serializan en el índice único: el segundo re-evalúa
 *   el WHERE contra la fila ya confirmada del primero y no devuelve nada.
 * - Liberar: DELETE por nombre Y titular. Quien llegue tarde (su candado caducó y
 *   otro lo reclamó) no suelta el del otro.
 * - Hora: `now()` de la BD, no `Date.now()` de cada función (sin desfase).
 * - Caducidad 10 min: máximo observado 156 s, `maxDuration` 300 s. No hace falta
 *   renovar: Vercel mata la función antes de que caduque.
 * - FAIL-SAFE ACOTADO: solo si el candado NO ESTÁ DESPLEGADO (42P01 tabla aún no
 *   creada, 42501 falta el GRANT) se corre «sin candado» = el comportamiento de
 *   antes, con aviso en log Y en operational_events (`cima_candado_no_disponible`).
 *   Cualquier OTRO error al adquirir (conexión caída, timeout, pooler) NO autoriza
 *   a correr: no sabemos si hay otro escritor, así que la ruta responde 503 sin
 *   tocar TIREA (el pull fallaría igual con la BD así; la siguiente franja lo recoge).
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

/** Mínimo que se necesita del cliente (db de Drizzle). */
export type ConExecuteCandado = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const CANDADO_INGESTA_CIMA = "cima_ingesta";
export const CADUCIDAD_CANDADO_MS = 10 * 60 * 1000;

/** Por qué no hay candado. `error` = fallo de BD que NO autoriza a correr sin él. */
export type MotivoSinCandado = "tabla_ausente" | "sin_permiso" | "error";

/** Solo estos motivos significan «el candado no está desplegado» (fail-safe). */
export type MotivoNoDesplegado = Exclude<MotivoSinCandado, "error">;

export type ResultadoCandado =
  | { estado: "adquirido"; titular: string }
  | { estado: "ocupado"; titularActual: string | null; expiraEn: string | null }
  | { estado: "sin_candado"; motivo: MotivoNoDesplegado }
  | { estado: "error" };

export type CandadoOcupado = Extract<ResultadoCandado, { estado: "ocupado" }>;

/** Titular opaco y único por invocación: `<escritor>:<uuid>`. Sin PII. */
export function nuevoTitularCandado(escritor: string, uuid: string = randomUUID()): string {
  return `${escritor}:${uuid}`;
}

function codigoPg(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && typeof e === "object" && i < 4; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** Por qué no hay candado: 42P01 = tabla no creada, 42501 = falta el GRANT. */
export function motivoSinCandado(err: unknown): MotivoSinCandado {
  const code = codigoPg(err);
  if (code === "42P01") return "tabla_ausente";
  if (code === "42501") return "sin_permiso";
  return "error";
}

function filas(r: unknown): Array<Record<string, unknown>> {
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return null;
}

export async function adquirirCandadoIngesta(
  dbc: ConExecuteCandado,
  opts: { titular: string; nombre?: string; caducidadMs?: number },
): Promise<ResultadoCandado> {
  const nombre = opts.nombre ?? CANDADO_INGESTA_CIMA;
  const segundos = Math.round((opts.caducidadMs ?? CADUCIDAD_CANDADO_MS) / 1000);
  let adquirida: Array<Record<string, unknown>>;
  try {
    adquirida = filas(
      await dbc.execute(sql`
        insert into ingesta_candado (nombre, titular, adquirido_en, expira_en)
        values (${nombre}, ${opts.titular}, now(), now() + make_interval(secs => ${segundos}))
        on conflict (nombre) do update
          set titular = excluded.titular,
              adquirido_en = excluded.adquirido_en,
              expira_en = excluded.expira_en
          where ingesta_candado.expira_en < now()
        returning titular`),
    );
  } catch (err) {
    const motivo = motivoSinCandado(err);
    return motivo === "error" ? { estado: "error" } : { estado: "sin_candado", motivo };
  }
  if (adquirida.length > 0 && adquirida[0].titular === opts.titular) {
    return { estado: "adquirido", titular: opts.titular };
  }
  // Ocupado. Quién lo tiene es solo para el log/evento: si no se puede leer,
  // sigue ocupado (nunca se interpreta como libre).
  try {
    const actual = filas(
      await dbc.execute(sql`
        select titular, expira_en from ingesta_candado where nombre = ${nombre}`),
    )[0];
    return {
      estado: "ocupado",
      titularActual: typeof actual?.titular === "string" ? actual.titular : null,
      expiraEn: iso(actual?.expira_en),
    };
  } catch {
    return { estado: "ocupado", titularActual: null, expiraEn: null };
  }
}

/** Suelta el candado SOLO si sigue siendo de `titular`. true = lo soltó. */
export async function liberarCandadoIngesta(
  dbc: ConExecuteCandado,
  opts: { titular: string; nombre?: string },
): Promise<boolean> {
  const nombre = opts.nombre ?? CANDADO_INGESTA_CIMA;
  const r = filas(
    await dbc.execute(sql`
      delete from ingesta_candado where nombre = ${nombre} and titular = ${opts.titular}
      returning nombre`),
  );
  return r.length > 0;
}

/**
 * Corre `trabajo` (lo que toca TIREA y escribe) bajo el candado.
 * - ocupado → NO corre `trabajo`; devuelve `alOcupado(info)` (la ruta responde 409).
 * - sin candado (no desplegado: 42P01/42501) → corre `trabajo` como antes, avisa
 *   en log y llama a `registrarSinCandado` (best-effort: si falla, se sigue).
 * - error de BD al adquirir → NO corre `trabajo`; devuelve `alErrorCandado()` (503).
 * - adquirido → corre `trabajo` y libera en finally (un fallo al liberar se
 *   registra y no tapa el resultado: el candado caduca solo).
 */
export async function ejecutarConCandadoIngesta<T>(
  opts: {
    dbc: ConExecuteCandado;
    escritor: string;
    log: (evento: string, extra?: Record<string, unknown>) => void;
    alOcupado: (info: CandadoOcupado) => Promise<T>;
    alErrorCandado: () => Promise<T>;
    registrarSinCandado: (info: { motivo: MotivoNoDesplegado; escritor: string }) => Promise<void>;
  },
  trabajo: () => Promise<T>,
): Promise<T> {
  const titular = nuevoTitularCandado(opts.escritor);
  const r = await adquirirCandadoIngesta(opts.dbc, { titular });

  if (r.estado === "ocupado") {
    opts.log("candado_ocupado", {
      escritor: opts.escritor,
      titularActual: r.titularActual,
      expiraEn: r.expiraEn,
    });
    return opts.alOcupado(r);
  }

  if (r.estado === "error") {
    opts.log("candado_error", { escritor: opts.escritor });
    return opts.alErrorCandado();
  }

  if (r.estado === "sin_candado") {
    const extra = { motivo: r.motivo, escritor: opts.escritor };
    opts.log("candado_no_disponible", extra);
    try {
      await opts.registrarSinCandado(extra);
    } catch {
      opts.log("candado_no_disponible_registro_fallo", { escritor: opts.escritor });
    }
    console.warn(
      JSON.stringify({
        source: "cima.ingesta-candado",
        event: "candado_no_disponible",
        ...extra,
        nota: "la ingesta sigue SIN candado (comportamiento previo a la mig 0109)",
      }),
    );
    return trabajo();
  }

  try {
    return await trabajo();
  } finally {
    try {
      await liberarCandadoIngesta(opts.dbc, { titular });
    } catch (err) {
      opts.log("candado_liberar_fallo", {
        escritor: opts.escritor,
        motivo: motivoSinCandado(err),
      });
    }
  }
}
