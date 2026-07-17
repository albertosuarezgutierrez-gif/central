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
  // P&L de un PISO turístico concreto (Dúplex/Luxury/Socorro/Busto). Ingreso ← tabla `incomes` (por
  // reserva), gasto ← tabla `gastos` (SIVRA, = las cards del dashboard), resultado = ingreso − gasto.
  // El banco NO separa los pisos (van juntos en `turistico_pisos`), por eso se lee de SIVRA. `modo`
  // elige la cara. Sustituye al viejo `ingresos_piso` (que solo cubría el ingreso).
  | { tipo: 'piso'; modo: 'ingreso' | 'gasto' | 'resultado'; propertyId: string; etiqueta: string; anio: number; mes?: number }
  // Rentabilidad de TODOS los pisos a la vez ("¿son rentables los pisos este mes?", "resultado de los
  // pisos"): desglose por piso de ingreso − gasto (mismas fuentes `incomes`/`gastos` = dashboard). Es la
  // vista AGREGADA; el `piso` de arriba es UN piso concreto. El banco no vale (agrega los pisos).
  | { tipo: 'pisos_rentabilidad'; anio: number; mes?: number }
  // Resultado (ingreso − gasto) de UN negocio de caja bancaria ("¿es rentable la correduría?"): suma por
  // `destino` los abonos y los cargos y los resta. Para negocios cuyo P&L vive en el banco (correduría =
  // `seguros`) — NO para los pisos (van por `pisos_rentabilidad`/`piso`, que leen SIVRA, no el banco).
  | { tipo: 'negocio_resultado'; destinos: string[]; etiqueta: string; anio: number; mes?: number }
  | { tipo: 'por_destino'; anio: number }
  | { tipo: 'facturas_pendientes' }
  | { tipo: 'tramo_fiscal'; anio: number }
  // Recuperar el PDF de un extracto de tarjeta ya archivado en Drive ("enséñame el extracto de junio
  // de la ****0302"). El enlace se guardó al importarlo (contable_memoria clave extracto_tarjeta:*).
  // `mes` opcional (si no, lista los que haya); `pan4` opcional (últimos 4 de la tarjeta).
  | { tipo: 'extracto_drive'; anio: number; mes?: number; pan4?: string }

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
// propertyId → etiqueta legible, para el desglose de `pisos_rentabilidad` (respuestas-directas).
export const PISOS_LABEL: Record<string, string> = Object.fromEntries(PISOS_TURISTICOS.map(p => [p.propertyId, p.etiqueta]))

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
  // Métricas de reserva: "y número de reservas", "cuántas noches"… NO son un proveedor/concepto.
  'reserva', 'reservas', 'noche', 'noches', 'ocupacion', 'ocupación', 'huesped', 'huéspedes', 'huespedes', 'numero', 'número',
])

// Últimos 4 dígitos de la tarjeta si la pregunta los nombra ("****0302", "termina en 0302",
// "la 0302"). Ignora los años (20xx) para no confundir "de 2026" con un PAN. null si no hay.
function detectarPan4(t: string): string | undefined {
  const enmascarado = t.match(/\*{2,}\s?(\d{4})/)          // ****0302
  if (enmascarado) return enmascarado[1]
  const termina = t.match(/(?:termina|acaba|acabada|terminada|acaba)\s+en\s+(\d{4})/)
  if (termina) return termina[1]
  for (const m of t.matchAll(/\b(\d{4})\b/g)) {              // "la 0302" / "tarjeta 0302"
    if (!/^20\d{2}$/.test(m[1])) return m[1]                 // descarta años
  }
  return undefined
}

