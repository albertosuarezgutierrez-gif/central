// apps/plataforma/lib/contable/intencion.ts
// Router de intención PURO: detecta preguntas frecuentes y estructuradas ("gasto total junio",
// "cuánto llevo en luz", "facturas pendientes", "pisos vs correduría") para responderlas DIRECTO
// por SQL, sin pasar por el LLM. Beneficio: funciona aunque la IA esté saturada, es instantáneo,
// gratis y NO inventa cifras (los números salen de la BD). Sin BD ni alias '@/' → testeable con
// node --test (mismo patrón que parse.ts / formato.ts). Conservador: ante la duda devuelve null
// (→ el cerebro cae al LLM). NUNCA secuestra una ORDEN de acción (clasifica/amortiza/concilia…).

export type Signo = 'gasto' | 'ingreso'

export type Intencion =
  | { tipo: 'movimientos_mes'; signo: Signo; anio: number; mes: number }
  | { tipo: 'movimientos_anio'; signo: Signo; anio: number }
  | { tipo: 'concepto'; signo: Signo; terminos: string[]; etiqueta: string; anio: number; mes?: number }
  | { tipo: 'subcategoria'; signo: Signo; subcategoria: string; etiqueta: string; anio: number; mes?: number }
  | { tipo: 'gasto_destino'; signo: Signo; destinos: string[]; etiqueta: string; anio: number; mes?: number }
  | { tipo: 'por_destino'; anio: number }
  | { tipo: 'facturas_pendientes' }
  | { tipo: 'tramo_fiscal'; anio: number }

export type Hoy = { anio: number; mes: number }

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

// Subcategorías de CONSUMO personal (super, bares, gasolina…): las preguntas "¿cuánto en super?"
// se responden por la columna `subcategoria` (el eje que segmenta el gasto personal — misma fuente
// que la pestaña Categorías), no por un ILIKE frágil. `subcategoria` = valor canónico de
// lib/categorias-personales; `terminos` = cómo lo escribe Alberto (se casan como palabra completa).
const SUBCAT_SINONIMOS: { subcategoria: string; etiqueta: string; terminos: string[] }[] = [
  { subcategoria: 'supermercado', etiqueta: 'supermercado', terminos: ['supermercado', 'supermercados', 'super', 'compra del super', 'mercadona', 'carrefour', 'lidl', 'aldi', 'eroski', 'consum', 'alcampo'] },
  { subcategoria: 'restaurante_bar', etiqueta: 'restaurantes y bares', terminos: ['bar', 'bares', 'restaurante', 'restaurantes', 'cafeteria', 'cafeterias', 'cerveceria', 'cervecerias', 'tapas', 'comer fuera'] },
  { subcategoria: 'gasolina', etiqueta: 'gasolina', terminos: ['gasolina', 'gasolinera', 'gasolineras', 'combustible', 'carburante', 'gasoil', 'diesel'] },
  { subcategoria: 'farmacia', etiqueta: 'farmacia', terminos: ['farmacia', 'farmacias'] },
  { subcategoria: 'ropa', etiqueta: 'ropa', terminos: ['ropa', 'zapatos', 'calzado', 'zapateria'] },
  { subcategoria: 'colegio', etiqueta: 'colegio', terminos: ['colegio', 'cole', 'academia', 'guarderia', 'extraescolar', 'extraescolares'] },
  { subcategoria: 'deporte', etiqueta: 'deporte', terminos: ['deporte', 'deportes', 'gimnasio', 'gimnasios', 'padel'] },
  { subcategoria: 'suscripcion', etiqueta: 'suscripciones', terminos: ['suscripcion', 'suscripciones', 'netflix', 'spotify', 'hbo'] },
  { subcategoria: 'hogar', etiqueta: 'hogar', terminos: ['hogar', 'muebles', 'ikea', 'ferreteria'] },
  { subcategoria: 'transporte', etiqueta: 'transporte', terminos: ['transporte', 'taxi', 'taxis', 'uber', 'cabify', 'parking'] },
  { subcategoria: 'ocio', etiqueta: 'ocio', terminos: ['ocio', 'cine', 'teatro'] },
  { subcategoria: 'hipoteca', etiqueta: 'hipoteca', terminos: ['hipoteca', 'prestamo', 'montecarmelo', 'monte carmelo'] },
  { subcategoria: 'club', etiqueta: 'club (Círculo Mercantil)', terminos: ['club', 'circulo mercantil', 'circulo', 'socio'] },
]

