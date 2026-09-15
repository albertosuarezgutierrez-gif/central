/**
 * Las reglas PURAS del emisor genérico de la intranet: a dónde entra el cliente,
 * cómo se llama cada aviso ya enviado, y cuáles de los suyos son nuevos.
 *
 * 🚨 Están en su propio fichero para que su cepo pueda EJECUTARLAS. Aquí no se
 * importa nada de Prisma: `avisos-intranet.ts` sí, y por eso `node --test` no
 * puede cargarlo — un guardián que solo pudiera leer el fuente comprobaría que
 * el código está escrito, no que hace lo que dice.
 */
import {
  avisosDe,
  type AutorizacionParaAviso,
  type ObligacionParaAviso,
  type ReparoParaAviso,
  type Aviso,
} from '@central/module-seguros-portal'

/**
 * A dónde entra el cliente. `null` = no hay portal utilizable y entonces **no se
 * manda nada**: un correo que dice «entra aquí» sin el «aquí» no sirve de nada.
 *
 * Misma env y mismas guardas que `enlaceDeAutorizaciones()` de
 * `correo-aviso-acceso.ts` (solo https, y el defecto es el dominio de la casa);
 * lo que cambia es el destino: la RAÍZ del portal, porque este correo puede
 * llevar avisos de sitios distintos y la campana está en la cabecera.
 */
export function enlacePortal(
  base: string | undefined = process.env.ASEGURA_PORTAL_URL ?? 'https://clientes.grupoasegura.es',
): string | null {
  const limpio = base?.trim()
  if (!limpio) return null
  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    console.error('[asegura/avisos-intranet] ASEGURA_PORTAL_URL no es una URL válida: no se avisa')
    return null
  }
  if (url.protocol !== 'https:') {
    console.error('[asegura/avisos-intranet] ASEGURA_PORTAL_URL no es https: no se avisa')
    return null
  }
  url.pathname = '/'
  return url.toString()
}

/** `${tipo}:${id}` — la misma clave que la campana usa de `key`. Nunca el título. */
export function claveAviso(a: Pick<Aviso, 'tipo' | 'id'>): string {
  return `${a.tipo}:${a.id}`
}

/** Lo que se ha reunido de un cliente, antes de decidir si se le escribe. */
export type Pendiente = {
  clienteId: string
  nombre: string | null
  autorizaciones: { otorgadas: AutorizacionParaAviso[]; recibidas: AutorizacionParaAviso[] }
  obligaciones: ObligacionParaAviso[]
  peticiones: { id: string; estado: string; solicitanteNombre: string | null }[]
  datos: ReparoParaAviso[]
}

/**
 * Los avisos de un cliente que TODAVÍA no se le han mandado.
 *
 * `null` = alguna fuente suya no se pudo leer; a ese cliente no se le escribe en
 * esta pasada. Con `avisosDe` eso no puede pasar hoy (las listas llegan ya
 * resueltas), pero la rama existe para que el día que una fuente degrade a
 * `null` el correo no afirme un total incompleto.
 */
export function avisosNuevos(p: Pendiente, hoy: Date, yaEnviadas: ReadonlySet<string>): Aviso[] | null {
  const { avisos, fuentesIlegibles } = avisosDe({
    autorizaciones: p.autorizaciones,
    obligaciones: p.obligaciones,
    peticiones: p.peticiones,
    datos: p.datos,
    hoy,
  })
  if (fuentesIlegibles.length > 0) return null
  return avisos.filter((a) => !yaEnviadas.has(claveAviso(a)))
}