// ¿Es una petición de RECUPERAR un extracto ya archivado ("enséñame/pásame el extracto de junio")?
// Va ANTES de la guarda de dinero (no es un "cuánto"). NO se dispara al SUBIR un PDF (eso es un
// documento, no un texto). Requiere la palabra "extracto" + un verbo de consulta. Puro/testeable.
const RE_CONSULTA_EXTRACTO = /(ens[eé][ñn]a|mu[eé]stra|ver el|quiero ver|d[aá]me|dame|p[aá]same|pasame|env[ií]a|manda|m[aá]ndame|abre|link|enlace|recup|consult|busca)/
export function detectarConsultaExtracto(t: string, hoy: Hoy): Intencion | null {
  if (!/extracto/.test(t)) return null
  if (!RE_CONSULTA_EXTRACTO.test(t)) return null
  // "súbeme/adjunto el extracto" es carga, no consulta: no lo interceptamos como recuperación.
  if (/(sub[eí]|subir|adjunt|te paso el pdf|te mando el pdf)/.test(t)) return null
  const mesInfo = detectarMes(t, hoy)
  return { tipo: 'extracto_drive', anio: mesInfo?.anio ?? anioDe(t, hoy), mes: mesInfo?.mes, pan4: detectarPan4(t) }
}

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

  // Preguntas de CONSEJO / recomendación / cómo-hacer → al LLM libre, NO al router determinista,
  // aunque mencionen "gasto". Sin esta guarda, "dame 3 consejos para reducir mi gasto" pasaba la
  // guarda de dinero (contiene "gasto") y el extractor genérico capturaba "reducir" como un falso
  // concepto → "No encuentro cargos de reducir" (bug real 17/07/2026). Va lo PRIMERO: una petición
  // de consejo nunca es una consulta estructurada. OJO: NO incluir "cómo va" (eso es P&L de un piso).
  // Se compara sin acentos (recomiéndame/sugiéreme) para no depender de la tilde.
  const tSinTilde = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/(consej|aconsej|recomien|recomend|sugier|sugerenc|\btips?\b|ideas?\s+para|como\s+(?:puedo|podria|reducir|bajar|recortar|ahorr|gastar\s+menos|mejorar|optimizar)|ayudame\s+a)/.test(tSinTilde)) return null

  // Facturas de proveedor pendientes (no depende de "cuánto").
  if (/factur/.test(t) && /(pendient|falta|sin pagar|por pagar|sin conciliar|me faltan)/.test(t)) {
    return { tipo: 'facturas_pendientes' }
  }

  // Recuperar un extracto de tarjeta archivado en Drive ("enséñame el extracto de junio de la
  // ****0302"). No es una consulta de dinero → va ANTES de la guarda de "cuánto".
  const extractoDrive = detectarConsultaExtracto(t, hoy)
  if (extractoDrive) return extractoDrive

  // Posición fiscal IRPF ("¿en qué tramo estamos?", "mi tipo marginal", "base imponible"). No
  // depende de "cuánto"; por eso va ANTES de la guarda de dinero. No secuestra órdenes de acción.
  if (/(tramo|irpf|marginal|base imponible|tipo (medio|efectivo))/.test(t)
      && !/(clasific|amortiz|concilia|reclasi|marca|c[aá]mbia|ponlo|ponme|apunta|registra)/.test(t)) {
    return { tipo: 'tramo_fiscal', anio: anioDe(t, hoy) }
  }

  // A partir de aquí solo consultas de dinero. `llev` (no solo "llevo") pilla la 3ª persona ("lo que
  // LLEVA la correduría"); `cargo(s)` es un sinónimo de gasto ("los cargos del club"). (resultado|
  // beneficio|rentab|cómo va → P&L de un piso; facturaci/facturó/facturad = facturación/ingreso.)
  if (!/(cu[aá]nto|gast|llev|ingres|cobr|cargo|facturaci|factur[oó]|facturad|balance|resumen|total|resultado|beneficio|rentab|reserv|c[oó]mo va)/.test(t)) return null
  // NUNCA secuestrar una orden de acción (aunque mencione un proveedor).
  if (/(clasific|amortiz|concilia|reclasi|marca|c[aá]mbia|ponlo|ponme|apunta|registra)/.test(t)) return null

  // Signo INGRESO por verbo de cobro/beneficio: cobr, facturación (facturaci/facturó/facturado — NO
  // "facturas" de proveedor, que son gasto), y "ganar/ganancia" (ganó/ganado/ganancia). El resto, gasto.
  // "reserva(s)"/"noche(s)" son métricas del lado INGRESO de un piso (las sirve el handler modo ingreso).
  const signo: Signo = /ingres|cobr|facturaci|factur[oó]|facturad|reserv|\bnoche|\bgan(?:[oó]|ad[oa]|ancia)/.test(t) ? 'ingreso' : 'gasto'

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

  // Subcategoría de CONSUMO (super, bares, gasolina…) y concepto-curado (luz, agua, comunidad…) se
  // detectan AHORA para darles prioridad sobre el piso: "comunidad del dúplex" debe COMPONER
  // (concepto ∩ negocio), no caer al total del piso. Se devuelven más abajo, tras el bloque de piso.
  const sc = SUBCAT_SINONIMOS.find(s => s.terminos.some(term => tienePalabra(t, term)))
  const syn = SINONIMOS.find(s => s.terminos.some(term => t.includes(term)))

  // PISO turístico concreto ("ingresos/gastos/resultado del dúplex/luxury/socorro/busto") → P&L por
  // piso. El banco NO separa los pisos (van juntos en `turistico_pisos`), así que ingreso ← `incomes`,
  // gasto ← `gastos` (SIVRA, = las cards del dashboard), resultado = ingreso − gasto (todo por
  // `propertyId`, misma fuente que el dashboard). `modo` elige la cara: resultado/beneficio/rentab/
  // «cómo va» → resultado; si no, por el signo. Solo si NO hay concepto/subcategoría que componer (esos
  // ganan). Va ANTES del concepto GENÉRICO porque el propio nombre del piso ("de luxury", "de socorro")
  // sería capturado como concepto; y sus stop-words ("...y número de reservas") no lo secuestran.
  if (!sc && !syn) {
    const piso = PISOS_TURISTICOS.find(p => p.terminos.some(term => tienePalabra(t, term)))
    if (piso) {
      const modo: 'ingreso' | 'gasto' | 'resultado' =
        /resultado|beneficio|rentab|gana|c[oó]mo va/.test(t) ? 'resultado'
        : /factur/.test(t) ? 'ingreso'   // "factura/facturación de <piso>" = facturación = ingreso
        : signo
      return { tipo: 'piso', modo, propertyId: piso.propertyId, etiqueta: piso.etiqueta, anio, mes: mesInfo?.mes }
    }
  }

  // Subcategoría de CONSUMO (super, bares, gasolina…) — se responde por la columna `subcategoria`.
  // Va ANTES del mes-solo para que "en supermercado en junio" NO caiga en "gasto total de junio".
  // (El consumo es personal por definición → NO se acota por negocio.)
  if (sc) return { tipo: 'subcategoria', signo, subcategoria: sc.subcategoria, etiqueta: sc.etiqueta, anio, mes: mesInfo?.mes }

  // Por concepto/proveedor conocido (luz, agua, comunidad…): sinónimos curados. Con mes y NEGOCIO
  // opcionales: "comunidad del dúplex" acota el concepto por `destino` (antes el negocio ganaba y
  // devolvía su TOTAL, tirando "comunidad"; o el concepto sin negocio mezclaba pisos y personal).
  if (syn) return { tipo: 'concepto', signo, terminos: syn.terminos, etiqueta: syn.etiqueta, anio, mes: mesInfo?.mes, destinos: dest?.destinos, destinoEtiqueta: destDe }

  // Concepto/proveedor GENÉRICO no listado ("gastado en claude", "en amazon", "de netflix"…).
  // Se COMPONE con el mes ("en amazon en junio") igual que las categorías, y va ANTES del mes-solo
  // para que el proveedor no se pierda: sin esto, "gasté en amazon en junio" devolvía el TOTAL de
  // junio (mes) tirando "amazon". Los meses/agregados están en STOP_CONCEPTO, así que "en junio" a
  // secas no casa aquí y cae bien al mes-solo de abajo. Sin esto, "¿cuánto llevo gastado en claude?"
  // caía en "llevo" → total del AÑO (cifra enorme, engañosa: parecía la respuesta a "claude").
  const termino = primerConceptoNoStop(t)
  if (termino) return { tipo: 'concepto', signo, terminos: [termino], etiqueta: termino, anio, mes: mesInfo?.mes, destinos: dest?.destinos, destinoEtiqueta: destDe }

  // RENTABILIDAD de TODOS los pisos ("¿son rentables los pisos este mes?", "resultado de los pisos"):
  // el negocio agregado son los pisos (`destinos` incluye turistico_pisos, la fila "los pisos turísticos"
  // — NO un piso suelto, que sería turistico_duplex a secas) Y se pregunta por rentabilidad/resultado.
  // Va ANTES del gasto_destino para no contestar solo el gasto agregado (el bug del 👎). El desglose por
  // piso lo hace el handler leyendo `incomes`/`gastos` (el banco no separa los pisos).
  if (dest && dest.destinos.includes('turistico_pisos') && /rentab|resultado|beneficio|ganancia/.test(t)) {
    return { tipo: 'pisos_rentabilidad', anio, mes: mesInfo?.mes }
  }

  // RESULTADO de un negocio de caja bancaria (correduría=seguros): «¿es rentable la correduría?»,
  // «resultado de la correduría» → ingreso − gasto por `destino`. Va tras los pisos (que leen SIVRA, no
  // el banco): se EXCLUYEN los destinos `turistico_*` para no sumar por banco lo que va por `incomes`/`gastos`.
  if (dest && !dest.destinos.some(d => d.startsWith('turistico')) && /rentab|resultado|beneficio|ganancia/.test(t)) {
    return { tipo: 'negocio_resultado', destinos: dest.destinos, etiqueta: dest.etiqueta, anio, mes: mesInfo?.mes }
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
  if (/a[ñn]o|anual|\b20\d{2}\b|total|llev|este a[ñn]o/.test(t)) return { tipo: 'movimientos_anio', signo, anio: anioDe(t, hoy) }

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
    case 'extracto_drive': {
      const pan4 = typeof o.pan4 === 'string' && /^\d{4}$/.test(o.pan4) ? o.pan4 : undefined
      return { tipo: 'extracto_drive', anio, mes, pan4 }
    }
    case 'por_destino': return { tipo: 'por_destino', anio }
    case 'pisos_rentabilidad': return { tipo: 'pisos_rentabilidad', anio, mes }
    case 'negocio_resultado': {
      // Resultado de un negocio de caja bancaria; se EXCLUYEN los `turistico_*` (van por pisos_rentabilidad/piso).
      const destinos = Array.isArray(o.destinos) ? (o.destinos as unknown[]).filter((d): d is string => typeof d === 'string' && DESTINOS_VALIDOS.has(d) && !d.startsWith('turistico')) : []
      if (!destinos.length) return null
      return { tipo: 'negocio_resultado', destinos, etiqueta: etiquetaDe(destinos.join('/')), anio, mes }
    }
    case 'movimientos_mes': return mes ? { tipo: 'movimientos_mes', signo, anio, mes } : null
    case 'movimientos_anio': return { tipo: 'movimientos_anio', signo, anio }
    case 'gasto_destino': {
      const destinos = Array.isArray(o.destinos) ? (o.destinos as unknown[]).filter((d): d is string => typeof d === 'string' && DESTINOS_VALIDOS.has(d)) : []
      if (!destinos.length) return null
      return { tipo: 'gasto_destino', signo, destinos, etiqueta: etiquetaDe(destinos.join('/')), anio, mes }
    }
    case 'piso': {
      // La IA puede pedir el P&L de un piso concreto. Solo se acepta un propertyId conocido y un
      // `modo` válido (ingreso/gasto/resultado); ante la duda cae a 'resultado' (la vista completa).
      const propertyId = typeof o.propertyId === 'string' && PROPIEDADES_VALIDAS.has(o.propertyId) ? o.propertyId : ''
      if (!propertyId) return null
      const modo: 'ingreso' | 'gasto' | 'resultado' =
        o.modo === 'ingreso' || o.modo === 'gasto' || o.modo === 'resultado' ? o.modo : 'resultado'
      return { tipo: 'piso', modo, propertyId, etiqueta: etiquetaDe(propertyId), anio, mes }
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

// ── VERIFICADOR: lógica PURA (el resto —la llamada al 2º modelo— vive en clasificar-ia.ts) ──
// Resumen legible de una intención, para que el verificador juzgue si "responde" a la pregunta.
export function resumenIntencion(intn: Intencion): string {
  switch (intn.tipo) {
    case 'piso': return `${intn.modo} del piso ${intn.propertyId}${intn.mes ? ` (mes ${intn.mes})` : ''} en ${intn.anio}`
    case 'gasto_destino': return `${intn.signo} del negocio [${intn.destinos.join(', ')}]${intn.mes ? ` (mes ${intn.mes})` : ''} en ${intn.anio}`
    case 'negocio_resultado': return `resultado (ingreso − gasto) del negocio [${intn.destinos.join(', ')}]${intn.mes ? ` (mes ${intn.mes})` : ''} en ${intn.anio}`
    case 'concepto': return `${intn.signo} por concepto "${intn.etiqueta}"${intn.destinos ? ` acotado a [${intn.destinos.join(', ')}]` : ''} en ${intn.anio}`
    default: return intn.tipo
  }
}

// Interpreta la respuesta JSON del verificador: confirma la original / corrige por una válida / rechaza
// (→ null = "no contestes por SQL, deriva al LLM libre"). FAIL-OPEN: sin JSON o sin `ok`, confía en la
// original (nunca bloquea por un verificador que no responde bien).
export function interpretarVerificacion(
  obj: unknown, original: Intencion, hoy: Hoy,
): { intn: Intencion | null; accion: 'confirma' | 'corrige' | 'rechaza' } {
  if (!obj || typeof obj !== 'object') return { intn: original, accion: 'confirma' }
  const o = obj as Record<string, unknown>
  if (o.ok === true || o.ok === undefined) return { intn: original, accion: 'confirma' }
  const corr = o.correccion && typeof o.correccion === 'object' ? intencionDesdeJSON(o.correccion, hoy) : null
  if (corr) return { intn: corr, accion: 'corrige' }
  return { intn: null, accion: 'rechaza' }
}

// Etiqueta legible de mes para las respuestas.
export const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
