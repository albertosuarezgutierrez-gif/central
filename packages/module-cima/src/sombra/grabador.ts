/**
 * Fase 4 (sombra) — `db` de Drizzle GRABADOR para correr el pipeline de central sin
 * escribir NADA (mismo principio que el arnés del golden, `../db/equivalencia-persist-arnes.ts`).
 *
 * Driver `pg-proxy`: cada sentencia pasa por aquí y
 *  - si es LECTURA pura (`esLectura`), se REENVÍA a `leerSelect` (en la sombra real, la BD
 *    abierta en solo lectura) sin su `for update`;
 *  - si NO lo es, se GRABA y NUNCA se ejecuta: la respuesta la fabrica `alEscribir`
 *    (ids del `returning`), sin tocar ninguna conexión.
 * `transaction(cb)` se emula (BEGIN/COMMIT/ROLLBACK no se ejecutan): si el callback lanza,
 * las escrituras de ese tramo quedan marcadas `revertida` (central no las habría dejado).
 *
 * 🚨 Este fichero no recibe ninguna conexión: solo dos funciones. La única vía a la BD
 * real es `leerSelect`, y solo con sentencias que `esLectura` acepta.
 */
import { drizzle } from "drizzle-orm/pg-proxy";

import type { CimaDb } from "../db/conexion.ts";
import * as schema from "../db/schema.ts";
import { esLectura, quitarBloqueo } from "./sql-escrituras.ts";

export type ModoProxy = "all" | "execute";

/** Ejecuta una LECTURA en la BD (solo la llama el grabador, y solo con `esLectura`). */
export type LectorSql = (sql: string, params: unknown[], modo: ModoProxy) => Promise<unknown[]>;

/** Fabrica la respuesta de una escritura grabada (filas del `returning`, o `[]`). */
export type ResponderEscritura = (e: EscrituraGrabada) => Promise<unknown[]>;

export interface EscrituraGrabada {
  sql: string;
  params: unknown[];
  modo: ModoProxy;
  /** Fichero crudo que la produjo (contexto fijado por quien corre el pipeline). */
  fichero: string | null;
  /** `true` si iba dentro de una transacción que acabó en ROLLBACK. */
  revertida: boolean;
}

export interface DbGrabador {
  db: CimaDb;
  escrituras: EscrituraGrabada[];
  contadores: { lecturasReenviadas: number; escriturasGrabadas: number };
  /** Atribuye las escrituras siguientes a este fichero. */
  fijarFichero: (nombre: string | null) => void;
}

export function crearDbGrabador(o: { leerSelect: LectorSql; alEscribir: ResponderEscritura }): DbGrabador {
  const escrituras: EscrituraGrabada[] = [];
  const contadores = { lecturasReenviadas: 0, escriturasGrabadas: 0 };
  let fichero: string | null = null;

  const cb = async (sql: string, params: unknown[], modo: ModoProxy): Promise<{ rows: unknown[] }> => {
    if (esLectura(sql)) {
      contadores.lecturasReenviadas++;
      return { rows: await o.leerSelect(quitarBloqueo(sql), params, modo) };
    }
    const e: EscrituraGrabada = { sql, params, modo, fichero, revertida: false };
    escrituras.push(e);
    contadores.escriturasGrabadas++;
    return { rows: await o.alEscribir(e) };
  };

  const base = drizzle(cb, { schema }) as unknown as Record<string | symbol, unknown>;
  const db: unknown = new Proxy(base, {
    get(t, prop) {
      if (prop === "transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          const desde = escrituras.length;
          try {
            return await fn(db);
          } catch (err) {
            for (let i = desde; i < escrituras.length; i++) escrituras[i]!.revertida = true;
            throw err;
          }
        };
      }
      const v = Reflect.get(t, prop, t);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });

  return {
    db: db as CimaDb,
    escrituras,
    contadores,
    fijarFichero: (n) => {
      fichero = n;
    },
  };
}
