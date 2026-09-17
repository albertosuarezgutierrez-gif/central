// Clave PUBLICABLE de Supabase — la que sustituye a la `anon` legacy.
//
// Contexto: el botón «Disable JWT-based API keys» del panel mata a la vez la `service_role`
// filtrada y la `anon` legacy. Para poder pulsarlo, todo lo que hoy manda la `anon` tiene que
// poder mandar la nueva `sb_publishable_…`. Plan: docs/ROTACION-SERVICE-ROLE.md
//
// Regla: PREFIERE la nueva y CAE a la legacy. Mientras las dos envs convivan en Vercel el
// cambio es reversible; el día que se pulse el botón, la legacy deja de autenticar y solo
// queda la primera rama.
//
// 🚨 Por qué los nombres se escriben ENTEROS y a mano: Next sustituye `process.env.NEXT_PUBLIC_X`
// por su valor literal EN BUILD. `process.env[nombre]`, desestructurar `process.env` o
// construir el nombre en runtime dan `undefined` en el navegador — y entonces esto caería
// SIEMPRE a la legacy sin que fallara nada, que es justo el fallo silencioso que la migración
// tiene que evitar.

export type OrigenClavePublicable = 'nueva' | 'legacy'

/**
 * La clave publicable, o `''` si no hay ninguna configurada.
 * Devuelve cadena vacía (no lanza) a propósito: hay módulos que la leen en el top level y
 * un throw ahí rompería el build. Una clave vacía falla la llamada con un 401 visible.
 */
export function clavePublicable(): string {
  return noVacia(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    || noVacia(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    || ''
}

/** De dónde salió la clave: `'nueva'`, `'legacy'`, o null si no hay ninguna. */
export function origenClavePublicable(): OrigenClavePublicable | null {
  if (noVacia(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return 'nueva'
  if (noVacia(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) return 'legacy'
  return null
}

/**
 * Una variable puesta a `" "` (o a la cadena vacía) es una variable SIN poner: se trata como
 * ausente en vez de como una clave que falla todas las llamadas. Mismo criterio que el helper
 * de las Edge Functions, para que las dos familias no se comporten distinto.
 */
function noVacia(valor: string | undefined): string {
  return (valor ?? '').trim()
}

/** ¿Hay alguna clave publicable configurada? Para health-checks y avisos de entorno. */
export function hayClavePublicable(): boolean {
  return clavePublicable() !== ''
}

/**
 * Cabeceras de autenticación para llamar A MANO a la API HTTP de Supabase
 * (`/storage/v1`, `/rest/v1`, `/functions/v1`). Manda la clave en `apikey` **y** en
 * `Authorization: Bearer`, que es lo que hace `supabase-js` por su cuenta.
 *
 * 🚨 **`apikey` NO es opcional, y esto está MEDIDO (11/09/2026).** Los tres subsistemas no se
 * comportan igual con las claves nuevas (`sb_publishable_…` / `sb_secret_…`, que no son JWT):
 *
 *   | Cabeceras                  | /storage/v1        | /functions/v1 | /rest/v1 |
 *   |----------------------------|--------------------|---------------|----------|
 *   | solo `Authorization Bearer`| ❌ 403 `Invalid Compact JWS` | ✅ pasa | ✅ pasa |
 *   | solo `apikey`              | ✅ pasa            | ✅ pasa       | ✅ pasa  |
 *   | las dos                    | ✅ pasa            | ✅ pasa       | ✅ pasa  |
 *
 * O sea: **Storage rechaza la clave nueva si solo va en `Authorization`** — la trata como un JWT
 * mal formado, exactamente igual que una cadena inventada. Con la `anon` legacy (que SÍ es un JWT)
 * el `Bearer` a secas funcionaba, así que un sitio que solo mande `Authorization` se ve sano hoy y
 * se cae entero el día de la rotación: subir fotos, firmar URLs, borrar objetos.
 *
 * Mandar las dos funciona con las claves viejas y con las nuevas, en los tres sitios. Por eso esta
 * función manda las dos siempre y no hay que decidir caso por caso.
 */
export function cabecerasClave(clave: string = clavePublicable()): Record<string, string> {
  return { apikey: clave, Authorization: `Bearer ${clave}` }
}
