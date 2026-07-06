// apps/plataforma/lib/subcategoria-keywords.ts
// Clasificación DETERMINISTA de gasto personal por palabras clave del concepto/comercio.
// Objetivo: los movimientos obvios (DIA, Mercadona, gasolinera, farmacia, Netflix…) se etiquetan
// AL INSTANTE sin llamar a la IA — así la pestaña Categorías funciona aunque la pasarela de IA esté
// saturada (429/timeout), y la IA solo se usa para lo genuinamente ambiguo. Módulo PURO (sin BD ni
// React), testeable con `node --test`. FUENTE de subcategorías: ./categorias-personales.
import type { SubcategoriaGasto } from './categorias-personales'

// Cada entrada: subcategoría → lista de fragmentos (ya en MAYÚSCULAS, sin acentos) que, si aparecen
// en el texto normalizado del movimiento, la determinan. Orden de la lista = prioridad (la primera
// que casa gana), así que las más específicas van antes que las genéricas.
const REGLAS: Array<{ sub: SubcategoriaGasto; claves: string[] }> = [
  { sub: 'supermercado', claves: [
    'MERCADONA', 'CARREFOUR', 'LIDL', 'ALDI', 'DIA ', 'SUPERCOR', 'EROSKI', 'CONSUM',
    'ALCAMPO', 'AHORRAMAS', 'AHORRA MAS', 'SUPERMERCADO', 'SUPER ', 'HIPERCOR', 'GADIS',
    'FRUTERIA', 'CARNICERIA', 'PANADERIA', 'PESCADERIA', 'COVIRAN', 'MASYMAS', 'BONAREA',
    // Comercios de alimentación locales (España): panaderías/hornos, ultramarinos, mercados…
    'HORNO', 'ULTRAMARINO', 'ALIMENTACION', 'MARISCOS', 'CHARCUTERIA', 'VERDULERIA',
    'COMESTIBLES', 'MERCADO ', 'BODEGA ',
  ] },
  { sub: 'restaurante_bar', claves: [
    'BAR ', 'BAR-', 'CAFETERIA', 'CAFE ', 'RESTAURANTE', 'RESTAURANT', 'CERVECERIA',
    'TABERNA', 'MESON', 'PIZZERIA', 'BURGER', 'MCDONALD', 'TELEPIZZA', 'DOMINOS',
    'KFC', 'GLOVO', 'UBER EATS', 'JUST EAT', 'STARBUCKS', 'ASADOR', 'GASTROBAR',
    'HAMBURGUES', 'KEBAB', 'SUSHI', 'TAPAS', 'CHURRERIA', 'HELADERIA', 'PASTELERIA',
    'FREIDURIA', 'MARISQUERIA', 'BODEGON', 'VENTA ', 'CHIRINGUITO',
  ] },
  { sub: 'gasolina', claves: [
    'GASOLINERA', 'CARBURANTE', 'COMBUSTIBLE', 'REPSOL', 'CEPSA', 'GALP', 'BP ',
    'SHELL', 'PETRONOR', 'ESTACION DE SERVICIO', 'E.S. ', 'E.S.', 'PEAJE', 'AUTOPISTA',
    'GASOLEO', 'CARREFOUR COMBUSTIBLE',
  ] },
  { sub: 'farmacia', claves: [
    'FARMACIA', 'PARAFARMACIA', 'OPTICA', 'FARMA', 'FCIA', 'GENERAL OPTICA', 'MULTIOPTICAS',
  ] },
  { sub: 'ropa', claves: [
    'ZARA', 'H&M', 'H Y M', 'PULL&BEAR', 'PULL BEAR', 'BERSHKA', 'STRADIVARIUS',
    'MASSIMO DUTTI', 'MANGO', 'PRIMARK', 'DECATHLON ROPA', 'CORTEFIEL', 'SPRINGFIELD',
    'DESIGUAL', 'C&A', 'KIABI', 'LEFTIES', 'OYSHO', 'CALZEDONIA', 'INTIMISSIMI',
    'CALZADO', 'ZAPATOS', 'ZAPATERIA', 'GOCCO', 'MAYORAL',
  ] },
  { sub: 'colegio', claves: [
    'COLEGIO', 'COLE ', 'ACADEMIA', 'ESCUELA', 'GUARDERIA', 'AMPA', 'MATERIAL ESCOLAR',
    'EXTRAESCOLAR', 'INSTITUTO', 'UNIVERSIDAD', 'MATRICULA',
  ] },
  { sub: 'deporte', claves: [
    'GIMNASIO', 'GYM ', 'BASIC FIT', 'BASICFIT', 'MCFIT', 'VIVAGYM', 'ALTAFIT',
    'PISCINA', 'PADEL', 'GOLF', 'DECATHLON', 'CROSSFIT', 'CLUB DEPORTIVO', 'FITNESS',
    'ADIDAS', 'NIKE', 'PUMA ', 'DEPORTES ',
  ] },
  { sub: 'suscripcion', claves: [
    'NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'PRIME VIDEO', 'DISNEY', 'HBO', 'MAX ',
    'YOUTUBE PREMIUM', 'GOOGLE STORAGE', 'GOOGLE ONE', 'ICLOUD', 'APPLE.COM', 'APPLE ',
    'MICROSOFT', 'OFFICE 365', 'ADOBE', 'DROPBOX', 'CHATGPT', 'OPENAI', 'ANTHROPIC',
    'CLAUDE', 'DAZN', 'MOVISTAR PLUS', 'AUDIBLE', 'CANVA', 'NOTION', 'GITHUB',
    'VERCEL', 'HOSTING', 'DOMINIO', 'PLAYSTATION PLUS', 'XBOX', 'NINTENDO',
  ] },
  { sub: 'suministros_piso', claves: [
    'IBERDROLA', 'ENDESA', 'NATURGY', 'REPSOL LUZ', 'HOLALUZ', 'TOTALENERGIES',
    'EDP ', 'CANAL ISABEL', 'EMASESA', 'AGUAS DE', 'GAS NATURAL', 'MOVISTAR',
    'VODAFONE', 'ORANGE', 'DIGI ', 'DIGI SPAIN', 'YOIGO', 'MASMOVIL', 'PEPEPHONE',
    'JAZZTEL', 'O2 ', 'FACTURA LUZ', 'FACTURA AGUA', 'FACTURA GAS', 'ELECTRICIDAD',
  ] },
  { sub: 'reforma', claves: [
    'FONTANERIA', 'FONTANERO', 'ELECTRICISTA', 'PINTURA', 'PINTOR', 'ALBAÑIL',
    'ALBANIL', 'REFORMA', 'OBRA ', 'CARPINTERIA', 'CERRAJERIA', 'CERRAJERO',
  ] },
  { sub: 'hogar', claves: [
    'IKEA', 'LEROY MERLIN', 'LEROY', 'BRICOMART', 'BRICODEPOT', 'BRICO DEPOT',
    'FERRETERIA', 'CONFORAMA', 'MAISONS DU MONDE', 'ELECTRODOMESTICO', 'MEDIA MARKT',
    'MEDIAMARKT', 'WORTEN', 'MUEBLES', 'MENAJE', 'BAZAR', 'ZARA HOME',
  ] },
  { sub: 'seguro', claves: [
    'SEGURO', 'MAPFRE', 'MUTUA', 'AXA', 'ALLIANZ', 'ZURICH', 'GENERALI', 'OCCIDENT',
    'LIBERTY', 'REALE', 'CASER', 'SANITAS', 'ADESLAS', 'DKV', 'ASISA', 'LINEA DIRECTA',
    'PELAYO', 'VERTI', 'POLIZA',
  ] },
  { sub: 'transporte', claves: [
    'TAXI', 'UBER', 'CABIFY', 'BOLT', 'FREENOW', 'FREE NOW', 'PARKING', 'PARKIA',
    'RENFE', 'AVE ', 'METRO ', 'EMT ', 'AUTOBUS', 'ALSA', 'BLABLACAR', 'CERCANIAS',
    'IBERIA', 'VUELING', 'RYANAIR', 'EASYJET', 'AIR EUROPA', 'AEROPUERTO', 'BILLETE',
  ] },
  { sub: 'ocio', claves: [
    'CINE', 'YELMO', 'CINESA', 'TEATRO', 'ESPECTACULO', 'CONCIERTO', 'ENTRADAS',
    'TICKETMASTER', 'MUSEO', 'PARQUE', 'FNAC', 'GAME ', 'STEAM', 'AMAZON', 'ALIEXPRESS',
  ] },
  // Última prioridad: gastos claros que no encajan en ninguna categoría propia (estanco, funeraria…).
  { sub: 'otros_gasto', claves: [
    'TANATORIO', 'FUNERARIA', 'EXPENDIDURIA', 'ESTANCO', 'TABACOS', 'LOTERIA',
  ] },
]

