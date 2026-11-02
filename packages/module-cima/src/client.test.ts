import assert from "node:assert/strict";
import test from "node:test";

import {
  CIMA_ADAPTER_INTERNAL_TOKEN_HEADER,
  CimaAdapterTimeoutError,
  configAdaptadorCimaDesdeEnv,
  crearClienteAdaptadorCima,
  getWseOpPath,
  unwrapCimaWseEnvelope,
  type CimaRequestInit,
  type CimaRequestLogContext,
  type CimaWseOp,
} from "./client.ts";
import { CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH } from "./config.ts";

// PORT central (fase 3): en el CRM las funciones leían `process.env` y el `fetch`
// GLOBAL en cada llamada. Aquí el cliente recibe config y fetch INYECTADOS. Para
// conservar los tests LITERALES, estos tres envoltorios construyen el cliente en
// cada llamada con la config del entorno de la prueba (`withEnv`) y el doble de
// fetch de `withFetchMock` (que ya NO toca `globalThis.fetch`).
let fetchDePrueba: FetchFn | undefined;
const cliente = () =>
  crearClienteAdaptadorCima({
    config: configAdaptadorCimaDesdeEnv(),
    fetch: (fetchDePrueba ?? (() => Promise.reject(new Error("fetch_no_inyectado")))) as FetchFn,
  });
const cimaAdapterRequest = (path: string, init?: CimaRequestInit, logCtx?: CimaRequestLogContext) =>
  cliente().request(path, init, logCtx);
const cimaInvokeWse = (op: CimaWseOp, body: Record<string, unknown>) => cliente().invokeWse(op, body);
const getCimaAdapterHealth = () => cliente().health();

const VALID_TOKEN = "T".repeat(CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH);
const ENV_KEYS = [
  "CIMA_ADAPTER_URL",
  "CIMA_ADAPTER_INTERNAL_TOKEN",
  "CIMA_ADAPTER_TIMEOUT_MS",
] as const;

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const k of ENV_KEYS) snapshot.set(k, process.env[k]);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

type FetchFn = typeof globalThis.fetch;

async function withFetchMock<T>(impl: FetchFn, fn: () => Promise<T>): Promise<T> {
  const prev = fetchDePrueba;
  fetchDePrueba = impl;
  try {
    return await fn();
  } finally {
    fetchDePrueba = prev;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("getWseOpPath mapea las 12 ops a sus paths REST", () => {
  const expected: Array<[CimaWseOp, string]> = [
    ["recibirFicherosPendientes", "/wse/recibir-ficheros-pendientes"],
    ["ficherosDisponibles", "/wse/ficheros-disponibles"],
    ["recibirFichero", "/wse/recibir-fichero"],
    ["confirmarDescarga", "/wse/confirmar-descarga"],
    ["enviarFichero", "/wse/enviar-fichero"],
    ["estadoEnvio", "/wse/estado-envio"],
    ["consultarPlantillaCredencial", "/wse/consultar-plantilla-credencial"],
    ["consultarCredencial", "/wse/consultar-credencial"],
    ["agregarCredencial", "/wse/agregar-credencial"],
    ["modificarCredencial", "/wse/modificar-credencial"],
    ["eliminarCredencial", "/wse/eliminar-credencial"],
    ["validarCredencial", "/wse/validar-credencial"],
  ];
  for (const [op, path] of expected) {
    assert.equal(getWseOpPath(op), path, `op ${op} debería mapear a ${path}`);
  }
  assert.equal(expected.length, 12, "deben existir 12 ops WSE en sync con el adapter");
});

test("cimaAdapterRequest envía X-Internal-Token y construye URL correcta", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      let receivedUrl: string | undefined;
      let receivedHeaders: Headers | undefined;
      let receivedMethod: string | undefined;
      let receivedBody: string | null | undefined;
      await withFetchMock(
        (async (url: string | URL | Request, init?: RequestInit) => {
          receivedUrl = String(url);
          receivedHeaders = new Headers(init?.headers);
          receivedMethod = init?.method;
          receivedBody = init?.body == null ? null : String(init.body);
          return jsonResponse(200, { ok: true });
        }) as FetchFn,
        async () => {
          const res = await cimaAdapterRequest(
            "/wse/recibir-ficheros-pendientes",
            { method: "POST", body: { codigoPlataforma: "TEST", pagina: 1 } },
            { operation: "test_op" },
          );
          assert.equal(res.status, 200);
        },
      );
      assert.equal(
        receivedUrl,
        "https://adapter.example.test/wse/recibir-ficheros-pendientes",
      );
      assert.equal(receivedMethod, "POST");
      assert.equal(
        receivedHeaders?.get(CIMA_ADAPTER_INTERNAL_TOKEN_HEADER),
        VALID_TOKEN,
      );
      assert.equal(receivedHeaders?.get("content-type"), "application/json");
      assert.equal(receivedHeaders?.get("accept"), "application/json");
      assert.equal(
        receivedBody,
        JSON.stringify({ codigoPlataforma: "TEST", pagina: 1 }),
      );
    },
  );
});