// Segmentos de NEGOCIO por `destino` (eje distinto de subcategoría y de concepto): "gastos de la
// correduría", "ingresos de los pisos". Se responden sumando por la columna `destino`. Distinto de
// `por_destino`, que es el DESGLOSE comparado de TODOS los destinos; esto es UN segmento concreto.
// La correduría = destino 'seguros' (siempre BBVA). NOTA: el módulo NO quita acentos → se incluyen
// las variantes con y sin tilde (correduria/correduría, turistico/turístico). Los términos deben
// ser inequívocos del negocio (no 'piso' suelto, que puede ser la vivienda personal).
const DESTINO_SINONIMOS: { etiqueta: string; destinos: string[]; terminos: string[] }[] = [
  { etiqueta: 'la correduría', destinos: ['seguros'], terminos: ['correduria', 'correduría', 'corredurias', 'corredurías'] },
  // El Dúplex/Villasís es un negocio CONCRETO (`destino='turistico_duplex'`), NO el conjunto de pisos.
  // Va ANTES de "los pisos turísticos" (más específico) para que "ingresos del dúplex" NO caiga en el
  // acumulado anual total: sin esta fila, 'duplex' no casaba ningún segmento y la pregunta se resolvía
  // como "ingresos de 2026" a secas (todos los movimientos), dando una cifra imposible para un solo piso.
  { etiqueta: 'el Dúplex', destinos: ['turistico_duplex'], terminos: ['duplex', 'dúplex', 'villasís', 'villasis'] },
  { etiqueta: 'los pisos turísticos', destinos: ['turistico_pisos', 'turistico_duplex'], terminos: ['pisos', 'apartamentos', 'turistico', 'turisticos', 'turístico', 'turísticos'] },
]

// Sinónimos por concepto de gasto: "luz" casa también con las comercializadoras reales, etc.
const SINONIMOS: { etiqueta: string; terminos: string[] }[] = [
  { etiqueta: 'luz', terminos: ['luz', 'endesa', 'iberdrola', 'naturgy', 'edp', 'electric'] },
  { etiqueta: 'agua', terminos: ['agua', 'emasesa', 'aqualia', 'canal isabel'] },
  { etiqueta: 'internet/teléfono', terminos: ['internet', 'fibra', 'telefono', 'teléfono', 'digi', 'movistar', 'vodafone', 'orange', 'jazztel'] },
  { etiqueta: 'seguros', terminos: ['seguro', 'mapfre', 'generali', 'occident', 'liberty', 'allianz', 'axa'] },
  { etiqueta: 'limpieza', terminos: ['limpieza', 'limpiez'] },
  { etiqueta: 'comunidad', terminos: ['comunidad'] },
]

// Palabras que tras "en/de/con…" NO son un proveedor sino tiempo, agregado o destino: evitan que
// el extractor de concepto genérico secuestre "en total", "de este año", "en pisos"… (esos deben
// caer al acumulado anual / por_destino / LLM, no a un ILIKE de concepto).
const STOP_CONCEPTO = new Set<string>([
  ...Object.keys(MESES),
  'mes', 'meses', 'año', 'años', 'ano', 'anos', 'anio', 'ejercicio', 'trimestre', 'semestre', 'semana', 'día', 'dia',
  // Demostrativos/deícticos: "de este año", "de esta tarjeta"… NO son un proveedor. Sin esto,
  // "gastos de este año" secuestraba el extractor genérico como concepto ILIKE '%este%' (cifra basura).
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso', 'aquel', 'aquella',
  'total', 'todo', 'todos', 'todas', 'conjunto', 'suma', 'general', 'global', 'más', 'mas', 'menos', 'medio', 'media',
  'pisos', 'piso', 'duplex', 'dúplex', 'villasís', 'villasis', 'sevillana', 'busto',
  'seguros', 'seguro', 'correduria', 'correduría', 'personal', 'personales', 'negocio', 'negocios',
  'destino', 'destinos', 'categoria', 'categoría', 'categorias', 'categorías', 'casa',
  'el', 'la', 'los', 'las', 'gasto', 'gastos', 'ingreso', 'ingresos', 'movimiento', 'movimientos',
  'banco', 'cuenta', 'cuentas', 'tarjeta', 'efectivo', 'resumen', 'balance', 'concepto',
])

