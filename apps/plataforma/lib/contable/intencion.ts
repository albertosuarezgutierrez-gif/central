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
  | { tipo: 'concepto'; signo: Signo; terminos: string[]; etiqueta: string; anio: number; mes?: number; destinos?: string[]; destinoEtiqueta?: string }
  | { tipo: 'subcategoria'; signo: Signo; subcategoria: string; etiqueta: string; anio: number; mes?: number }
  | { tipo: 'gasto_destino'; signo: Signo; destinos: string[]; etiqueta: string; anio: number; mes?: number }
  // INGRESO de un PISO turístico concreto (Dúplex/Luxury/Socorro/Busto): se lee de la tabla `incomes`
  // (fuente real por reserva; el banco agrega todos los pisos en `turistico_pisos` y no los separa).
  | { tipo: 'ingresos_piso'; propertyId: string; etiqueta: string; anio: number; mes?: number }
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
// Un sinónimo de segmento de negocio. Los APRENDIDOS por la IA (`extras` de detectarIntencion)
// tienen esta misma forma y se anteponen a los curados, para que una palabra que la IA ya resolvió
// una vez pase a ser determinista (instantánea y gratis) la próxima.
// `etiquetaDe` = la forma "de X" para COMPONER con un concepto ("comunidad del Dúplex"). Opcional:
// los sinónimos APRENDIDOS por la IA no la traen y caen a `de ${etiqueta}`.
export type SinonimoDestino = { etiqueta: string; etiquetaDe?: string; destinos: string[]; terminos: string[] }

const DESTINO_SINONIMOS: SinonimoDestino[] = [
  { etiqueta: 'la correduría', etiquetaDe: 'de la correduría', destinos: ['seguros'], terminos: ['correduria', 'correduría', 'corredurias', 'corredurías'] },
  // El Dúplex/Villasís es un negocio CONCRETO (`destino='turistico_duplex'`), NO el conjunto de pisos.
  // Va ANTES de "los pisos turísticos" (más específico) para que "ingresos del dúplex" NO caiga en el
  // acumulado anual total: sin esta fila, 'duplex' no casaba ningún segmento y la pregunta se resolvía
  // como "ingresos de 2026" a secas (todos los movimientos), dando una cifra imposible para un solo piso.
  { etiqueta: 'el Dúplex', etiquetaDe: 'del Dúplex', destinos: ['turistico_duplex'], terminos: ['duplex', 'dúplex', 'villasís', 'villasis'] },
  { etiqueta: 'los pisos turísticos', etiquetaDe: 'de los pisos', destinos: ['turistico_pisos', 'turistico_duplex'], terminos: ['pisos', 'apartamentos', 'turistico', 'turisticos', 'turístico', 'turísticos'] },
]

// Los 4 pisos turísticos propios, para el INGRESO por piso (fuente `incomes.propertyId`, enlace
// `negocios.ref_ext`). Distinto de `destino` del banco: solo el Dúplex tiene `destino='turistico_duplex'`
// (y solo en gastos); los otros 3 van juntos en `turistico_pisos`, así que el banco NO puede separar el
// ingreso por piso — por eso "ingresos del dúplex/luxury/socorro/busto" se leen de `incomes`. Los
// términos son inequívocos y multi-palabra donde hace falta ('busto reform' vs 'luxury busto').
const PISOS_TURISTICOS: { propertyId: string; etiqueta: string; terminos: string[] }[] = [
  { propertyId: 'prop_duplex_center', etiqueta: 'el Dúplex', terminos: ['duplex', 'dúplex', 'villasís', 'villasis'] },
  { propertyId: 'prop_luxury_busto', etiqueta: 'Luxury', terminos: ['luxury'] },
  { propertyId: 'prop_house_sevillana', etiqueta: 'Socorro', terminos: ['socorro', 'sevillana', 'house sevillana', 'casa sevillana'] },
  { propertyId: 'prop_busto_reform', etiqueta: 'Busto Reform', terminos: ['busto reform', 'busto reforma', 'bustos reforma'] },
]
const PROPIEDADES_VALIDAS = new Set(PISOS_TURISTICOS.map(p => p.propertyId))

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

