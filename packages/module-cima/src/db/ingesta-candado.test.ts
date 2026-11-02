/**
 * 🪤 Candado único entre escritores de la ingesta CIMA (mig 0109, 02/11/2026).
 *
 * Tests SIN BD (fake del `execute` de Drizzle). La SEMÁNTICA del SQL (atómico,
 * caducado reclamable, liberación por titular, dos conexiones a la vez) se prueba
 * contra Postgres real en `src/db/__tests__/ingesta-candado.policy.test.ts`
 * (`npm run test:rls`).
 *
 * Lo que vigila este fichero:
 *   · adquirido → el trabajo (la llamada a TIREA) corre y el candado se LIBERA en
 *     finally, también si el trabajo lanza;
 *   · ocupado → el trabajo NO corre (no se toca TIREA) y se devuelve lo de `alOcupado`;
 *   · tabla ausente / sin permiso / error → el trabajo corre SIN candado y se avisa
 *     en log (fail-safe: nunca bloquear la ingesta);
 *   · la liberación va por titular (el DELETE lleva el titular propio);
 *   · la caducidad cubre de sobra el `maxDuration` de las rutas que lo usan.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import {
  CADUCIDAD_CANDADO_MS,
  CANDADO_INGESTA_CIMA,
  adquirirCandadoIngesta,
  ejecutarConCandadoIngesta,
  liberarCandadoIngesta,
  motivoSinCandado,
  nuevoTitularCandado,
  type ConExecuteCandado,
} from "./ingesta-candado.ts";

const dialect = new PgDialect();

type Llamada = { sql: string; params: unknown[] };

/** Fake del `execute` de Drizzle: responde por orden con las filas dadas o lanza. */
type Respuesta = unknown[] | Error | ((params: unknown[]) => unknown[]);

/** El INSERT del candado devuelve el titular que se le pasó (el real es aleatorio). */
const ECO_TITULAR = (params: unknown[]) => [{ titular: params[1] }];

function fakeDb(respuestas: Respuesta[]): ConExecuteCandado & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async execute(q) {
      const { sql, params } = dialect.sqlToQuery(q as Parameters<PgDialect["sqlToQuery"]>[0]);
      llamadas.push({ sql, params });
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      if (typeof r === "function") return r(params);
      return r ?? [];
    },
  };
}

function errPg(code: string, envuelto = false): Error {
  const e = Object.assign(new Error(`pg ${code}`), { code });
  // Drizzle ≥0.44 envuelve el error del driver en DrizzleQueryError con `cause`.
  return envuelto ? Object.assign(new Error("Failed query"), { cause: e }) : e;
}

const silencio = () => {};

describe("adquirirCandadoIngesta", () => {
  it("adquiere con UN INSERT … ON CONFLICT DO UPDATE … WHERE expira_en < now() RETURNING", async () => {
    const db = fakeDb([[{ titular: "crm:cima-pull:A" }]]);
    const r = await adquirirCandadoIngesta(db, { titular: "crm:cima-pull:A" });
    assert.deepEqual(r, { estado: "adquirido", titular: "crm:cima-pull:A" });
    assert.equal(db.llamadas.length, 1);
    const q = db.llamadas[0].sql.replace(/\s+/g, " ");
    assert.match(q, /insert into ingesta_candado/i);
    assert.match(q, /on conflict \(nombre\) do update/i);
    assert.match(q, /where ingesta_candado\.expira_en < now\(\)/i);
    assert.match(q, /returning titular/i);
    assert.ok(db.llamadas[0].params.includes(CANDADO_INGESTA_CIMA));
    assert.ok(db.llamadas[0].params.includes("crm:cima-pull:A"));
  });

  it("ocupado: sin fila devuelta → estado ocupado con quién lo tiene (best-effort)", async () => {
    const expira = new Date("2026-11-02T10:10:00Z");
    const db = fakeDb([[], [{ titular: "plataforma:B", expira_en: expira }]]);
    const r = await adquirirCandadoIngesta(db, { titular: "crm:cima-pull:A" });
    assert.deepEqual(r, {
      estado: "ocupado",
      titularActual: "plataforma:B",
      expiraEn: expira.toISOString(),
    });
  });

  it("ocupado aunque falle leer quién lo tiene (no se convierte en «libre»)", async () => {
    const db = fakeDb([[], new Error("boom")]);
    const r = await adquirirCandadoIngesta(db, { titular: "crm:cima-pull:A" });
    assert.deepEqual(r, { estado: "ocupado", titularActual: null, expiraEn: null });
  });

  it("tabla ausente (42P01, también envuelto por Drizzle) → sin_candado/tabla_ausente", async () => {
    for (const envuelto of [false, true]) {
      const db = fakeDb([errPg("42P01", envuelto)]);
      const r = await adquirirCandadoIngesta(db, { titular: "t" });
      assert.deepEqual(r, { estado: "sin_candado", motivo: "tabla_ausente" });
    }
  });

  it("sin GRANT (42501) → sin_candado/sin_permiso; cualquier otro error → estado error (NO sin candado)", async () => {
    assert.deepEqual(await adquirirCandadoIngesta(fakeDb([errPg("42501")]), { titular: "t" }), {
      estado: "sin_candado",
      motivo: "sin_permiso",
    });
    assert.deepEqual(await adquirirCandadoIngesta(fakeDb([new Error("ECONNRESET")]), { titular: "t" }), {
      estado: "error",
    });
  });

  it("la caducidad va a la BD en segundos (now() de la BD, no el reloj de la función)", async () => {
    const db = fakeDb([[{ titular: "t" }]]);
    await adquirirCandadoIngesta(db, { titular: "t" });
    assert.ok(db.llamadas[0].params.includes(CADUCIDAD_CANDADO_MS / 1000));
    assert.doesNotMatch(db.llamadas[0].sql, /\$\d+::timestamptz/);
  });
});

