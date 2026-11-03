/**
 * Fase 4 (sombra) — ejecución contra la BD REAL en SOLO LECTURA. Lo usa
 * `scripts/cima-sombra.mts` (y el workflow manual `cima-sombra.yml`).
 *
 * Cuatro seguros, en este orden:
 *  1. `CIMA_ESCRITOR` real ≠ `central` (si no, aborta ANTES de leer la URL ni conectar);
 *     y se fuerza `process.env.CIMA_ESCRITOR = "ninguno"` para todo lo que venga después.
 *  2. Sesión con `SET default_transaction_read_only = on`.
 *  3. Todo dentro de UNA transacción `READ ONLY` (repeatable read: foto coherente), que
 *     además se deshace al final (ROLLBACK), y se comprueba `transaction_read_only = on`.
 *  4. El pipeline solo ve el grabador (`compararSombra`): las escrituras no se ejecutan.
 *
 * Secretos (solo NOMBRES): `CIMA_SOMBRA_DATABASE_URL` (rol de solo lectura del schema
 * `seguros`; conexión directa o pooler en modo SESIÓN :5432) vía `requireSecret`, y
 * `PII_ENCRYPTION_KEY` + `PII_LOOKUP_KEY` (descifrar los crudos y resolver clientes por
 * índice ciego). Nada se imprime salvo recuentos.
 */
import postgres from "postgres";

import { requireSecret } from "@central/core-identity/secret";
import { decryptField } from "@central/module-seguros-pii";

import { exigirClavesPii } from "../db/conexion.ts";
import {
  CLAVES_NATURALES,
  compararSombra,
  exigirEscritorNoCentral,
  type CrudoSombra,
  type FilaBd,
  type InformeSombra,
  type LectorEstadoActual,
  type TablaComparada,
} from "./comparar.ts";
import type { LectorSql } from "./grabador.ts";

/** Paso 1. Lanza `CimaSombraEscritorCentralError` si el escritor real es central; si no,
 * fija `ninguno` en el entorno del proceso (nada de lo que corra después puede escribir). */
export function prepararEntornoSombra(env: Record<string, string | undefined> = process.env): void {
  exigirEscritorNoCentral(env);
  env.CIMA_ESCRITOR = "ninguno";
}

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/;

type Tx = postgres.TransactionSql<Record<string, unknown>>;

class FinDeSombra extends Error {
  readonly informe: InformeSombra;
  constructor(informe: InformeSombra) {
    super("fin_de_sombra");
    this.informe = informe;
  }
}

/** Lector del estado actual sobre la transacción de solo lectura. Las tablas y columnas
 * salen de listas cerradas (`CLAVES_NATURALES`), nunca de datos. */
function lectorEstado(tx: Tx, correduriaId: string): LectorEstadoActual {
  return {
    porClave: async (tabla, clave) => {
      const cols = CLAVES_NATURALES[tabla];
      const filas = await tx<FilaBd[]>`select * from ${tx(tabla)} where ${cols
        .map((c) => tx`${tx(c)} = ${clave[c] as string}`)
        .reduce((a, b) => tx`${a} and ${b}`)} limit 2`;
      return filas.length === 1 ? filas[0]! : null;
    },
    porId: async (tabla, id) => {
      const filas = await tx<FilaBd[]>`select * from ${tx(tabla)} where id = ${id} and correduria_id = ${correduriaId}`;
      return filas[0] ?? null;
    },
    porXmlHash: async (tabla: TablaComparada, hashes) =>
      tx<FilaBd[]>`select * from ${tx(tabla)} where correduria_id = ${correduriaId} and eiac_xml_hash in ${tx(hashes as string[])}`,
  };
}

/** Reenvío de las lecturas del pipeline. Cada una en su SAVEPOINT: si Postgres rechaza
 * algo (p. ej. por ser solo lectura), la transacción sigue viva y la lectura sale vacía. */
function lectorSql(tx: Tx, fallos: { n: number }): LectorSql {
  return async (sql, params, modo) => {
    try {
      return await tx.savepoint(async (sp) => {
        const q = sp.unsafe(sql, params as postgres.ParameterOrJSON<never>[]);
        return modo === "all" ? ((await q.values()) as unknown[]) : ((await q) as unknown[]);
      });
    } catch {
      fallos.n++;
      return [];
    }
  };
}

