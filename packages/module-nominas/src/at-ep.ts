// Tabla de tipos de cotización AT/EP por código CNAE.
// Fuente: Tarifa de primas (art. 19 LGSS) — Real Decreto vigente.
// Actualizar anualmente. Si el CNAE no está en la tabla, usar resolverYGuardarAtEp() con IA.

const TABLA_AT_EP: Record<string, number> = {
  // Hostelería
  '5510': 0.0240, // hoteles
  '5520': 0.0240, // alojamientos turísticos y de corta estancia
  '5530': 0.0240, // cámpings y aparcamientos de caravanas
  '5590': 0.0240, // otros alojamientos
  '5610': 0.0255, // restaurantes y puestos de comidas
  '5621': 0.0255, // provisión de comidas preparadas para eventos
  '5629': 0.0255, // otros servicios de comidas
  '5630': 0.0255, // establecimientos de bebidas
  // Limpieza
  '8121': 0.0350, // limpieza general de edificios
  '8122': 0.0350, // otras actividades de limpieza industrial y de edificios
  '8129': 0.0350, // otras actividades de limpieza
  '8130': 0.0450, // actividades de jardinería
  // Comercio
  '4711': 0.0150, // comercio al por menor en establecimientos no especializados
  '4719': 0.0150, // otro comercio al por menor
  '4721': 0.0150, // comercio al por menor de frutas y hortalizas
  '4724': 0.0150, // comercio al por menor de pan, pastelería, confitería
  // Administración / Oficinas
  '6820': 0.0075, // alquiler de bienes inmobiliarios por cuenta propia
  '6831': 0.0075, // agentes de la propiedad inmobiliaria
  '6832': 0.0075, // gestión y administración de la propiedad inmobiliaria
  '6910': 0.0075, // actividades jurídicas
  '6920': 0.0075, // actividades de contabilidad, teneduría de libros
  '7010': 0.0075, // actividades de las sedes centrales
  '7022': 0.0075, // otras actividades de consultoría de gestión empresarial
  // Construcción
  '4110': 0.0570, // promoción inmobiliaria
  '4120': 0.0570, // construcción de edificios residenciales
  '4321': 0.0570, // instalaciones eléctricas
  '4322': 0.0570, // fontanería, instalaciones de sistemas de calefacción
  '4399': 0.0570, // otras actividades de construcción especializada
  // Transporte
  '4931': 0.0310, // transporte terrestre urbano y suburbano de pasajeros
  '4932': 0.0310, // transporte por taxi
  '4941': 0.0310, // transporte de mercancías por carretera
  '5223': 0.0310, // actividades anexas al transporte aéreo
}

/** Tipo AT/EP para un CNAE. Devuelve undefined si no está en la tabla. */
export function atEpPorCnae(cnae: string): number | undefined {
  // Buscar exacto primero, luego por los 3 primeros dígitos
  return TABLA_AT_EP[cnae] ?? TABLA_AT_EP[cnae.slice(0, 3)]
}
