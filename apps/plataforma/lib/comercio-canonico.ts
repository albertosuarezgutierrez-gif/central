// apps/plataforma/lib/comercio-canonico.ts
// IDENTIDAD canónica de un comercio, para comparar el gasto de HOY contra el histórico.
//
// `lib/comercio.ts::comercioDe` da la ETIQUETA que se PINTA ("DIA SEVILLA 2260"): fiel al banco,
// buena para leer. Este módulo da la IDENTIDAD ("DIA"): la clave con la que se decide si un cargo
// es de un comercio que YA se conocía. Son dos cosas distintas y por eso viven en módulos distintos.
//
// Por qué existe (14/08/2026): los vigilantes de la tarjeta comparaban la etiqueta CRUDA contra el
// histórico, así que "MERCADONA COLMENA SEVILLA" salía como «cargo que no reconozco» con 50 compras
// previas en Mercadona — otra sucursal de la MISMA cadena es otra cadena de texto. Ese aviso (que
// pide a Alberto confirmar si reconoce un cargo) es justo el tipo de afirmación que no puede salir
// de una comparación de strings: decir «no lo reconozco» de algo que sí está en el histórico es
// afirmar una ausencia que nadie ha comprobado.
//
// Módulo PURO (sin BD ni React), testeable con `node --test`.

// Cadenas con MUCHAS sucursales: el nombre del establecimiento cambia (número de tienda, barrio,
// ciudad) pero el comercio es el mismo, así que una sucursal nueva NO es un comercio nuevo.
// OJO: aquí solo van MARCAS reales. Nada de palabras genéricas de sector ('BAR', 'FARMACIA',
// 'RESTAURANTE'…): colapsarían comercios independientes distintos en una sola identidad, que es el
// error simétrico (y peor: taparía un cargo de verdad desconocido). Para clasificar por sector ya
// está `lib/subcategoria-keywords.ts`, que es otro problema.
const CADENAS = [
  // Alimentación
  'MERCADONA', 'CARREFOUR EXPRESS', 'CARREFOUR MARKET', 'CARREFOUR', 'LIDL', 'ALDI', 'DIA',
  'SUPERCOR', 'HIPERCOR', 'EL CORTE INGLES', 'EROSKI', 'CONSUM', 'ALCAMPO', 'AHORRAMAS',
  'COVIRAN', 'MASYMAS', 'BONAREA', 'PRIMAPRIX', 'PRIMA PRIX', 'FRESKO', 'CASH FRESC',
  // Carburante
  'REPSOL', 'CEPSA', 'GALP', 'SHELL', 'PETRONOR', 'PETROPRIX', 'BALLENOIL', 'PLENOIL',
  // Restauración de cadena
  'MCDONALD', 'BURGER KING', 'TELEPIZZA', 'DOMINOS', 'KFC', 'GLOVO', 'UBER EATS', 'JUST EAT',
  'STARBUCKS', 'RODILLA', 'GINOS', 'VIPS', 'FOSTER', 'TAGLIATELLA', '100 MONTADITOS',
  // Moda
  'ZARA HOME', 'ZARA', 'H&M', 'PULL&BEAR', 'PULL & BEAR', 'BERSHKA', 'STRADIVARIUS',
  'MASSIMO DUTTI', 'MANGO', 'PRIMARK', 'CORTEFIEL', 'SPRINGFIELD', 'DESIGUAL', 'KIABI',
  'LEFTIES', 'OYSHO', 'CALZEDONIA', 'INTIMISSIMI', 'GOCCO', 'MAYORAL',
  // Hogar / electrónica / deporte
  'IKEA', 'LEROY MERLIN', 'BRICOMART', 'BRICODEPOT', 'BRICO DEPOT', 'MEDIA MARKT', 'MEDIAMARKT',
  'WORTEN', 'CONFORAMA', 'MAISONS DU MONDE', 'DECATHLON', 'BASIC FIT', 'BASICFIT', 'VIVAGYM',
  'ALTAFIT', 'MCFIT', 'FNAC', 'JUGUETTOS', 'TOYS R US', 'ACTION',
  // Salud / óptica de cadena
  'GENERAL OPTICA', 'MULTIOPTICAS', 'OPTICA 2000', 'ALAIN AFFLELOU', 'DENTIX', 'VITALDENT',
  // Online / suscripciones (el banco escribe la misma marca de mil formas)
  'AMAZON', 'AMZN', 'ALIEXPRESS', 'TEMU', 'SHEIN', 'WISH', 'PAYPAL', 'NETFLIX', 'SPOTIFY',
  'DISNEY', 'HBO', 'APPLE', 'GOOGLE', 'MICROSOFT', 'ADOBE', 'DROPBOX', 'OPENAI', 'ANTHROPIC',
  'BOOKING', 'AIRBNB', 'RENFE', 'IBERIA', 'VUELING', 'RYANAIR', 'CABIFY', 'UBER', 'BOLT',
  'FREENOW', 'FREE NOW', 'CORREOS', 'SEUR', 'MRW', 'DHL',
]
// Se prueban de más específica a más genérica ('ZARA HOME' antes que 'ZARA', 'MEDIA MARKT' antes
// que 'DIA' —que ni siquiera casaría, pero el orden evita depender de cómo esté escrita la lista).
const CADENAS_ORDENADAS = [...CADENAS].sort((a, b) => b.length - a.length)

