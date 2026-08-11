// apps/plataforma/lib/categorias-personales.ts
// FUENTE ÚNICA de las subcategorías de gasto/ingreso PERSONAL. Antes había 3 listas divergentes
// (categoria-ia.ts, auto-tag/route.ts, CategoriasTab.tsx) y la auto-clasificación no podía asignar
// 'seguro' ni 'suministros_piso' y emitía 'otros' donde el resto usa 'otros_gasto'. Módulo PURO
// (sin BD ni React) para que lo consuman el cliente, las rutas API y los categorizadores IA.

export const SUBCATEGORIAS_GASTO = [
  'supermercado', 'restaurante_bar', 'gasolina', 'farmacia', 'ropa', 'colegio',
  'deporte', 'suscripcion', 'hogar', 'suministros_piso', 'reforma', 'seguro',
  'transporte', 'ocio', 'hipoteca', 'comunidad', 'ibi', 'impuestos', 'club', 'bizum', 'otros_gasto',
] as const

// Categorías que componen el gasto de la VIVIENDA personal (Montecarmelo). Se agrupan bajo un
// encabezado "🏠 Vivienda" en la pestaña Categorías (total + desglose). Los pisos turísticos NO
// entran aquí: son negocio (destino='turistico_*'), no gasto personal.
export const GRUPO_VIVIENDA: readonly SubcategoriaGasto[] = [
  'hipoteca', 'comunidad', 'ibi', 'suministros_piso',
]

export const SUBCATEGORIAS_INGRESO = [
  'alquiler_booking', 'alquiler_airbnb', 'alquiler_transferencia',
  'comision_seguro', 'nomina', 'transferencia_familiar', 'otros_ingreso',
] as const

export type SubcategoriaGasto = typeof SUBCATEGORIAS_GASTO[number]
export type SubcategoriaIngreso = typeof SUBCATEGORIAS_INGRESO[number]
export type Subcategoria = SubcategoriaGasto | SubcategoriaIngreso

export const TODAS_SUBCATEGORIAS: readonly string[] = [...SUBCATEGORIAS_GASTO, ...SUBCATEGORIAS_INGRESO]

const INGRESO_SET = new Set<string>(SUBCATEGORIAS_INGRESO)

export function esIngreso(sub: string): boolean {
  return INGRESO_SET.has(sub)
}

export function esSubcategoriaValida(sub: string): boolean {
  return TODAS_SUBCATEGORIAS.includes(sub)
}

// Categoría "cajón de sastre" según el signo, para cuando la IA devuelve algo fuera de lista.
export function subcategoriaFallback(esGasto: boolean): Subcategoria {
  return esGasto ? 'otros_gasto' : 'otros_ingreso'
}

export const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽', farmacia: '💊',
  ropa: '👕', colegio: '🎒', deporte: '🏊', suscripcion: '📱', hogar: '🏠',
  suministros_piso: '💡', reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
  hipoteca: '🏦', comunidad: '🏘️', ibi: '🏛️', impuestos: '🧾', club: '🎩', bizum: '💸', otros_gasto: '•',
  alquiler_booking: '🏖️', alquiler_airbnb: '🏡', alquiler_transferencia: '🏠',
  comision_seguro: '🛡️', nomina: '👤', transferencia_familiar: '👨‍👩‍👧', otros_ingreso: '💶',
}

// Descripciones para el prompt de auto-clasificación (una línea por categoría de gasto).
export const DESCRIPCION_GASTO: Record<SubcategoriaGasto, string> = {
  supermercado: 'compras de alimentación (Mercadona, Carrefour, Lidl, Aldi, etc.)',
  restaurante_bar: 'bares, restaurantes, cafeterías, comida rápida, delivery',
  gasolina: 'estaciones de servicio, combustible, peajes',
  farmacia: 'farmacias, parafarmacia, ópticas',
  ropa: 'ropa, calzado, complementos (Zara, H&M, etc.)',
  colegio: 'colegios, academias, material escolar, actividades extraescolares',
  deporte: 'gimnasios, deporte, piscinas, golf, equipamiento deportivo',
  suscripcion: 'Netflix, Spotify, Amazon Prime, software, apps, hosting',
  hogar: 'ferretería, muebles, electrodomésticos, decoración',
  suministros_piso: 'luz, agua, gas, internet y telefonía de una vivienda',
  reforma: 'obras, fontanería, electricidad, reformas, pinturas',
  seguro: 'seguros personales (hogar, coche, vida, salud)',
  transporte: 'taxi, Uber, Cabify, parking, transporte público, tren, avión',
  ocio: 'cine, teatro, espectáculos, juegos, viajes personales',
  hipoteca: 'cuota de la hipoteca de la vivienda (préstamo, CUOTA PTMO)',
  comunidad: 'cuota de la comunidad de propietarios / administrador de fincas de la vivienda',
  ibi: 'IBI y tributos municipales de la vivienda (contribución urbana, tasa de basura)',
  impuestos: 'IRPF, Hacienda, Agencia Tributaria, declaración de la renta y tributos estatales',
  club: 'cuotas e inscripción de club social (Círculo Mercantil)',
  bizum: 'envíos de Bizum a otras personas (todos agrupados aquí, sea cual sea el motivo o destinatario)',
  otros_gasto: 'cualquier gasto personal que no encaje en las anteriores',
}

export function labelCat(sub: string): string {
  const l = (sub || '').replace(/_/g, ' ')
  return l.charAt(0).toUpperCase() + l.slice(1)
}