test("cimaAdapterRequest GET no envía body ni Content-Type", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      let receivedHeaders: Headers | undefined;
      let receivedBody: string | null | undefined;
      await withFetchMock(
        (async (_url: string | URL | Request, init?: RequestInit) => {
          receivedHeaders = new Headers(init?.headers);
          receivedBody = init?.body == null ? null : String(init.body);
          return jsonResponse(200, { ok: true });
        }) as FetchFn,
        async () => {
          await cimaAdapterRequest("/health");
        },
      );
      assert.equal(receivedBody, null);
      assert.equal(receivedHeaders?.get("content-type"), null);
    },
  );
});

test("cimaAdapterRequest devuelve Response 401 sin throw", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await withFetchMock(
        (async () => jsonResponse(401, { error: "invalid_token" })) as FetchFn,
        async () => {
          const res = await cimaAdapterRequest("/wse/ficheros-disponibles", {
            method: "POST",
            body: {},
          });
          assert.equal(res.status, 401);
          const body = (await res.json()) as { error: string };
          assert.equal(body.error, "invalid_token");
        },
      );
    },
  );
});

test("cimaAdapterRequest lanza CimaAdapterTimeoutError cuando aborta", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
      CIMA_ADAPTER_TIMEOUT_MS: "20",
    },
    async () => {
      await withFetchMock(
        ((_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          })) as FetchFn,
        async () => {
          await assert.rejects(
            cimaAdapterRequest("/wse/ficheros-disponibles", {
              method: "POST",
              body: {},
            }),
            (err: unknown) =>
              err instanceof CimaAdapterTimeoutError &&
              /cima_adapter_timeout/.test(err.message),
          );
        },
      );
    },
  );
});

test("cimaAdapterRequest propaga errores de red genéricos", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await withFetchMock(
        (async () => {
          throw new TypeError("network failure");
        }) as FetchFn,
        async () => {
          await assert.rejects(
            cimaAdapterRequest("/health"),
            /network failure/,
          );
        },
      );
    },
  );
});

test("cimaAdapterRequest lanza si baseUrl falta", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: undefined,
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await assert.rejects(
        cimaAdapterRequest("/health"),
        /cima_adapter_missing_url/,
      );
    },
  );
});

test("cimaInvokeWse usa POST + path correcto + operación tipada", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      let receivedUrl: string | undefined;
      let receivedMethod: string | undefined;
      let receivedBody: string | null | undefined;
      await withFetchMock(
        (async (url: string | URL | Request, init?: RequestInit) => {
          receivedUrl = String(url);
          receivedMethod = init?.method;
          receivedBody = init?.body == null ? null : String(init.body);
          return jsonResponse(200, { ok: true });
        }) as FetchFn,
        async () => {
          await cimaInvokeWse("consultarPlantillaCredencial", {
            codigoPlataforma: "PLAT",
            codigoEntidad: "E1",
          });
        },
      );
      assert.equal(
        receivedUrl,
        "https://adapter.example.test/wse/consultar-plantilla-credencial",
      );
      assert.equal(receivedMethod, "POST");
      assert.equal(
        receivedBody,
        JSON.stringify({ codigoPlataforma: "PLAT", codigoEntidad: "E1" }),
      );
    },
  );
});

