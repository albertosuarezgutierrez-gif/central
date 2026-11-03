/**
 * PORT central (fase 3) — conexión Drizzle de la capa de BD de la ingesta CIMA.
 *
 * En el CRM esto era `src/db/index.ts`: leía `process.env.DATABASE_URL` AL
 * IMPORTAR y abría el pool. Aquí NO: nada se conecta ni lee env al importar. La
 * conexión la crea quien la necesite (`crearDbCima`) con la URL que le pasen, y
 * todo lo de `src/db/` recibe el `db` por parámetro.
 *
 * Rol previsto: `prisma_seguros` (BYPASSRLS, `search_path=seguros` a nivel de rol;
 * el schema Drizzle usa nombres SIN schema, igual que el CRM con `crm_seguros`).
 * Pool pequeño (R9 de la spec): `max: 2`, `prepare: false` (pooler 6543 en modo
 * transacción).
 *
 * 🚨 PII: `field-encryption` (y el índice ciego) de `@central/module-seguros-pii`
 * son fail-OPEN fuera de production: sin `PII_ENCRYPTION_KEY` GUARDAN EN CLARO, y
 * sin `PII_LOOKUP_KEY` el hash del DNI sale `null` → `resolveCliente` no encuentra
 * a nadie → ficha de cliente DUPLICADA en cada pull. En central la capa de
 * persistencia es fail-CLOSED: `exigirClavesPii` lanza si falta cualquiera de las
 * dos, salvo `NODE_ENV === "test"`. Lo llaman `crearDbCima` y `buildCimaPullDeps`.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { exigirEscritorCentral } from "./escritor.ts";
import * as schema from "./schema.ts";

/** El `db` de Drizzle que espera toda la capa de BD (mismo tipo que el `db` del CRM). */
export type CimaDb = PostgresJsDatabase<typeof schema>;

/** Variables que la persistencia exige (solo NOMBRES: nunca se leen ni se loguean valores). */
export const CLAVES_PII_OBLIGATORIAS = ["PII_ENCRYPTION_KEY", "PII_LOOKUP_KEY"] as const;

export class ClavePiiAusenteError extends Error {
  constructor(nombre: string) {
    super(`cima_pii_clave_ausente:${nombre}`);
    this.name = "ClavePiiAusenteError";
  }
}

/**
 * Fail-CLOSED: lanza si falta `PII_ENCRYPTION_KEY` o `PII_LOOKUP_KEY`. Solo comprueba
 * PRESENCIA (el formato lo valida `module-seguros-pii` al usarla).
 *
 * Mira el `env` inyectado (si se pasa) Y `process.env`, porque el cifrado de
 * `module-seguros-pii` lee `process.env`: un env inyectado con claves no salva un
 * `process.env` sin ellas (guardaría EN CLARO). La exención `NODE_ENV === "test"` solo
 * vale si TODAS las fuentes miradas la dicen.
 */
export function exigirClavesPii(env?: Readonly<Record<string, string | undefined>>): void {
  const fuentes: ReadonlyArray<Readonly<Record<string, string | undefined>>> =
    env && env !== process.env ? [env, process.env] : [process.env];
  if (fuentes.every((f) => f.NODE_ENV === "test")) return;
  for (const f of fuentes) {
    for (const nombre of CLAVES_PII_OBLIGATORIAS) {
      if (!f[nombre]?.trim()) throw new ClavePiiAusenteError(nombre);
    }
  }
}

/** Gate de TODA función de escritura exportada: `CIMA_ESCRITOR=central` + claves PII.
 * `env` por defecto `process.env`; `buildCimaPullDeps` pasa el suyo (mismo gate que ya
 * aplicó: el doble chequeo no cambia la semántica). */
export function exigirGateEscritura(
  env: Readonly<Record<string, string | undefined>>,
  operacion: string,
): void {
  exigirEscritorCentral(env, operacion);
  exigirClavesPii(env);
}

export interface CrearDbCimaOpts {
  /** URL de Postgres del rol de la ingesta. La pasa el caller: aquí no se lee env. */
  url: string;
  /** Entorno para el gate PII (normalmente `process.env`). */
  env: Readonly<Record<string, string | undefined>>;
  /** Tamaño del pool (R9). Default 2. */
  max?: number;
}

/** Abre el pool dedicado de la ingesta. Lanza si faltan las claves PII (ver arriba). */
export function crearDbCima(opts: CrearDbCimaOpts): CimaDb {
  exigirClavesPii(opts.env);
  if (!opts.url) throw new Error("cima_db_url_ausente");
  const client = postgres(opts.url, { prepare: false, max: opts.max ?? 2 });
  return drizzle(client, { schema });
}