export interface EjecutarSombraOpts {
  env?: Record<string, string | undefined>;
  /** Máximo de crudos (los más antiguos primero). Sin él, todos. */
  limite?: number;
}

export async function ejecutarSombra(o: EjecutarSombraOpts = {}): Promise<InformeSombra & { lecturasFallidas: number; crudosIlegibles: number }> {
  const env = o.env ?? process.env;
  prepararEntornoSombra(env);
  const url = requireSecret("CIMA_SOMBRA_DATABASE_URL");
  exigirClavesPii(env);
  const schema = (env.CIMA_SOMBRA_SCHEMA ?? "seguros").trim();
  if (!SCHEMA_RE.test(schema)) throw new Error("cima_sombra_schema_invalido");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  // Igual que el driver de Drizzle para postgres-js: fechas y json en crudo.
  const transparente = (v: unknown) => v;
  for (const t of ["1184", "1082", "1083", "1114", "1182", "1185", "1115", "1231"]) {
    (sql.options.parsers as Record<string, unknown>)[t] = transparente;
    (sql.options.serializers as Record<string, unknown>)[t] = transparente;
  }
  (sql.options.serializers as Record<string, unknown>)["114"] = transparente;
  (sql.options.serializers as Record<string, unknown>)["3802"] = transparente;

  const fallos = { n: 0 };
  let ilegibles = 0;
  try {
    await sql.unsafe("set default_transaction_read_only = on");
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const [ro] = await tx<{ transaction_read_only: string }[]>`show transaction_read_only`;
      if (ro?.transaction_read_only !== "on") throw new Error("cima_sombra_transaccion_no_es_solo_lectura");
      await tx.unsafe(`set local search_path to ${schema}`);

      const filas = await tx<
        Array<{
          correduria_id: string;
          nombre_fichero: string;
          tipo_objeto: string;
          codigo_entidad: string | null;
          xml_hash: string;
          datos_cifrado: string;
          raw_xml_cifrado: string;
        }>
      >`select correduria_id, nombre_fichero, tipo_objeto, codigo_entidad, xml_hash, datos_cifrado, raw_xml_cifrado
          from cima_cuarentena_crudo
         order by created_at, nombre_fichero
         ${o.limite ? tx`limit ${o.limite}` : tx``}`;

      const corredurias = [...new Set(filas.map((f) => f.correduria_id))];
      const pedida = env.CIMA_INGESTA_CORREDURIA_ID?.trim();
      const correduriaId = pedida || (corredurias.length === 1 ? corredurias[0]! : "");
      if (!correduriaId) throw new Error(`cima_sombra_varias_corredurias:${corredurias.length}`);
      env.CIMA_INGESTA_CORREDURIA_ID = correduriaId;
      process.env.CIMA_INGESTA_CORREDURIA_ID = correduriaId;

      const crudos: CrudoSombra[] = [];
      for (const f of filas) {
        if (f.correduria_id !== correduriaId) continue;
        try {
          crudos.push({
            nombreFichero: f.nombre_fichero,
            tipoObjeto: f.tipo_objeto,
            codigoEntidad: f.codigo_entidad,
            xmlHash: f.xml_hash,
            datos: JSON.parse(decryptField(f.datos_cifrado)),
            rawXml: f.raw_xml_cifrado ? decryptField(f.raw_xml_cifrado) : null,
          });
        } catch {
          ilegibles++;
        }
      }

      const informe = await compararSombra({
        crudos,
        leerEstadoActual: lectorEstado(tx, correduriaId),
        leerSelect: lectorSql(tx, fallos),
        correduriaId,
        env,
        descifrar: (v) => decryptField(v),
      });
      // Se deshace SIEMPRE (aunque solo haya leído): el informe sale por la excepción.
      throw new FinDeSombra(informe);
    });
    throw new Error("cima_sombra_sin_informe");
  } catch (e) {
    if (e instanceof FinDeSombra) return { ...e.informe, lecturasFallidas: fallos.n, crudosIlegibles: ilegibles };
    throw e;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