describe("liberarCandadoIngesta", () => {
  it("borra SOLO la fila del titular propio", async () => {
    const db = fakeDb([[{ nombre: CANDADO_INGESTA_CIMA }]]);
    assert.equal(await liberarCandadoIngesta(db, { titular: "crm:cima-pull:A" }), true);
    const q = db.llamadas[0].sql.replace(/\s+/g, " ");
    assert.match(q, /delete from ingesta_candado where nombre = \$1 and titular = \$2/i);
    assert.deepEqual(db.llamadas[0].params, [CANDADO_INGESTA_CIMA, "crm:cima-pull:A"]);
  });

  it("si la fila ya no es suya (caducó y otro la reclamó) devuelve false", async () => {
    assert.equal(await liberarCandadoIngesta(fakeDb([[]]), { titular: "A" }), false);
  });
});

describe("motivoSinCandado", () => {
  it("clasifica por código de Postgres, directo o en `cause`", () => {
    assert.equal(motivoSinCandado(errPg("42P01")), "tabla_ausente");
    assert.equal(motivoSinCandado(errPg("42P01", true)), "tabla_ausente");
    assert.equal(motivoSinCandado(errPg("42501", true)), "sin_permiso");
    assert.equal(motivoSinCandado(new Error("x")), "error");
    assert.equal(motivoSinCandado(null), "error");
  });
});

describe("nuevoTitularCandado", () => {
  it("es único por invocación y dice qué escritor es", () => {
    const a = nuevoTitularCandado("crm:cima-pull");
    const b = nuevoTitularCandado("crm:cima-pull");
    assert.notEqual(a, b);
    assert.match(a, /^crm:cima-pull:[0-9a-f-]{36}$/);
  });
});

