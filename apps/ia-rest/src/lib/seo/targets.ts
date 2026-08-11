// apps/ia-rest/src/lib/seo/targets.ts
import { getOverride, getBlocks, getArticulosPublicados } from './store'

/** Rutas editables por el agente. '/*' = prefijo. NUNCA incluir áreas privadas/legales/checkout.
 *
 *  Hasta el 01/08/2026 esto era solo `['/restaurantes', '/restaurantes/*']`, es decir: el agente
 *  tenía permiso de escritura sobre la ÚNICA página sin potencial de tráfico del sitio (2 restaurantes
 *  en BD, 1 web activa) y ninguno sobre la home ni las landings de sector. Por eso nunca aplicó un
 *  cambio. Ahora alcanza la superficie comercial real. */
export const RUTAS_SEO_EDITABLES = [
  '/',
  '/comanda-por-voz',
  '/hosteleria',
  '/catering',
  '/tapas-bar',
  '/grupo-multilocal',
  '/eventos',
  '/espacios',
  '/restaurante-indio',
  '/restaurante-mediterraneo',
  '/restaurantes',
  '/restaurantes/*',
]

/** Defaults de SEO por ruta estática (los que viven hoy en el código). Sirve para que
 *  el agente vea el "estado actual" y para que list_seo_targets sea informativo.
 *
 *  🚨 NINGÚN default lleva precio: ia.rest no publica tarifa (decisión de Alberto, 01/08/2026).
 *  La conversión es formulario de contacto + WhatsApp. */
export const SEO_DEFAULTS: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Software de Gestión para Restaurantes, Catering y Espacios de Eventos — ia.rest',
    description: 'ia.rest gestiona restaurantes, catering y espacios de eventos. Comandas por voz, KDS, APPCC, VeriFactu y portal cliente. Sin comisión por transacción. Pide presupuesto sin compromiso.',
  },
  '/comanda-por-voz': {
    title: 'Comanda por voz en restaurantes: cómo funciona — ia.rest',
    description: 'El camarero habla y la cocina ya tiene el ticket. Comanda por voz en menos de 0,5 segundos, con el móvil que ya tienes. Sin terminales propietarios.',
  },
  '/hosteleria': {
    title: 'TPV para hostelería: bar, restaurante, chiringuito y food truck — ia.rest',
    description: 'ia.rest gestiona cualquier negocio de hostelería: bar, restaurante, chiringuito, feria y food truck. Comandas por voz, KDS, VeriFactu y almacén. Sin comisión por transacción.',
  },
  '/catering': {
    title: 'Software de catering: presupuesto, portal cliente y control de costes — ia.rest',
    description: 'Presupuesto, portal cliente, APPCC, control de costes y VeriFactu. El ciclo completo de tu catering, automatizado. Sin comisión por transacción.',
  },
  '/tapas-bar': {
    title: 'TPV para bares de tapas y tabernas — ia.rest',
    description: 'El ritmo de un bar sin el caos: comandas rápidas, control de lo que sale y lo que entra, y analytics de qué tapa arrasa. Sin comisión por venta.',
  },
  '/grupo-multilocal': {
    title: 'Gestión de varios locales de hostelería desde una cuenta — ia.rest',
    description: 'Multi-local nativo: todos tus locales desde un único acceso, cada uno con su carta, mesas, personal y facturación. Sin comisión por venta.',
  },
  '/eventos': {
    title: 'Gestión de eventos y bodas para hostelería — ia.rest',
    description: 'Solicitudes, calendario, presupuestos, contratos digitales y VeriFactu para tu negocio de eventos. Sin comisión por evento.',
  },
  '/espacios': {
    title: 'Software para espacios de eventos y fincas de bodas — ia.rest',
    description: 'ia.rest gestiona automáticamente las solicitudes de bodas.net. Respuestas automáticas, calendario, contratos digitales y VeriFactu. Pide presupuesto sin compromiso.',
  },
  '/restaurante-indio': {
    title: 'TPV para restaurante indio — ia.rest',
    description: 'Carta compleja, alérgenos y niveles de picante bajo control. Comandas por voz, KDS y VeriFactu para restaurante indio. Sin comisión por venta.',
  },
  '/restaurante-mediterraneo': {
    title: 'TPV para restaurante mediterráneo — ia.rest',
    description: 'Producto de temporada, escandallos y sala coordinada. Comandas por voz, KDS y VeriFactu para restaurante mediterráneo. Sin comisión por venta.',
  },
  '/restaurantes': {
    title: 'Directorio de Restaurantes — ia.rest',
    description: 'Descubre restaurantes con carta digital, reserva directa y sin comisiones. Encuentra tu mesa en los mejores restaurantes de España.',
  },
}

/** Devuelve el SEO efectivo (default + override) y los bloques de una ruta. */
export async function resolverSeoActual(ruta: string) {
  const [override, blocks] = await Promise.all([getOverride(ruta), getBlocks(ruta)])
  const def = SEO_DEFAULTS[ruta]
  return {
    ruta,
    title: override?.title ?? def?.title ?? null,
    description: override?.description ?? def?.description ?? null,
    jsonld: override?.jsonld ?? null,
    bloques: blocks.map((b) => ({ posicion: b.posicion, titulo: b.titulo })),
  }
}

/** Inventario para la tool list_seo_targets. */
export async function listarTargets() {
  const rutasBase = Object.keys(SEO_DEFAULTS)
  const seo = await Promise.all(rutasBase.map(resolverSeoActual))
  const articulos = await getArticulosPublicados()
  return {
    rutas_editables: RUTAS_SEO_EDITABLES,
    paginas: seo,
    articulos_existentes: articulos.map((a) => a.slug),
  }
}
