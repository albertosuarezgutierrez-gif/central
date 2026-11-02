// Generador del golden de ESCRITURAS del CRM (fase 3 central): corre el arnés de central
// (`src/db/equivalencia-persist-arnes.ts`) con el código ORIGINAL del CRM. Solo LEE el CRM.
// Rutas absolutas del contenedor (/home/user/asegura = checkout del CRM, con node_modules):
//   cd /home/user/asegura && npx tsx /home/user/central/packages/module-cima/scripts/generar-golden-escrituras.mts \
//     /home/user/central/packages/module-cima/src/__fixtures__/golden/escrituras-crm-AAAA-MM-DD.json
// El CRM no permite inyectar su `db` en `buildCimaPullDeps`: se sustituye la `session` del
// singleton `@/db` por la del pg-proxy que graba (no se abre conexión: postgres-js es perezoso).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "/home/user/asegura/node_modules/drizzle-orm/pg-proxy/index.js";
import * as schema from "/home/user/asegura/src/db/schema.ts";
import { db as crmDb } from "/home/user/asegura/src/db/index.ts";
import { buildCimaPullDeps } from "/home/user/asegura/src/lib/integrations/cima/pull-deps.ts";
import { runCimaPull } from "/home/user/asegura/src/lib/integrations/cima/ingest-pipeline.ts";
import { parseEiacXml } from "/home/user/asegura/src/lib/integrations/cima/manual-xml.ts";
import { olvidarColumnasOpcionales } from "/home/user/asegura/src/lib/integrations/cima/columna-opcional.ts";
import {
  capturarEscrituras,
  ENV_ARNES,
  respuestaAckOk,
} from "/home/user/central/packages/module-cima/src/db/equivalencia-persist-arnes.ts";
import { CASOS_ESCRITURAS } from "/home/user/central/packages/module-cima/src/db/equivalencia-persist-casos.ts";

const FX = "/home/user/central/packages/module-cima/src/__fixtures__";
Object.assign(process.env, ENV_ARNES);
globalThis.fetch = (async () => respuestaAckOk()) as typeof fetch;

const salida: Record<string, unknown> = {};
for (const c of CASOS_ESCRITURAS) {
  olvidarColumnasOpcionales();
  const r = await capturarEscrituras({
    ...c,
    xml: readFileSync(join(FX, c.nombreFichero), "utf8"),
    parseEiacXml,
    drizzleProxy: (cb) => drizzle(cb, { schema }),
    construirDeps: async (db) => {
      const d = db as { session: unknown; transaction: unknown };
      const crm = crmDb as unknown as Record<string, unknown>;
      crm.session = d.session;
      crm.transaction = d.transaction;
      return buildCimaPullDeps({ log: () => {} });
    },
    runCimaPull: runCimaPull as never,
    ahoraMs: Date.now(),
  });
  salida[c.nombreFichero] = r;
}
writeFileSync(process.argv[2], JSON.stringify(salida) + "\n");
console.log("ok", Object.keys(salida).length);
process.exit(0);
