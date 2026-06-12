// ============================================================
// Motor de verticales — tipo de negocio → preset de módulos + etiquetas (LABELS)
// ============================================================
// Pieza base de la plataforma de verticales (ver
// docs/superpowers/specs/2026-06-07-plataforma-verticales-design.md).
//
// Principio: el NÚcLEO usa identificadores canónicos NEUTROS; la jerga de cada
// vertical vive SOLO aquí, en la capa de etiquetas (LABELS). Cambiar el tipo de
// negocio de un local aplica su preset de módulos y su terminología, sin tocar
// la lógica del núcleo.
//
// Este módulo es PURO (sin efectos, sin red): seguro de importar desde cliente
// o servidor. Aún NO está cableado al runtime; define el estado canónico objetivo.

export type TipoNegocio =
  | 'restaurante'
  | 'catering'
  | 'salon'
  | 'retail'
  | 'citas'
  | 'mixto'

export const TIPOS_NEGOCIO: TipoNegocio[] = [
  'restaurante', 'catering', 'salon', 'retail', 'citas', 'mixto',
]

export const TIPO_NEGOCIO_DEFAULT: TipoNegocio = 'restaurante'

// ------------------------------------------------------------
// Módulos
// ------------------------------------------------------------
// Núcleo de PLATAFORMA: lo que comparten TODOS los verticales (venta, cobro,
// fiscal, impresión, turnos). Es vertical-agnóstico. Nota de nomenclatura: el
// id 'comandas' es el módulo de VENTA (canónico 'ventas'); se mantiene el id
// histórico hasta cablear la vista `ventas` (ver spec §4, §8).
export const NUCLEO_PLATAFORMA: string[] = [
  'comandas',   // = venta (canónico 'ventas')
  'cobro',
  'impresion',
  'verifactu',
  'turnos',
]

// Preset de módulos OPCIONALES sugeridos por vertical. Al aplicar se fusiona con
// NUCLEO_PLATAFORMA. Solo ids de módulos reales (ver TODOS_MODULOS en
// src/app/api/owner/modulos/route.ts); los marcados (*) se registran al construir
// su fase: 'tienda' (Fase C), 'eventos' (Fase E, hoy gestionado aparte).
export const PRESETS_NEGOCIO: Record<TipoNegocio, string[]> = {
  // Familia A — transaccional con sala
  restaurante: [
    'voz', 'mesas', 'kds', 'supervisor', 'reservas',
    'carta_ia', 'carta_vinos', 'qr', 'storefront',
    'almacen', 'fichajes', 'rrhh', 'contabilidad', 'analytics', 'escaner',
  ],
  // Familia A — transaccional sin sala (escaneo + caja)
  retail: [
    'tienda', // *
    'almacen', 'escaner', 'storefront',
    'fichajes', 'rrhh', 'contabilidad', 'analytics',
  ],
  // Familia B — proyecto/servicio
  catering: [
    'eventos', // *
    'almacen', 'fichajes', 'rrhh', 'contabilidad', 'analytics',
  ],
  salon: [
    'eventos', // *
    'reservas', 'almacen', 'fichajes', 'rrhh', 'contabilidad', 'analytics',
  ],
  // Familia B — servicio agendado por cita (clínica/terapeuta, peluquería, fisio,
  // asesoría…). La captura es el HUECO de agenda (reservas generalizado a recurso/
  // profesional), no la mesa. Reutiliza cobro/factura/CRM/portal/recordatorios del
  // núcleo + motor de eventos como "proyecto/servicio". El bot de calendario entra
  // como un canal más que crea filas en `reservas` (igual que el canal TheFork).
  citas: [
    'reservas',
    'storefront', // reserva/booking online de cara al cliente
    'fichajes', 'rrhh', 'contabilidad', 'analytics',
  ],
  // Combinación de verticales en un mismo local
  mixto: [
    'voz', 'mesas', 'kds', 'tienda', 'eventos', // *
    'qr', 'storefront', 'reservas',
    'almacen', 'escaner', 'fichajes', 'rrhh', 'contabilidad', 'analytics',
  ],
}

/** Módulos resultantes para un tipo de negocio = núcleo ∪ preset (sin duplicados). */
export function modulosParaNegocio(tipo: TipoNegocio): string[] {
  const preset = PRESETS_NEGOCIO[tipo] ?? PRESETS_NEGOCIO[TIPO_NEGOCIO_DEFAULT]
  return [...new Set([...NUCLEO_PLATAFORMA, ...preset])]
}

// ------------------------------------------------------------
// Etiquetas (LABELS) — la jerga que ve el usuario, por vertical
// ------------------------------------------------------------
// Clave = término canónico neutro del núcleo. Valor = cómo se llama en ese
// vertical. La UI NUNCA hardcodea "comanda"/"mesa"; pide la etiqueta aquí.
export interface VerticalLabels {
  local: string          // restaurante | tienda | obrador …
  venta: string          // comanda | ticket | pedido
  ventas: string         // plural
  linea: string          // línea de venta / ítem
  personal: string       // camarero | dependiente | técnico
  punto: string          // mesa | caja | mostrador
  catalogo: string       // carta | catálogo
  cliente: string        // comensal | cliente
}

const LABELS_BASE: VerticalLabels = {
  local: 'Local',
  venta: 'Venta',
  ventas: 'Ventas',
  linea: 'Línea',
  personal: 'Personal',
  punto: 'Punto',
  catalogo: 'Catálogo',
  cliente: 'Cliente',
}

export const LABELS: Record<TipoNegocio, VerticalLabels> = {
  restaurante: {
    local: 'Restaurante', venta: 'Comanda', ventas: 'Comandas', linea: 'Ítem',
    personal: 'Camarero', punto: 'Mesa', catalogo: 'Carta', cliente: 'Comensal',
  },
  retail: {
    local: 'Tienda', venta: 'Ticket', ventas: 'Tickets', linea: 'Artículo',
    personal: 'Dependiente', punto: 'Caja', catalogo: 'Catálogo', cliente: 'Cliente',
  },
  catering: {
    local: 'Catering', venta: 'Servicio', ventas: 'Servicios', linea: 'Concepto',
    personal: 'Coordinador', punto: 'Espacio', catalogo: 'Oferta', cliente: 'Cliente',
  },
  salon: {
    local: 'Salón', venta: 'Evento', ventas: 'Eventos', linea: 'Concepto',
    personal: 'Coordinador', punto: 'Espacio', catalogo: 'Oferta', cliente: 'Cliente',
  },
  citas: {
    local: 'Centro', venta: 'Cita', ventas: 'Citas', linea: 'Servicio',
    personal: 'Profesional', punto: 'Agenda', catalogo: 'Servicios', cliente: 'Cliente',
  },
  mixto: { ...LABELS_BASE, local: 'Negocio' },
}

/** Devuelve las etiquetas del vertical (fallback a restaurante). */
export function getLabels(tipo: TipoNegocio | null | undefined): VerticalLabels {
  if (!tipo) return LABELS[TIPO_NEGOCIO_DEFAULT]
  return LABELS[tipo] ?? LABELS[TIPO_NEGOCIO_DEFAULT]
}

/** Etiqueta de un término canónico para un vertical. Ej: label('restaurante','venta') → 'Comanda'. */
export function label(tipo: TipoNegocio | null | undefined, termino: keyof VerticalLabels): string {
  return getLabels(tipo)[termino]
}