test("getCimaAdapterHealth parsea body JSON 200", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await withFetchMock(
        (async () =>
          jsonResponse(200, {
            ok: true,
            service: "asegura-app-cima-adapter",
            version: "0.1.0-scaffold",
          })) as FetchFn,
        async () => {
          const result = await getCimaAdapterHealth();
          assert.equal(result.ok, true);
          assert.equal(result.status, 200);
          assert.deepEqual(result.body, {
            ok: true,
            service: "asegura-app-cima-adapter",
            version: "0.1.0-scaffold",
          });
        },
      );
    },
  );
});

test("getCimaAdapterHealth marca ok=false con status >=400", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await withFetchMock(
        (async () => jsonResponse(503, { error: "unhealthy" })) as FetchFn,
        async () => {
          const result = await getCimaAdapterHealth();
          assert.equal(result.ok, false);
          assert.equal(result.status, 503);
        },
      );
    },
  );
});

// LOO-530 — unwrap del envelope `{ ok, parsed, raw }` del adapter.
test("unwrapCimaWseEnvelope: envelope estándar → devuelve `parsed`", () => {
  const env = {
    ok: true,
    parsed: { codigoRespuesta: "CIMA-200", ficheros: [] },
    raw: { exitCode: 0, durationMs: 1234 },
  };
  assert.deepEqual(unwrapCimaWseEnvelope(env), {
    codigoRespuesta: "CIMA-200",
    ficheros: [],
  });
});

test("unwrapCimaWseEnvelope: sin `parsed` → devuelve el json tal cual (fallback)", () => {
  // Si llega un body con shape inesperado (sin parsed), no lo tocamos —
  // la validación Zod downstream fallará con `code: "schema"`.
  const raw = { codigoRespuesta: "CIMA-401", descripcionRespuesta: "denied" };
  assert.deepEqual(unwrapCimaWseEnvelope(raw), raw);
});

test("unwrapCimaWseEnvelope: null / arrays / primitivos → identidad", () => {
  assert.equal(unwrapCimaWseEnvelope(null), null);
  assert.equal(unwrapCimaWseEnvelope("string"), "string");
  assert.equal(unwrapCimaWseEnvelope(42), 42);
  const arr = [{ parsed: "inside" }];
  assert.equal(unwrapCimaWseEnvelope(arr), arr); // no extrae de arrays
});

test("unwrapCimaWseEnvelope: parsed puede ser null (error path adapter)", () => {
  // El DTO `WseRecibirFicheroResponse.fichero` es `nullable` en error;
  // el adapter podría poner `parsed: null`. El helper debe propagarlo.
  assert.equal(unwrapCimaWseEnvelope({ ok: false, parsed: null, raw: {} }), null);
});

test("getCimaAdapterHealth no rompe con body no-JSON", async () => {
  await withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    async () => {
      await withFetchMock(
        (async () =>
          new Response("not json", {
            status: 200,
            headers: { "content-type": "text/plain" },
          })) as FetchFn,
        async () => {
          const result = await getCimaAdapterHealth();
          assert.equal(result.ok, true);
          assert.equal(result.body, undefined);
        },
      );
    },
  );
});

// ── PORT central (fase 3): inyección y secreto ─────────────────────────────────

test("central: el cliente usa el fetch INYECTADO, nunca el global", async () => {
  const prev = globalThis.fetch;
  let global = 0;
  let inyectado = 0;
  globalThis.fetch = (async () => {
    global++;
    return jsonResponse(200, {});
  }) as FetchFn;
  try {
    const c = crearClienteAdaptadorCima({
      config: { baseUrl: "https://adapter.example.test", internalToken: VALID_TOKEN, timeoutMs: 1000 },
      fetch: (async () => {
        inyectado++;
        return jsonResponse(200, {});
      }) as FetchFn,
    });
    await c.request("/health");
  } finally {
    globalThis.fetch = prev;
  }
  assert.equal(global, 0, "tocó el fetch global");
  assert.equal(inyectado, 1, "no usó el fetch inyectado");
});

test("central: sin CIMA_ADAPTER_INTERNAL_TOKEN la config de entorno LANZA (requireSecret, sin literal)", async () => {
  await withEnv({ CIMA_ADAPTER_URL: "https://adapter.example.test", CIMA_ADAPTER_INTERNAL_TOKEN: undefined }, () => {
    assert.throws(() => configAdaptadorCimaDesdeEnv(), /CIMA_ADAPTER_INTERNAL_TOKEN/);
  });
});