function anioDe(t: string, hoy: Hoy): number {
  const m = t.match(/\b(20\d{2})\b/)
  if (m) return Number(m[1])
  if (/a[ñn]o pasado|a[ñn]o anterior/.test(t)) return hoy.anio - 1
  return hoy.anio
}

function mesRelativoPasado(hoy: Hoy): { anio: number; mes: number } {
  return hoy.mes === 1 ? { anio: hoy.anio - 1, mes: 12 } : { anio: hoy.anio, mes: hoy.mes - 1 }
}

// Mes al que se refiere la pregunta (explícito "junio", relativo "mes pasado"/"este mes"), o null si
// no menciona mes (→ la consulta es anual). Se extrae UNA vez para poder COMPONERLO con la categoría:
// "en supermercado en junio" = subcategoría supermercado ∩ junio (antes el mes ganaba y tiraba la
// categoría, devolviendo el gasto TOTAL del mes).
function detectarMes(t: string, hoy: Hoy): { anio: number; mes: number } | null {
  const mesKey = Object.keys(MESES).find(m => new RegExp(`\\b${m}\\b`).test(t))
  if (mesKey) return { anio: anioDe(t, hoy), mes: MESES[mesKey] }
  if (/mes pasado|mes anterior/.test(t)) return mesRelativoPasado(hoy)
  if (/este mes|del mes|en el mes|mes actual/.test(t)) return { anio: hoy.anio, mes: hoy.mes }
  return null
}

// Casa un término como palabra completa (evita que 'bar' pique en 'barato'/'Barcelona').
function tienePalabra(t: string, term: string): boolean {
  return new RegExp(`(^|[^a-záéíóúñ])${term}([^a-záéíóúñ]|$)`).test(t)
}

// Primer "objeto de preposición" (en/de/con/para/por + X) que NO sea una stop-word (tiempo, agregado
// o destino). Recorre TODOS —no solo el primero— para que una stop-word inicial no tape el proveedor
// real: "de ESTE año en amazon" o "en JUNIO en amazon" deben llegar a "amazon", no quedarse en el
// stop. Devuelve el fragmento (p. ej. 'amazon', 'netflix') o null si ninguno es un concepto.
function primerConceptoNoStop(t: string): string | null {
  const re = /\b(?:en|de|con|para|por)\s+(?:el|la|los|las|un|una|mi|mis|tu|tus)?\s*([a-záéíóúñ][a-z0-9áéíóúñ.&+_-]{1,})/g
  for (const m of t.matchAll(re)) {
    if (!STOP_CONCEPTO.has(m[1])) return m[1]
  }
  return null
}

