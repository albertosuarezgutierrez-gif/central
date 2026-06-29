// Clave de ingesta de posiciones (hardware/servidor GPS → API, server-to-server). Gatea ESCRITURA,
// así que NUNCA cae a un literal en producción (patrón guarda env || (prod ? throw : 'dev'), igual que
// el secreto de sesión). El device_id ya identifica el vehículo y su cuenta; esta clave solo evita
// escrituras anónimas. Se acepta por query (?key=, para balizas que solo configuran una URL fija),
// por cabecera `x-ingest-key` o por Bearer.
const SECRET = () =>
  process.env.FLOTA_INGEST_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('FLOTA_INGEST_SECRET no configurado')
      })()
    : 'transporte-ingest-dev')

export function claveDeIngesta(req: Request): string | null {
  const q = new URL(req.url).searchParams.get('key') || new URL(req.url).searchParams.get('token')
  if (q) return q
  const h = req.headers.get('x-ingest-key')
  if (h) return h
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export function ingestaAutorizada(req: Request): boolean {
  const k = claveDeIngesta(req)
  return !!k && k === SECRET()
}
