// lib/sivra/agente-huesped/consulta-web.ts — cuando la guía no lo sabe y el dato está FUERA del piso,
// se consulta internet en vez de escalar en blanco (dictado de Alberto, 05/09/2026: «en caso de duda
// que use la IA para consultar»).
//
// El caso que lo motiva (reserva 154375571): «¿cómo llegamos desde el aeropuerto?» no está —ni tiene
// por qué estar— en la guía del piso, así que el modelo rellenó el hueco de memoria y salieron DOS
// datos falsos: un precio de taxi de «25-30€» y una parada del bus EA («Puerta de Jerez») que ni
// existe en esa línea ni está a 10 minutos del apartamento. Ninguno de los dos lo cazaba
// `contieneDatoInventado`: sus patrones buscan códigos de 4+ dígitos, teléfonos y URLs, no importes
// de dos cifras ni topónimos.
//
// 🚨 LO QUE ESTO **NO** HACE: auto-enviar. Un dato traído de internet sigue escalando a Alberto
// SIEMPRE. La lección del caso no es que faltara el dato, es que se afirmó sin fuente: ahora el
// borrador llega con el dato Y con los enlaces de dónde sale, y él solo tiene que dar a ✅ Enviar.
//
// 🚨 Y SOLO PARA EL ENTORNO, nunca para el piso. Internet no sabe si este apartamento tiene plancha:
// preguntarle es pagar una búsqueda para que el modelo rellene el hueco con más aplomo todavía. Lo
// del piso sigue escalando como hueco de guía, que es lo correcto — se responde una vez, se aprende
// como hecho y ya no vuelve a preguntarse.

// ── Qué cuenta como pregunta de ENTORNO ────────────────────────────────────────────────────
// Multi-idioma como el resto de reglas del agente (es/en/fr/de/it). Precisión > cobertura: un falso
// negativo deja el comportamiento de hoy (escala en blanco, sin coste); un falso positivo paga una
// búsqueda inútil y mete ruido de internet en una pregunta sobre el apartamento.
const RE_ENTORNO: RegExp[] = [
  // Cómo llegar / transporte público / traslados
  /\b(aeropuerto|airport|a[eé]roport|flughafen|aeroporto|svq)\b/i,
  /\b(taxi|cabify|uber|vtc|traslado|transfer|shuttle)\b/i,
  /\b(autob[uú]s|bus|guagua|tranv[ií]a|tram|metro|cercan[ií]as|tren|train|treno|zug|renfe|ave|estaci[oó]n|station|bahnhof|santa\s*justa|plaza\s*de\s*armas)\b/i,
  /\b(c[oó]mo\s+(se\s+)?(llego|llegamos|llegar|ir)|how\s+(do|can)\s+(we|i)\s+get|how\s+to\s+get|comment\s+(aller|se\s+rendre)|wie\s+komm(e|en)\s+(ich|wir)|come\s+(arrivare|raggiungere))\b/i,
  // Qué ver / entradas / horarios de terceros
  /\b(catedral|cathedral|alc[aá]zar|giralda|museo|museum|mus[eé]e|monumento|plaza\s+de\s+espa[nñ]a|tri[aá]na|flamenco|tablao|entradas|tickets|billetes|visita\s+guiada|guided\s+tour|qu[eé]\s+(ver|visitar|hacer)|what\s+to\s+(see|do|visit)|things\s+to\s+do)\b/i,
  // Dónde comer / beber
  /\b(restaurante|restaurant|ristorante|tapas|d[oó]nde\s+(comer|cenar|desayunar)|where\s+to\s+eat|dove\s+mangiare|o[uù]\s+manger|essen\s+gehen|recomienda[s]?\s+alg[uú]n|recommend\s+a\s+(place|restaurant))\b/i,
  // Servicios cercanos y clima
  /\b(supermercado|supermarket|farmacia|pharmacy|apotheke|cajero|atm|el\s+tiempo|weather|previsi[oó]n\s+meteorol[oó]gica|meteo)\b/i,
  // Eventos de la ciudad
  /\b(feria\s+de\s+abril|semana\s+santa|bienal|concierto|concert|evento|event|festival|partido)\b/i,
]

// ¿La pregunta pide un dato del ENTORNO (Sevilla), no del apartamento?
export function preguntaDeEntorno(texto: string): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  return RE_ENTORNO.some(re => re.test(t))
}

export type SenalesConsulta = {
  escalaPorConocimiento: boolean  // el control de calidad dijo que la INFORMACIÓN no cubre la pregunta
  categoria: string
  sensible: boolean
  sentimiento: 'positivo' | 'neutro' | 'negativo'
}

