// Host canónico del Portal del Empleado. En producción solo se usa desde este dominio;
// el resto de hosts (central-rrhh.vercel.app) redirigen. /api, estáticos y PWA quedan exentos
// (crons de Vercel, webhooks y la pasarela de plataforma llaman por el dominio de vercel).
export const HOST_CANONICO = 'empleados.grupoasegura.es'

const EXENTO = /^\/(api(\/|$)|_next\/|manifest[^/]*\.json$|sw\.js$|robots\.txt$|favicon\.ico$)|\.[a-z0-9]+$/i

export function destinoCanonico(
  entorno: string | undefined,
  host: string | null | undefined,
  pathname: string,
  search = ''
): string | null {
  if (entorno !== 'production') return null
  const h = (host ?? '').toLowerCase().split(':')[0]
  if (!h || h === HOST_CANONICO) return null
  if (EXENTO.test(pathname)) return null
  return `https://${HOST_CANONICO}${pathname}${search}`
}