// Palabras "inofensivas" para la detección de ENTIDAD RESIDUAL: verbos/nombres de dinero, tiempo,
// artículos/preposiciones y agregados. NO incluye los nombres de negocio (duplex, busto…): esos, si
// no los mapea ningún sinónimo, son justo la "entidad sin resolver" que queremos derivar a la IA.
const RESIDUO_INOFENSIVO = new Set<string>([
  ...Object.keys(MESES),
  'balance', 'resumen', 'total', 'cuadro', 'saldo', 'dime', 'dame', 'muestra', 'enseña', 'quiero', 'saber',
  'mes', 'meses', 'año', 'años', 'ano', 'anos', 'anio', 'ejercicio', 'trimestre', 'semestre', 'semana',
  'dia', 'día', 'dias', 'días', 'hoy', 'ayer', 'pasado', 'anterior', 'actual', 'proximo', 'próximo', 'que', 'qué',
  'todo', 'todos', 'todas', 'general', 'global', 'mas', 'más', 'menos', 'medio', 'media', 'conjunto', 'suma', 'cada',
  'de', 'del', 'en', 'con', 'para', 'por', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'mis',
  'tu', 'tus', 'su', 'sus', 'y', 'o', 'al', 'me', 'se', 'ha', 'he', 'has', 'lo', 'le', 'nos', 'hay', 'tengo',
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso', 'aquel', 'aquella',
])

// Todos los `terminos` reconocibles por algún matcher (curados + aprendidos): si un token está aquí,
// NO es residual (lo resolverá su matcher). Se recalcula por llamada porque `extras` varía.
function terminosReconocidos(extras: SinonimoDestino[]): Set<string> {
  const s = new Set<string>()
  for (const d of [...extras, ...DESTINO_SINONIMOS]) for (const term of d.terminos) s.add(term)
  for (const sc of SUBCAT_SINONIMOS) for (const term of sc.terminos) s.add(term)
  for (const sy of SINONIMOS) for (const term of sy.terminos) s.add(term)
  return s
}

// Tokens de la pregunta que parecen una ENTIDAD/FILTRO que ningún matcher supo resolver (p.ej.
// "busto", "villasís" antes de estar mapeados). Sirve para (1) NO contestar el total del año a ciegas
// cuando hay un filtro sin resolver, y (2) saber qué palabra APRENDER cuando la IA la resuelva.
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function entidadesResiduales(textoRaw: string, extras: SinonimoDestino[] = []): string[] {
  const t = (textoRaw || '').toLowerCase()
  // Comparamos SIN acentos por ambos lados: 'cuánto' vs stem 'cuant', 'año' vs 'ano', etc.
  const reconocidos = new Set([...terminosReconocidos(extras)].map(sinAcentos))
  const inofensivo = new Set([...RESIDUO_INOFENSIVO].map(sinAcentos))
  const fuera: string[] = []
  for (const raw of t.split(/[^a-záéíóúñ0-9]+/)) {
    if (!raw) continue
    const tok = sinAcentos(raw)
    if (tok.length < 4 || /^\d+$/.test(tok)) continue                        // tokens cortos y números: ruido
    if (/^(gast|ingres|cobr|llev|cuant|factur|movim|balanc|resum|desglos)/.test(tok)) continue // dinero
    if (inofensivo.has(tok) || reconocidos.has(tok)) continue
    fuera.push(raw)                                                          // palabra original (con acentos)
  }
  return fuera
}

