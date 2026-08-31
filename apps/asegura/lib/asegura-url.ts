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