// Normaliza el texto para casar sin acentos y en mayúsculas (deja espacios para que 'BAR ' no case
// dentro de 'BARCELONA').
export function normalizarTexto(raw: string | null): string {
  if (!raw) return ''
  const limpio = raw
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim()
  if (!limpio) return ''
  // Se envuelve en espacios para que claves con espacio de borde ('BAR ', 'DIA ') casen tambi\u00e9n al
  // principio o al final del texto (p. ej. concepto que TERMINA en "... DIA").
  return ` ${limpio} `
}

// Devuelve las claves (fragmentos MAYÚSCULAS) de una subcategoría, para que otros módulos (p. ej. el
// agente contable) construyan un ILIKE equivalente en SQL SIN duplicar el diccionario. Se conservan
// tal cual (con sus espacios de borde: 'BAR ', 'DIA '…) para no romper los límites de palabra.
export function clavesDeSubcategoria(sub: string): string[] {
  return REGLAS.filter(r => r.sub === sub).flatMap(r => r.claves)
}

// Devuelve la subcategoría de GASTO determinada por palabras clave, o null si nada casa con certeza.
// Solo para GASTOS (importe < 0); los ingresos siguen su propia lógica.
export function clasificarPorKeywords(concepto: string | null, comercio: string | null): SubcategoriaGasto | null {
  const texto = normalizarTexto(`${comercio ?? ''} ${concepto ?? ''}`)
  if (!texto.trim()) return null
  for (const { sub, claves } of REGLAS) {
    for (const clave of claves) {
      if (texto.includes(clave)) return sub
    }
  }
  return null
}