export function detectarIntencion(textoRaw: string, hoy: Hoy, extras: SinonimoDestino[] = []): Intencion | null {
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

  // ¿Menciona un NEGOCIO (correduría, dúplex, pisos)? Se detecta UNA vez (aprendidos `extras` primero)
  // y sirve para dos cosas: (a) COMPONER con un concepto/subcategoría ("comunidad del dúplex" =
  // comunidad ∩ turistico_duplex), o (b) si va SOLO → gasto_destino (el total del negocio, más abajo).
  const dest = [...extras, ...DESTINO_SINONIMOS].find(d => d.terminos.some(term => tienePalabra(t, term)))
  const destDe = dest ? (dest.etiquetaDe ?? `de ${dest.etiqueta}`) : undefined

  // Subcategoría de CONSUMO (super, bares, gasolina…) — se responde por la columna `subcategoria`.
  // Va ANTES del mes-solo para que "en supermercado en junio" NO caiga en "gasto total de junio".
  // (El consumo es personal por definición → NO se acota por negocio.)
  const sc = SUBCAT_SINONIMOS.find(s => s.terminos.some(term => tienePalabra(t, term)))
  if (sc) return { tipo: 'subcategoria', signo, subcategoria: sc.subcategoria, etiqueta: sc.etiqueta, anio, mes: mesInfo?.mes }

  // Por concepto/proveedor conocido (luz, agua, comunidad…): sinónimos curados. Con mes y NEGOCIO
  // opcionales: "comunidad del dúplex" acota el concepto por `destino` (antes el negocio ganaba y
  // devolvía su TOTAL, tirando "comunidad"; o el concepto sin negocio mezclaba pisos y personal).
  const syn = SINONIMOS.find(s => s.terminos.some(term => t.includes(term)))
  if (syn) return { tipo: 'concepto', signo, terminos: syn.terminos, etiqueta: syn.etiqueta, anio, mes: mesInfo?.mes, destinos: dest?.destinos, destinoEtiqueta: destDe }

  // Concepto/proveedor GENÉRICO no listado ("gastado en claude", "en amazon", "de netflix"…).
  // Se COMPONE con el mes ("en amazon en junio") igual que las categorías, y va ANTES del mes-solo
  // para que el proveedor no se pierda: sin esto, "gasté en amazon en junio" devolvía el TOTAL de
  // junio (mes) tirando "amazon". Los meses/agregados están en STOP_CONCEPTO, así que "en junio" a
  // secas no casa aquí y cae bien al mes-solo de abajo. Sin esto, "¿cuánto llevo gastado en claude?"
  // caía en "llevo" → total del AÑO (cifra enorme, engañosa: parecía la respuesta a "claude").
  const termino = primerConceptoNoStop(t)
  if (termino) return { tipo: 'concepto', signo, terminos: [termino], etiqueta: termino, anio, mes: mesInfo?.mes, destinos: dest?.destinos, destinoEtiqueta: destDe }

  // INGRESO de un PISO turístico concreto ("ingresos del dúplex/luxury/socorro/busto") → se lee de
  // `incomes` por `propertyId` (el handler reutiliza getResumenSivra, misma fuente que el dashboard).
  // Solo para INGRESO: el gasto del Dúplex sigue por banco (`turistico_duplex`); el de los demás pisos
  // no se separa aún (cae a la IA). Va antes del `gasto_destino` para que "ingresos del dúplex" NO
  // devuelva el total de `turistico_duplex` del banco (que en ingresos es ~0: el banco no separa pisos).
  if (signo === 'ingreso') {
    const piso = PISOS_TURISTICOS.find(p => p.terminos.some(term => tienePalabra(t, term)))
    if (piso) return { tipo: 'ingresos_piso', propertyId: piso.propertyId, etiqueta: piso.etiqueta, anio, mes: mesInfo?.mes }
  }

  // NEGOCIO a secas (sin concepto ni subcategoría que acotar) → total del segmento: "gastos del
  // dúplex", "ingresos de los pisos". Va DESPUÉS del concepto (para que "comunidad del dúplex" gane
  // como concepto ∩ negocio) y ANTES del comodín residual/total (para no contestar el año a ciegas).
  if (dest) return { tipo: 'gasto_destino', signo, destinos: dest.destinos, etiqueta: dest.etiqueta, anio, mes: mesInfo?.mes }

  // Antes de caer al TOTAL (mes o año): si queda una ENTIDAD sin resolver (un filtro que ningún
  // matcher supo mapear, p.ej. "ingresos busto 2026"), NO contestamos el total a ciegas — devolvemos
  // null para que el cerebro lo derive a la IA (que lo mapea a intención y ejecuta el SQL exacto).
  // Es la lección del incidente del Dúplex: el comodín "total del año" tapaba el filtro sin resolver.
  if (entidadesResiduales(t, extras).length) return null

  // Mes SOLO (sin categoría ni proveedor) → gasto total del mes.
  if (mesInfo) return { tipo: 'movimientos_mes', signo, anio: mesInfo.anio, mes: mesInfo.mes }

  // Año (o "cuánto llevo…" sin más → acumulado del año).
  if (/a[ñn]o|anual|\b20\d{2}\b|total|llevo|este a[ñn]o/.test(t)) return { tipo: 'movimientos_anio', signo, anio: anioDe(t, hoy) }

  return null
}

