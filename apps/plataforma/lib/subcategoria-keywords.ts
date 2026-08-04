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
  // Bizum: PRIMERA regla a propósito — un envío Bizum lleva el motivo/destinatario libre en el
  // concepto ("ENVIO BIZUM padel", "ENVIO BIZUM bar tal") y sin esta prioridad esas palabras casaban
  // con categorías normales (deporte/restaurante_bar/…) antes de llegar aquí. Alberto quiere TODOS
  // los Bizum enviados en un único bucket, para ver de un vistazo cuánto se va por esta vía.
  { sub: 'bizum', claves: ['BIZUM'] },
  { sub: 'supermercado', claves: [
    'MERCADONA', 'CARREFOUR', 'LIDL', 'ALDI', 'DIA ', 'SUPERCOR', 'EROSKI', 'CONSUM',
    'ALCAMPO', 'AHORRAMAS', 'AHORRA MAS', 'SUPERMERCADO', 'SUPER ', 'HIPERCOR', 'GADIS',
    'FRUTERIA', 'CARNICERIA', 'PANADERIA', 'PESCADERIA', 'COVIRAN', 'MASYMAS', 'BONAREA',
    'PRIMAPRIX', 'PRIMA PRIX',
    // Comercios de alimentación locales (España): panaderías/hornos, ultramarinos, mercados…
    'HORNO', 'ULTRAMARINO', 'ALIMENTACION', 'MARISCOS', 'CHARCUTERIA', 'VERDULERIA',
    'COMESTIBLES', 'MERCADO ', 'BODEGA ',
  ] },
  { sub: 'restaurante_bar', claves: [
    'BAR ', 'BAR-', 'CAFETERIA', 'CAFE ', 'RESTAURANTE', 'RESTAURANT', 'CERVECERIA',
    'TABERNA', 'MESON', 'PIZZERIA', 'BURGER', 'MCDONALD', 'TELEPIZZA', 'DOMINOS',
    'KFC', 'GLOVO', 'UBER EATS', 'JUST EAT', 'STARBUCKS', 'ASADOR', 'GASTROBAR',
    'HAMBURGUES', 'KEBAB', 'SUSHI', 'TAPAS', 'CHURRERIA', 'HELADERIA', 'PASTELERIA',
    'FREIDURIA', 'MARISQUERIA', 'BODEGON', 'VENTA ', 'CHIRINGUITO', 'GALOS CMI',
    // Descripción MCC genérica de pagos con tarjeta en hostelería (la trae el concepto del banco).
    'RESTAURANTES Y CAFETERIAS',
  ] },
  { sub: 'gasolina', claves: [
    'GASOLINERA', 'CARBURANTE', 'COMBUSTIBLE', 'REPSOL', 'CEPSA', 'GALP', 'BP ',
    'SHELL', 'PETRONOR', 'PETROPRIX', 'ESTACION DE SERVICIO', 'E.S. ', 'E.S.', 'PEAJE', 'AUTOPISTA',
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
    // Colegio de los niños de Alberto (San José SSCC / Sagrados Corazones, Sevilla): recibos del
    // centro, la asociación de padres (ACPA) y la fundación. Confirmado por Alberto (07/07/2026).
    'SAGRADOS CORAZONES', 'SAGRADO CORAZON', 'FUNDACION SAGRADO', 'ACPA', 'SAN JOSE SSC',
    'JOS SS C',
  ] },
  // Club social (Círculo Mercantil): cuota de socio / gimnasio del club / inscripción (recurrente).
  // VA ANTES que 'deporte' a propósito: el recibo del club trae 'GYM'/'PADEL' en el concepto, pero
  // Alberto quiere TODO lo del Círculo Mercantil bajo 'club' (regla de comercio específico gana a la
  // palabra genérica de categoría).
  { sub: 'club', claves: [
    'CIRCULO MERCANTIL', 'CIRCULO MERCAN',
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
    'VERCEL', 'HOSTING', 'DOMINIO', 'IONOS', 'GODADDY', 'PLAYSTATION PLUS', 'XBOX', 'NINTENDO',
  ] },
  { sub: 'suministros_piso', claves: [
    'IBERDROLA', 'ENDESA', 'NATURGY', 'REPSOL LUZ', 'HOLALUZ', 'TOTALENERGIES',
    'TOTAL GAS Y ELECT', 'TOTAL GAS', 'TOTALENERGIA', 'TOTAL ENERGIES',
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
    'MEDIAMARKT', 'WORTEN', ' MUEBLES ', 'MUEBLERIA', 'MENAJE', 'BAZAR', 'ZARA HOME',
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
    'TUSSAM', 'SEVICI',
  ] },
  { sub: 'ocio', claves: [
    'CINE', 'YELMO', 'CINESA', 'TEATRO', 'ESPECTACULO', 'CONCIERTO', 'ENTRADAS',
    'TICKETMASTER', 'MUSEO', 'PARQUE', 'FNAC', 'GAME ', 'STEAM', 'AMAZON', 'ALIEXPRESS',
    // El banco escribe Amazon como 'AMZN Mktp ES' → 'AMAZON' no casa; añadimos 'AMZN'.
    'AMZN', 'TEMU', 'SHEIN', 'WISH',
  ] },
  // Hipoteca de la vivienda (Montecarmelo): la cuota del préstamo llega como 'CUOTA PTMO ...'.
  { sub: 'hipoteca', claves: [
    'CUOTA PTMO', 'CUOTA PRESTAMO', 'PRESTAMO HIPOTEC', 'HIPOTECA', 'AMORTIZACION PRESTAMO',
  ] },
  // Comunidad de propietarios de la vivienda (Montecarmelo): cuota / administrador de fincas.
  // El recibo mensual de la comunidad llega como 'RECIBO D - MONTECARMELO' (~110€/mes).
  { sub: 'comunidad', claves: [
    'MONTECARMELO', 'MONTE CARMELO',
    'CDAD. DE PROP', 'CDAD DE PROP', 'CDAD PROP', 'COMUNIDAD DE PROP', 'COMUNIDAD PROP',
    'COMUN. PROP', 'MANCOMUNIDAD', 'ADMIN. FINCAS', 'ADMINISTRACION DE FINCAS',
    'ADMINISTRADOR DE FINCAS', 'ADMON FINCAS', 'ADMON. FINCAS',
  ] },
  // IBI y tributos MUNICIPALES de la vivienda. OJO: ' IBI ' con espacios de borde para no casar
  // dentro de 'IBIZA'/'CARIBI…' (el texto ya viene envuelto en espacios por normalizarTexto).
  { sub: 'ibi', claves: [
    ' IBI ', 'IMPUESTO BIENES INMUEBLES', 'BIENES INMUEBLES', 'CONTRIBUCION URBANA',
    'RECAUDACION MUNICIPAL', 'PATRONATO RECAUDACION', 'PATRONATO PROV', 'TASA BASURA',
    'TASA DE BASURA', 'RECOGIDA DE BASURA', 'TRIBUTOS MUNICIPALES',
    'AYTO. SEVILLA', 'AYTO SEVILLA', 'AY. SEVILLA', 'EX.AY.SEVILLA', 'EX.AY. SEVILLA',
    'AYUNTAMIENTO DE SEVILLA',
  ] },
  // IMPUESTOS ESTATALES (IRPF/Hacienda). Frases específicas para no pisar la vivienda ('IMPUESTO
  // BIENES INMUEBLES' es IBI, no esto) ni casar un local llamado 'Hacienda ...' (usamos 'HACIENDA'
  // solo en la frase 'IMPUESTO DE HACIENDA'/'TRIBUT HACIENDA'). Confirmado por Alberto (07/07/2026):
  // los dos pagos gordos son la renta (junio + 2º plazo de noviembre).
  { sub: 'impuestos', claves: [
    'IMPUESTO DE HACIENDA', 'TRIBUT HACIENDA', 'AGENCIA TRIBUTARIA', 'AEAT', ' IRPF ',
    'DECLARACION DE LA RENTA', 'DECLARACION RENTA', 'RENTA WEB', 'HACIENDA PUBLICA',
  ] },
  // Servicios personales varios (peluquería/estética, veterinario, tintorería, mascotas…).
  { sub: 'otros_gasto', claves: [
    'PELUQUERIA', 'BARBERIA', 'ESTETICA', 'MANICURA', 'VETERINARI', 'CLINICA VETERIN',
    'TINTORERIA', 'LAVANDERIA', 'MASCOTA', 'KIWOKO', 'TIENDANIMAL',
  ] },
  // Última prioridad: gastos claros que no encajan en ninguna categoría propia (estanco, funeraria…).
  { sub: 'otros_gasto', claves: [
    'TANATORIO', 'FUNERARIA', 'EXPENDIDURIA', 'ESTANCO', 'TABACOS', 'LOTERIA',
    'NOTARIA', 'REGISTRO PROP', 'ABOGAD', 'PROCURADOR', 'GESTORIA', 'CORREOS',
    // Financiación personal de BanSabadell (6 cuotas ene-jun 2025, ~83,33€/mes) — YA CANCELADA,
    // confirmado por Alberto (18/07/2026). Sin categoría propia de "préstamos"; se fija aquí para
    // que no quede a la deriva de la IA en un futuro re-barrido.
    'BANSABADELL',
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

// Reglas en ORDEN de prioridad (la primera que casa gana), para que un re-barrido determinista en SQL
// pueda mirar el MISMO diccionario sin duplicarlo. NO mutar el array devuelto.
export function reglasOrdenadas(): ReadonlyArray<{ sub: SubcategoriaGasto; claves: readonly string[] }> {
  return REGLAS
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
