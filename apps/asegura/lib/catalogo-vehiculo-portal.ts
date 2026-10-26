/**
 * El buscador del catálogo de vehículos del ENLACE de datos (26/10/2026, fase 2). PURO: qué consulta del catálogo se
 * permite desde el portal público y con qué parámetros. Lista CERRADA: marca → modelo → combustible → versión, de coche
 * o de moto. Nada más (ni la fecha por matrícula ni `GET /vehicles?registrationPlate=`, que cuesta créditos).
 * Son los mismos GET gratis que la pantalla de precio (`resolverCatalogo`, con el interruptor de tarificación apagado).
 */
// Letras (con tilde), cifras y lo que trae un combustible del catálogo («Gasolina/Híbrido»); nada de «?», «&» ni «..».
const RE_ID = /^(?!.*\.\.)[\p{L}\p{N}._ /()+-]{1,40}$/u

export const PASOS_CATALOGO_PORTAL = ['marcas', 'modelos', 'motores', 'versiones'] as const
export type PasoCatalogoPortal = (typeof PASOS_CATALOGO_PORTAL)[number]

/**
 * Los parámetros que manda el portal → los de `resolverCatalogo`, o `null` si no es una consulta permitida.
 * Moto: los combustibles son un enum cerrado (`MOTORES_MOTO`), no un catálogo: se devuelven sin consultar (`fijos`).
 */
export function consultaCatalogoPortal(
  p: URLSearchParams,
  motoresMoto: readonly string[],
): { params: URLSearchParams } | { fijos: { id: string; nombre: string }[] } | null {
  const ramo = p.get('ramo')
  const paso = p.get('paso')
  if ((ramo !== 'auto' && ramo !== 'moto') || !(PASOS_CATALOGO_PORTAL as readonly string[]).includes(paso ?? '')) return null
  const moto = ramo === 'moto'
  const id = (k: string): string | null => { const v = (p.get(k) ?? '').trim(); return RE_ID.test(v) ? v : null }
  switch (paso as PasoCatalogoPortal) {
    case 'marcas':
      return { params: new URLSearchParams({ tipo: moto ? 'marcas-moto' : 'marcas' }) }
    case 'modelos': {
      const marcaId = id('marcaId')
      return marcaId ? { params: new URLSearchParams({ tipo: moto ? 'modelos-moto' : 'modelos', marcaId }) } : null
    }
    case 'motores':
      return moto ? { fijos: motoresMoto.map((m) => ({ id: m, nombre: NOMBRE_MOTOR_MOTO[m] ?? m })) } : { params: new URLSearchParams({ tipo: 'motores' }) }
    case 'versiones': {
      const marcaId = id('marcaId'), modeloId = id('modeloId'), motor = id('motor')
      if (!marcaId || !modeloId || !motor) return null
      if (moto && !motoresMoto.includes(motor)) return null
      return { params: new URLSearchParams({ tipo: moto ? 'versiones-moto' : 'versiones', marcaId, modeloId, motor }) }
    }
  }
}

const NOMBRE_MOTOR_MOTO: Record<string, string> = { Gasoline: 'Gasolina', Diesel: 'Diésel', Others: 'Otro (eléctrica, híbrida…)' }

const plano = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/**
 * ¿La marca y el modelo en TEXTO que mandó el cliente son los de los ids del catálogo que eligió? (revisión del PR #5080).
 * El buscador rellena el texto con el nombre del catálogo; si luego lo cambió a mano, los ids ya no son de su coche.
 * Marca: igual (sin tildes, mayúsculas ni signos). Modelo: igual o empezando por el del catálogo («Ibiza 1.0 TSI» con
 * «Ibiza»): el campo es «Modelo y versión». Sin texto, o un id que no está en la lista → `false`.
 */
export function textosCasanConCatalogo(
  texto: { marca: unknown; modelo: unknown },
  elegido: { marcaId: string; modeloId: string },
  listas: { marcas: readonly { id: string; nombre: string }[]; modelos: readonly { id: string; nombre: string }[] },
): boolean {
  if (typeof texto.marca !== 'string' || typeof texto.modelo !== 'string') return false
  const marca = listas.marcas.find((o) => o.id === elegido.marcaId)?.nombre
  const modelo = listas.modelos.find((o) => o.id === elegido.modeloId)?.nombre
  if (!marca || !modelo) return false
  const tm = plano(texto.modelo), cm = plano(modelo)
  return plano(texto.marca) === plano(marca) && cm !== '' && (tm === cm || tm.startsWith(`${cm} `))
}
