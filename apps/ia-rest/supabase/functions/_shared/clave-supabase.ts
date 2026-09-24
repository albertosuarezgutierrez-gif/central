// Claves de Supabase para Edge Functions — fuente ÚNICA del monorepo.
//
// Contexto: la `service_role` legacy (JWT) del proyecto compartido estuvo pública ~3 meses
// (06/05→12/08/2026) y hay que poder desactivarla. El botón «Disable JWT-based API keys»
// mata a la vez la `service_role` y la `anon` legacy, así que TODO consumidor tiene que
// hablar antes con las claves nuevas: `sb_secret_…` / `sb_publishable_…`.
// Plan completo e inventario: docs/ROTACION-SERVICE-ROLE.md
//
// Regla de este módulo: PREFIERE la clave nueva y CAE a la legacy si la nueva no está.
// Mientras las dos convivan el cambio es reversible; el día que se pulse el botón, la
// legacy desaparece y la primera rama es la única que queda en pie.
//
// 🚨 Las claves nuevas NO son JWT, y **cada subsistema de Supabase las trata distinto**
// (medido el 11/09/2026 contra el proyecto real, ver docs/ROTACION-SERVICE-ROLE.md):
//
//   | Cabeceras                   | /storage/v1                  | /functions/v1 | /rest/v1 |
//   |-----------------------------|------------------------------|---------------|----------|
//   | solo `Authorization: Bearer`| ❌ 403 `Invalid Compact JWS` | ✅ pasa       | ✅ pasa  |
//   | solo `apikey`               | ✅ pasa                      | ✅ pasa       | ✅ pasa  |
//   | las dos                     | ✅ pasa                      | ✅ pasa       | ✅ pasa  |
//
// Con la clave legacy (que SÍ es un JWT) el `Bearer` a secas valía en todos: por eso un sitio que
// solo mande `Authorization` se ve sano hoy y se cae el día de la rotación. `apikey` es la única
// cabecera que funciona en los tres, así que se manda SIEMPRE.
//
// Para invocar OTRA Edge Function se usa `cabecerasServicio()`, no una plantilla `Bearer ${clave}`
// escrita a mano.
//
// Variables que inyecta la plataforma en el entorno de Edge Functions:
//   - `SUPABASE_SECRET_KEYS`      → JSON `{"default":"sb_secret_…"}`   (sustituye a SERVICE_ROLE)
//   - `SUPABASE_PUBLISHABLE_KEYS` → JSON `{"default":"sb_publishable_…"}` (sustituye a ANON)
//   - `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` → las legacy, marcadas DEPRECATED.

export type OrigenClave = "nueva" | "legacy";

export interface ClaveResuelta {
  clave: string;
  origen: OrigenClave;
}

/** Lee `{"default": "…"}` de una variable JSON. Devuelve null si falta o es ilegible. */
function deJsonPorDefecto(bruto: string | undefined | null): string | null {
  if (!bruto) return null;
  let porNombre: unknown;
  try {
    porNombre = JSON.parse(bruto);
  } catch {
    // JSON ilegible: se cae a la legacy en vez de tumbar la función.
    return null;
  }
  if (!porNombre || typeof porNombre !== "object") return null;
  const valor = (porNombre as Record<string, unknown>)["default"];
  return noVacia(typeof valor === "string" ? valor : null);
}

function noVacia(valor: string | undefined | null): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

function resolver(envNueva: string, envLegacy: string): ClaveResuelta | null {
  const nueva = deJsonPorDefecto(Deno.env.get(envNueva));
  if (nueva) return { clave: nueva, origen: "nueva" };
  const legacy = noVacia(Deno.env.get(envLegacy));
  if (legacy) return { clave: legacy, origen: "legacy" };
  return null;
}

/** Clave de servicio (salta RLS) con su procedencia, o null si no hay ninguna. */
export function resolverClaveSecreta(): ClaveResuelta | null {
  return resolver("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
}

/** Clave de servicio. Lanza si no hay ninguna: mejor fallar fuerte que hablar sin credencial. */
export function claveSecreta(): string {
  const r = resolverClaveSecreta();
  if (!r) {
    throw new Error(
      "Sin clave de servicio: ni SUPABASE_SECRET_KEYS['default'] ni SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return r.clave;
}

/**
 * De dónde salió la clave de servicio: `"nueva"`, `"legacy"` o null si no hay.
 * Se expone para poder MEDIR la migración desde fuera (un 200 no dice qué clave se usó).
 * No devuelve la clave: es seguro pintarlo en una respuesta.
 */
export function origenClaveSecreta(): OrigenClave | null {
  return resolverClaveSecreta()?.origen ?? null;
}

/** Clave publicable (la que sustituye a la `anon`) con su procedencia. */
export function resolverClavePublicable(): ClaveResuelta | null {
  return resolver("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
}

/** Clave publicable. Lanza si no hay ninguna. */
export function clavePublicable(): string {
  const r = resolverClavePublicable();
  if (!r) {
    throw new Error(
      "Sin clave publicable: ni SUPABASE_PUBLISHABLE_KEYS['default'] ni SUPABASE_ANON_KEY",
    );
  }
  return r.clave;
}

/**
 * Cabeceras para invocar OTRA Edge Function con la clave de servicio.
 *
 * Con la clave NUEVA va **solo en `apikey`**. El gateway de funciones también la acepta en
 * `Authorization: Bearer` (medido con la publishable), pero ese mismo `Bearer` es justo lo que
 * Storage RECHAZA, y con la clave secreta no se ha podido medir desde fuera —no se puede leer su
 * valor, solo usarla dentro de una función—. `apikey` es la cabecera que funciona en los tres
 * subsistemas, así que es la que se manda: es la opción que no depende de lo no medido.
 *
 * Con la legacy se mantiene el `Bearer` de siempre (por si alguna función destino lo leyera) y se
 * añade `apikey`, que es inocuo.
 */
export function cabecerasServicio(): Record<string, string> {
  const r = resolverClaveSecreta();
  if (!r) {
    throw new Error(
      "Sin clave de servicio para invocar otra función: ni SUPABASE_SECRET_KEYS['default'] ni SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return r.origen === "nueva"
    ? { apikey: r.clave }
    : { Authorization: `Bearer ${r.clave}`, apikey: r.clave };
}