// ¿Procede gastar una búsqueda? Solo si el agente iba a escalar por NO SABER (o es una recomendación,
// que escala por política y también se resuelve con datos reales) y la pregunta mira hacia fuera.
//
// Lo sensible y lo negativo quedan fuera SIEMPRE: una queja, un cobro o una cancelación no se
// resuelven con una búsqueda, y meter datos de internet ahí solo añade superficie para equivocarse.
export function procedeConsultarWeb(pregunta: string, s: SenalesConsulta): boolean {
  if (s.sensible || s.sentimiento === 'negativo') return false
  if (!s.escalaPorConocimiento && s.categoria !== 'recomendacion') return false
  return preguntaDeEntorno(pregunta)
}

// ── La consulta ────────────────────────────────────────────────────────────────────────────
export type ContextoConsulta = {
  zona: string        // "Sevilla"
  direccion?: string  // dirección del apartamento, si la ficha la trae
  checkIn?: string
}

export function construirConsulta(pregunta: string, ctx: ContextoConsulta): { system: string; user: string } {
  const donde = ctx.direccion ? `${ctx.direccion} (${ctx.zona})` : ctx.zona
  const system =
    `Buscas datos VERIFICABLES en internet para responder a un huésped de un alojamiento turístico en ${donde}. ` +
    `Devuelve SOLO datos concretos y actuales (precios oficiales, horarios, líneas y paradas, nombres), en español, en 5 líneas como mucho. ` +
    `Si un dato varía (tarifa diurna/nocturna, temporada), dilo con sus dos valores en vez de dar uno solo. ` +
    `Si NO encuentras un dato fiable, escribe exactamente "SIN DATO" para ese punto: no lo estimes ni lo redondees. ` +
    `Termina SIEMPRE con una última línea "FUENTES: " y las URLs separadas por " | ".`
  const user =
    `Alojamiento: ${donde}.${ctx.checkIn ? ` Llegada del huésped: ${ctx.checkIn}.` : ''}\n` +
    `Pregunta del huésped: "${(pregunta || '').trim()}"\n\n` +
    `Busca los datos actuales que hacen falta para contestarla.`
  return { system, user }
}

export type ResultadoConsulta = {
  datos: string      // el texto útil, sin la línea de FUENTES
  fuentes: string[]  // URLs citadas
  ok: boolean        // false = no se pudo consultar o no trajo nada aprovechable
  error?: string
}

// Separa los datos de las URLs. Un texto sin línea FUENTES no se descarta (el dato puede valer), pero
// se queda sin enlaces y el aviso de Telegram lo dice: verificar a mano cuesta más.
export function partirRespuesta(texto: string): { datos: string; fuentes: string[] } {
  const t = (texto || '').trim()
  if (!t) return { datos: '', fuentes: [] }
  const m = t.match(/^\s*FUENTES\s*:\s*(.+)$/im)
  const fuentes = m
    ? m[1].split(/[|\s]+/).map(u => u.trim()).filter(u => /^https?:\/\//i.test(u))
    : []
  const datos = (m ? t.slice(0, m.index).trim() : t).replace(/\s*\n{3,}/g, '\n\n')
  return { datos, fuentes }
}

// ¿El resultado aporta algo? "SIN DATO" repetido es una consulta que no ha resuelto nada: mejor
// escalar en blanco (y decirlo) que mandarle a Alberto un bloque de nadas con aire de investigación.
export function aportaAlgo(datos: string): boolean {
  const limpio = (datos || '').replace(/sin\s+dato/gi, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return limpio.length >= 20
}

type Buscar = (system: string, user: string) => Promise<string>

export async function consultarEntorno(
  pregunta: string,
  ctx: ContextoConsulta,
  buscar: Buscar,
): Promise<ResultadoConsulta> {
  const { system, user } = construirConsulta(pregunta, ctx)
  let texto = ''
  try {
    texto = (await buscar(system, user)) || ''
  } catch (e: any) {
    // Un fallo de búsqueda es «no he podido mirar», nunca «no hay». El llamante lo declara.
    return { datos: '', fuentes: [], ok: false, error: (e?.message || 'error').slice(0, 200) }
  }
  const { datos, fuentes } = partirRespuesta(texto)
  if (!aportaAlgo(datos)) return { datos: '', fuentes, ok: false, error: 'la búsqueda no trajo ningún dato utilizable' }
  return { datos, fuentes, ok: true }
}

// El bloque que se le da al redactor. Va con su advertencia: son datos de internet, no de la guía,
// así que el modelo no puede adornarlos ni completarlos con lo que le suene.
export function bloqueConsulta(datos: string): string {
  return (
    `\nDATOS CONSULTADOS EN INTERNET (no están en la guía del piso; son de fuentes públicas de hoy):\n${datos}\n` +
    `Úsalos SOLO si responden a lo que pregunta el huésped, y CÓPIALOS tal cual: no redondees precios, ` +
    `no añadas horarios, paradas, nombres ni distancias que no estén ahí arriba, y si un punto pone ` +
    `"SIN DATO" no te lo inventes — dile con naturalidad que se lo confirmas enseguida.`
  )
}
