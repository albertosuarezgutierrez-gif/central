/**
 * Normalización PURA de la URL del pooler de la cartera (ASEGURA_DATABASE_URL).
 *
 * El pooler de transacciones de Supabase (puerto 6543) rompe los prepared
 * statements de Prisma salvo que la URL lleve `pgbouncer=true` — y ese sufijo
 * se pierde con facilidad al pegar la cadena a mano en Vercel (31/08/2026: la
 * cartera en vivo moría en «no puede leer su BD» con la BD sana). En vez de
 * depender del pegado, el cliente lo añade aquí. Solo toca URLs al :6543 y no
 * pisa parámetros ya presentes; cualquier URL que no se pueda parsear se
 * devuelve tal cual (que falle Prisma con su error real, no nosotros antes).
 */
export function normalizarUrlPooler(url: string): string {
  try {
    const u = new URL(url)
    if (u.port !== '6543') return url
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true')
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1')
    return u.toString()
  } catch {
    return url
  }
}

/**
 * De DÓNDE se lee la cartera — LÓGICA PURA, sin acceso a env ni a red.
 *
 * Desde el 02/09/2026 la cartera vive en el schema `seguros` de la BD compartida de
 * central (52 tablas, copia verificada), así que por defecto se lee DE CASA con la
 * misma conexión que ya usa la auth de esta app (`DATABASE_URL`, rol `prisma_seguros`)
 * más `?schema=seguros` **forzado** (pisa el que traiga la cadena): Prisma cualifica
 * cada tabla con ese schema, con lo que no depende del `search_path` del rol, del
 * pooler, ni de con qué sufijo se pegó `DATABASE_URL` en Vercel.
 *
 * `ASEGURA_FUENTE=origen` es la vía de vuelta al Supabase de Manuel
 * (`ASEGURA_DATABASE_URL`, solo lectura) mientras se cierra el traspaso. Sin esa
 * variable, `origen` no se usa aunque la URL siga configurada.
 *
 * Devuelve `url: null` cuando la fuente elegida no tiene conexión: es «pendiente de
 * configurar», y la UI lo dice — nunca se cae a la otra fuente en silencio, porque
 * leer sin querer la cartera vieja se parece demasiado a leer la buena.
 */
export type FuenteCartera = 'central' | 'origen'

export function urlFuenteCartera(env: {
  ASEGURA_FUENTE?: string
  DATABASE_URL?: string
  ASEGURA_DATABASE_URL?: string
}): { fuente: FuenteCartera; url: string | null } {
  const fuente: FuenteCartera =
    env.ASEGURA_FUENTE?.trim().toLowerCase() === 'origen' ? 'origen' : 'central'
  if (fuente === 'origen') {
    const u = env.ASEGURA_DATABASE_URL?.trim()
    return { fuente, url: u ? normalizarUrlPooler(u) : null }
  }
  const base = env.DATABASE_URL?.trim()
  if (!base) return { fuente, url: null }
  return { fuente, url: normalizarUrlPooler(forzarSchema(base, 'seguros')) }
}

/**
 * Fija `schema=<schema>` en la URL **PISANDO el que ya traiga**. Una URL imposible
 * de parsear se devuelve tal cual.
 *
 * 🚨 Aquí no se respeta lo que venga puesto, y es a propósito: `DATABASE_URL` es la
 * MISMA cadena que usa la auth de esta app (`lib/db.ts`), donde el schema correcto
 * es `public`. Si esa cadena llega de Vercel con `?schema=public` —lo normal—, un
 * «no lo pises si ya está» apuntaría el cliente de la CARTERA a `public`, y ahí no
 * existe `corredurias` (falla toda la cartera) mientras que `clientes` SÍ existe y
 * es OTRA tabla: leerías los clientes de central creyendo que son los de la
 * correduría. El schema de la cartera no es negociable.
 */
function forzarSchema(url: string, schema: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('schema', schema)
    return u.toString()
  } catch {
    return url
  }
}