describe("ejecutarConCandadoIngesta", () => {
  it("adquirido → corre el trabajo y libera en finally", async () => {
    const db = fakeDb([ECO_TITULAR, [{ nombre: CANDADO_INGESTA_CIMA }]]);
    let tirea = 0;
    const r = await ejecutarConCandadoIngesta(
      { dbc: db, escritor: "crm:cima-pull", log: silencio, alOcupado: async () => "409", alErrorCandado: async () => "503", registrarSinCandado: async () => {} },
      async () => {
        tirea++;
        return "200";
      },
    );
    assert.equal(r, "200");
    assert.equal(tirea, 1);
    assert.equal(db.llamadas.length, 2);
    assert.match(db.llamadas[1].sql, /delete from ingesta_candado/i);
    // Libera con el MISMO titular con el que adquirió.
    assert.equal(db.llamadas[1].params[1], db.llamadas[0].params[1]);
  });

  it("segundo escritor concurrente: ocupado → NO llama a TIREA y devuelve alOcupado", async () => {
    const db = fakeDb([[], [{ titular: "otro", expira_en: new Date() }]]);
    let tirea = 0;
    let ocupadoCon: unknown = null;
    const r = await ejecutarConCandadoIngesta(
      {
        dbc: db,
        escritor: "crm:cima-pull",
        log: silencio,
        alOcupado: async (info) => {
          ocupadoCon = info;
          return "409";
        },
        alErrorCandado: async () => "503",
        registrarSinCandado: async () => {},
      },
      async () => {
        tirea++;
        return "200";
      },
    );
    assert.equal(r, "409");
    assert.equal(tirea, 0, "con el candado ocupado no se toca TIREA");
    assert.equal((ocupadoCon as { titularActual: string }).titularActual, "otro");
    // Ni libera (no es suyo) ni hace nada más.
    assert.equal(db.llamadas.filter((l) => /delete/i.test(l.sql)).length, 0);
  });

  it("libera aunque el trabajo lance, y propaga el error", async () => {
    const db = fakeDb([ECO_TITULAR, [{ nombre: CANDADO_INGESTA_CIMA }]]);
    await assert.rejects(
      ejecutarConCandadoIngesta(
        { dbc: db, escritor: "crm:cima-pull", log: silencio, alOcupado: async () => "409", alErrorCandado: async () => "503", registrarSinCandado: async () => {} },
        async () => {
          throw new Error("adapter caído");
        },
      ),
      /adapter caído/,
    );
    assert.match(db.llamadas[1]?.sql ?? "", /delete from ingesta_candado/i);
  });

  it("un fallo al liberar no tapa el resultado del trabajo (caduca solo)", async () => {
    const db = fakeDb([ECO_TITULAR, new Error("conexión perdida")]);
    const eventos: string[] = [];
    const r = await ejecutarConCandadoIngesta(
      { dbc: db, escritor: "crm:cima-pull", log: (e) => eventos.push(e), alOcupado: async () => "409", alErrorCandado: async () => "503", registrarSinCandado: async () => {} },
      async () => "200",
    );
    assert.equal(r, "200");
    assert.ok(eventos.includes("candado_liberar_fallo"));
  });

  it("FAIL-SAFE: tabla ausente → corre el trabajo SIN candado, avisa en log y no intenta liberar", async () => {
    const db = fakeDb([errPg("42P01", true)]);
    const eventos: Array<{ e: string; x: Record<string, unknown> }> = [];
    const avisos: unknown[] = [];
    const registrados: unknown[] = [];
    const warnOriginal = console.warn;
    console.warn = (...a: unknown[]) => avisos.push(a);
    let tirea = 0;
    try {
      const r = await ejecutarConCandadoIngesta(
        {
          dbc: db,
          escritor: "crm:cima-pull",
          log: (e, x = {}) => eventos.push({ e, x }),
          alOcupado: async () => "409",
          alErrorCandado: async () => "503",
          registrarSinCandado: async (info) => {
            registrados.push(info);
          },
        },
        async () => {
          tirea++;
          return "200";
        },
      );
      assert.equal(r, "200");
    } finally {
      console.warn = warnOriginal;
    }
    assert.equal(tirea, 1, "sin tabla la ingesta corre como antes");
    assert.equal(db.llamadas.length, 1, "no intenta liberar un candado que no tiene");
    assert.deepEqual(eventos.find((v) => v.e === "candado_no_disponible")?.x, {
      motivo: "tabla_ausente",
      escritor: "crm:cima-pull",
    });
    assert.equal(avisos.length, 1, "el aviso sale también por console.warn");
    assert.deepEqual(
      registrados,
      [{ motivo: "tabla_ausente", escritor: "crm:cima-pull" }],
      "sin candado se registra en operational_events (no puede pasar desapercibido)",
    );
  });

  it("FAIL-SAFE: sin GRANT (42501) también corre sin candado", async () => {
    let tirea = 0;
    const r = await ejecutarConCandadoIngesta(
      {
        dbc: fakeDb([errPg("42501")]),
        escritor: "crm:cima-pull",
        log: silencio,
        alOcupado: async () => "409",
        alErrorCandado: async () => "503",
        registrarSinCandado: async () => {},
      },
      async () => {
        tirea++;
        return "200";
      },
    );
    assert.equal(r, "200");
    assert.equal(tirea, 1);
  });

  it("si falla REGISTRAR el «sin candado», la ingesta sigue igual", async () => {
    const warnOriginal = console.warn;
    console.warn = () => {};
    try {
      const r = await ejecutarConCandadoIngesta(
        {
          dbc: fakeDb([errPg("42P01")]),
          escritor: "crm:cima-pull",
          log: silencio,
          alOcupado: async () => "409",
          alErrorCandado: async () => "503",
          registrarSinCandado: async () => {
            throw new Error("bd");
          },
        },
        async () => "200",
      );
      assert.equal(r, "200");
    } finally {
      console.warn = warnOriginal;
    }
  });

  it("error de BD al adquirir (conexión, timeout, pooler) → NO toca TIREA, devuelve alErrorCandado", async () => {
    for (const err of [new Error("ECONNRESET"), errPg("57014", true), errPg("08006")]) {
      let tirea = 0;
      const eventos: string[] = [];
      const r = await ejecutarConCandadoIngesta(
        {
          dbc: fakeDb([err]),
          escritor: "crm:cima-pull",
          log: (e) => eventos.push(e),
          alOcupado: async () => "409",
          alErrorCandado: async () => "503",
          registrarSinCandado: async () => {},
        },
        async () => {
          tirea++;
          return "200";
        },
      );
      assert.equal(r, "503");
      assert.equal(tirea, 0, "sin saber si hay otro escritor no se toca TIREA");
      assert.ok(eventos.includes("candado_error"));
    }
  });
});

// PORT central (fase 3): el bloque «contrato con las rutas» (maxDuration ≥ 2× la
// caducidad, 503/409 y orden candado → runCimaPull) lee las RUTAS del CRM
// (`crons/cima-pull`, `internal/cima/{reprocesar-cuarentena,ingerir-manual}`). En
// central aún no hay rutas (nada importa el paquete): se porta con ellas.
// La SEMÁNTICA del SQL contra Postgres real (`src/db/__tests__/ingesta-candado.policy.test.ts`
// del CRM, `npm run test:rls` con BD en CI, sin pglite) tampoco es viable aquí.