export function detectarIntencion(textoRaw: string, hoy: Hoy): Intencion | null {
  const t = (textoRaw || '').toLowerCase().trim()
  if (!t) return null

  // Facturas de proveedor pendientes (no depende de "cuánto").
  if (/factur/.test(t) && /(pendient|falta|sin pagar|por pagar|sin conciliar|me faltan)/.test(t)) {
    return { tipo: 'facturas_pendientes' }
  }

  // Posición fiscal IRPF ("¿en qué tramo estamos?", "mi tipo marginal", "base imponible"). No
  // depende de "cuánto"; por eso va ANTES de la guarda de dinero. No secuestra órdenes de acción.
  if (/(tramo|irpf|marginal|base imponible|tipo (medio|efectivo))/.test(t)
      && !/(clasific|amortiz|concilia|reclasi|marca|c[aá]mbia|ponlo|ponme|apunta|registra)/.test(t)) {
    return { tipo: 'tramo_fiscal', anio: anioDe(t, hoy) }
  }

  // A partir de aquí solo consultas de dinero.
  if (!/(cu[aá]nto|gast|llevo|ingres|balance|resumen|total)/.test(t)) return null
  // NUNCA secuestrar una orden de acción (aunque mencione un proveedor).
  if (/(clasific|amortiz|concilia|reclasi|marca|c[aá]mbia|ponlo|ponme|apunta|registra)/.test(t)) return null

  const signo: Signo = /ingres|cobr/.test(t) ? 'ingreso' : 'gasto'

  // Desglose por destino / comparativa entre negocios.
  if (/(por destino|por negocio|pisos vs|vs corredur|corredur[ií]a vs|desglose|por categor[ií]a|cada destino|c[oó]mo van)/.test(t)) {
    return { tipo: 'por_destino', anio: anioDe(t, hoy) }
  }

  // Mes de la pregunta (si lo hay). Se COMPONE con la categoría/concepto de abajo.
  const mesInfo = detectarMes(t, hoy)
  const anio = mesInfo?.anio ?? anioDe(t, hoy)

  // Segmento de NEGOCIO nombrado en solitario ("gastos de la correduría", "ingresos de los pisos"):
  // se suma por `destino`. Va DESPUÉS de por_destino (que capta la comparativa "pisos vs correduría")
  // y ANTES de subcategoría/concepto, porque el nombre del negocio es más específico que un ILIKE.
  const dest = DESTINO_SINONIMOS.find(d => d.terminos.some(term => tienePalabra(t, term)))
  if (dest) return { tipo: 'gasto_destino', signo, destinos: dest.destinos, etiqueta: dest.etiqueta, anio, mes: mesInfo?.mes }

  // Subcategoría de CONSUMO (super, bares, gasolina…) — se responde por la columna `subcategoria`.
  // Va ANTES del mes-solo para que "en supermercado en junio" NO caiga en "gasto total de junio".
  const sc = SUBCAT_SINONIMOS.find(s => s.terminos.some(term => tienePalabra(t, term)))
  if (sc) return { tipo: 'subcategoria', signo, subcategoria: sc.subcategoria, etiqueta: sc.etiqueta, anio, mes: mesInfo?.mes }

  // Por concepto/proveedor conocido (luz, agua, seguros…): sinónimos curados. Con mes opcional.
  const syn = SINONIMOS.find(s => s.terminos.some(term => t.includes(term)))
  if (syn) return { tipo: 'concepto', signo, terminos: syn.terminos, etiqueta: syn.etiqueta, anio, mes: mesInfo?.mes }

  // Concepto/proveedor GENÉRICO no listado ("gastado en claude", "en amazon", "de netflix"…).
  // Se COMPONE con el mes ("en amazon en junio") igual que las categorías, y va ANTES del mes-solo
  // para que el proveedor no se pierda: sin esto, "gasté en amazon en junio" devolvía el TOTAL de
  // junio (mes) tirando "amazon". Los meses/agregados están en STOP_CONCEPTO, así que "en junio" a
  // secas no casa aquí y cae bien al mes-solo de abajo. Sin esto, "¿cuánto llevo gastado en claude?"
  // caía en "llevo" → total del AÑO (cifra enorme, engañosa: parecía la respuesta a "claude").
  const termino = primerConceptoNoStop(t)
  if (termino) return { tipo: 'concepto', signo, terminos: [termino], etiqueta: termino, anio, mes: mesInfo?.mes }

  // Mes SOLO (sin categoría ni proveedor) → gasto total del mes.
  if (mesInfo) return { tipo: 'movimientos_mes', signo, anio: mesInfo.anio, mes: mesInfo.mes }

  // Año (o "cuánto llevo…" sin más → acumulado del año).
  if (/a[ñn]o|anual|\b20\d{2}\b|total|llevo|este a[ñn]o/.test(t)) return { tipo: 'movimientos_anio', signo, anio: anioDe(t, hoy) }

  return null
}

// Etiqueta legible de mes para las respuestas.
export const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