// Conjunto de destinos válidos para validar la salida de la IA (mismos que acepta responderDirecto).
const DESTINOS_VALIDOS = new Set(['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal', 'actividad_pilar'])

// Valida y NORMALIZA el JSON que devuelve el clasificador IA a una Intencion segura (o null). Puro y
// testeable: la IA propone {tipo,...} y aquí se coacciona a los tipos que responderDirecto sabe
// contestar por SQL, descartando basura. NUNCA confía en cifras de la IA — solo en la INTENCIÓN.
export function intencionDesdeJSON(obj: unknown, hoy: Hoy): Intencion | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const tipo = String(o.tipo || '')
  const signo: Signo = o.signo === 'ingreso' ? 'ingreso' : 'gasto'
  const anio = Number.isInteger(o.anio) ? (o.anio as number) : hoy.anio
  const mes = Number.isInteger(o.mes) && (o.mes as number) >= 1 && (o.mes as number) <= 12 ? (o.mes as number) : undefined
  const etiquetaDe = (fallback: string) =>
    typeof o.etiqueta === 'string' && o.etiqueta.trim() ? o.etiqueta.trim().slice(0, 40) : fallback

  switch (tipo) {
    case 'facturas_pendientes': return { tipo: 'facturas_pendientes' }
    case 'tramo_fiscal': return { tipo: 'tramo_fiscal', anio }
    case 'por_destino': return { tipo: 'por_destino', anio }
    case 'movimientos_mes': return mes ? { tipo: 'movimientos_mes', signo, anio, mes } : null
    case 'movimientos_anio': return { tipo: 'movimientos_anio', signo, anio }
    case 'gasto_destino': {
      const destinos = Array.isArray(o.destinos) ? (o.destinos as unknown[]).filter((d): d is string => typeof d === 'string' && DESTINOS_VALIDOS.has(d)) : []
      if (!destinos.length) return null
      return { tipo: 'gasto_destino', signo, destinos, etiqueta: etiquetaDe(destinos.join('/')), anio, mes }
    }
    case 'ingresos_piso': {
      // La IA puede pedir el ingreso de un piso concreto. Solo se acepta un propertyId conocido.
      const propertyId = typeof o.propertyId === 'string' && PROPIEDADES_VALIDAS.has(o.propertyId) ? o.propertyId : ''
      if (!propertyId) return null
      return { tipo: 'ingresos_piso', propertyId, etiqueta: etiquetaDe(propertyId), anio, mes }
    }
    case 'subcategoria': {
      const subcategoria = typeof o.subcategoria === 'string' ? o.subcategoria.trim() : ''
      if (!subcategoria) return null
      return { tipo: 'subcategoria', signo, subcategoria, etiqueta: etiquetaDe(subcategoria), anio, mes }
    }
    case 'concepto': {
      const terminos = Array.isArray(o.terminos)
        ? (o.terminos as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().toLowerCase().slice(0, 40))
        : []
      if (!terminos.length) return null
      // La IA puede acotar el concepto por negocio ("comunidad del dúplex"): mismos destinos válidos
      // que gasto_destino. destinoEtiqueta viaja como texto libre acotado (para el rótulo compuesto).
      const destinos = Array.isArray(o.destinos) ? (o.destinos as unknown[]).filter((d): d is string => typeof d === 'string' && DESTINOS_VALIDOS.has(d)) : []
      const destinoEtiqueta = typeof o.destinoEtiqueta === 'string' && o.destinoEtiqueta.trim() ? o.destinoEtiqueta.trim().slice(0, 40) : undefined
      return { tipo: 'concepto', signo, terminos, etiqueta: etiquetaDe(terminos[0]), anio, mes, destinos: destinos.length ? destinos : undefined, destinoEtiqueta: destinos.length ? destinoEtiqueta : undefined }
    }
    default: return null
  }
}

// Etiqueta legible de mes para las respuestas.
export const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