// Sufijos que NO identifican al comercio: nº de tienda/terminal (2260, T88, ES1234), forma
// jurídica y la ciudad con la que el TPV remata el rótulo. Solo se quitan por la DERECHA (dentro
// del nombre pueden ser parte del rótulo: "CASA 1900", "BAR SEVILLA").
const RE_CODIGO = /^[A-Z]{0,3}\d{1,6}[A-Z]?$/          // 2260 · T88 · ES1234 · 03B
// Forma jurídica al final. Con espacio opcional entre letras porque la normalización convierte los
// puntos en espacios: "S.L" → "S L", "S.L.U." → "S L U". El `\s` inicial impide comerse el final de
// una palabra ("CASA" no acaba en forma jurídica).
const RE_JURIDICO_FINAL = /\s(S ?L ?N ?E|S ?L ?U|S ?L ?L|S ?L|S ?A ?U|S ?A|S ?C ?A|S ?C ?P|S ?C|C ?B|S ?P ?A)$/
const CIUDADES = new Set([
  'SEVILLA', 'MADRID', 'BARCELONA', 'MALAGA', 'HUELVA', 'CADIZ', 'CORDOBA', 'GRANADA', 'JAEN',
  'ALMERIA', 'VALENCIA', 'BILBAO', 'ZARAGOZA', 'MURCIA', 'ESPANA', 'SPAIN', 'ES',
])

// Mayúsculas sin acentos, sin puntuación y con espacios colapsados (mantiene '&' porque forma
// parte de marcas reales: H&M, PULL&BEAR).
export function normalizarComercio(raw: string | null | undefined): string {
  return (raw ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ¿A qué cadena conocida pertenece este rótulo? null si no es de ninguna (comercio independiente).
export function cadenaDe(raw: string | null | undefined): string | null {
  const texto = ` ${normalizarComercio(raw)} `
  if (texto.trim() === '') return null
  for (const cadena of CADENAS_ORDENADAS) {
    // Límite de palabra por los dos lados: 'DIA' casa "DIA SEVILLA 2260" pero no "MEDIAMARKT"
    // ni "DIAGONAL MAR"; '&' no es carácter de palabra, por eso se compara con espacios.
    if (texto.includes(` ${cadena} `)) return cadena
  }
  return null
}

// Clave con la que se decide "¿este comercio ya lo conocía?". Cadena conocida → la marca; comercio
// independiente → su rótulo sin el ruido de sucursal/terminal/forma jurídica. NUNCA vacía: si todo
// el rótulo fuese ruido se devuelve el texto normalizado entero (mejor una clave fea que fundir
// comercios distintos en una vacía).
export function claveComercio(raw: string | null | undefined): string {
  const cadena = cadenaDe(raw)
  if (cadena) return cadena
  const norm = normalizarComercio(raw)
  if (!norm) return ''
  const tokens = norm.replace(RE_JURIDICO_FINAL, '').trim().split(' ')
  while (tokens.length > 1) {
    const ultimo = tokens[tokens.length - 1]
    if (!RE_CODIGO.test(ultimo) && !CIUDADES.has(ultimo)) break
    tokens.pop()
  }
  return tokens.join(' ') || norm
}

// ¿Dos rótulos son el MISMO comercio? (azúcar sobre claveComercio, para leer mejor en los filtros)
export function mismoComercio(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = claveComercio(a)
  return ka !== '' && ka === claveComercio(b)
}
