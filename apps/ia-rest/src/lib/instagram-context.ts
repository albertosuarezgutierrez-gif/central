import { callAI, cleanJSON } from '@/lib/ai-client'

export const IAREST_MODULOS = [
  { modulo: 'Voz + Brain', desc: 'Camarero dicta comanda por voz → cocina en 2 segundos. Sin papel.', hashtags: ['#voz','#ia'] },
  { modulo: 'KDS Cocina', desc: 'Pantalla digital en cocina — comandas ordenadas por tiempo y prioridad.', hashtags: ['#kds','#cocina'] },
  { modulo: 'Turnos + Fichaje', desc: 'Control de turnos con fichaje digital. Cumple RD-ley 8/2019.', hashtags: ['#fichaje','#personal'] },
  { modulo: 'Supervisor de Tiempos', desc: 'Detecta mesas lentas y avisa al jefe de sala automáticamente.', hashtags: ['#gestion','#servicio'] },
  { modulo: 'QR Mesa', desc: 'El cliente escanea QR y hace su pedido desde el móvil.', hashtags: ['#qr','#digital'] },
  { modulo: 'Storefront', desc: 'Tienda online propia — delivery y recogida sin pagar comisión.', hashtags: ['#delivery','#sincomision'] },
  { modulo: 'Almacén + Escandallos', desc: 'Stock real, escandallos por plato, alertas de reposición.', hashtags: ['#almacen','#costes'] },
  { modulo: 'VeriFactu', desc: 'Facturación electrónica obligatoria desde 2026. Automatizado.', hashtags: ['#verifactu','#hacienda'] },
  { modulo: 'Carta de Vinos', desc: 'Sommelier IA: sugiere maridaje, gestiona stock en tiempo real.', hashtags: ['#vinos','#sommelier'] },
  { modulo: 'Analytics', desc: 'Dashboard con ventas, ticket medio, top productos y comparativa.', hashtags: ['#analytics','#datos'] },
  { modulo: 'RRHH', desc: 'Gestión de candidaturas con análisis IA de CVs.', hashtags: ['#rrhh','#hosteleros'] },
  { modulo: 'Multilocal', desc: 'Un solo panel para N restaurantes. Stock central, analytics por local.', hashtags: ['#gruporestaurante','#multilocal'] },
  { modulo: 'Escáner IA', desc: 'Escanea albaranes y los digitaliza automáticamente.', hashtags: ['#digitalizacion','#proveedores'] },
  { modulo: 'Auto-Healer', desc: 'Monitor que detecta y corrige fallos automáticamente. 97.9%.', hashtags: ['#fiabilidad','#tecnologia'] },
]

export interface Noticia { titulo: string; fuente: string }

export async function obtenerNoticias(): Promise<Noticia[]> {
  const noticias: Noticia[] = []
  for (const q of ['hostelería restaurante bar España noticias', 'TPV restaurante tecnología digitalización', 'gestión restaurante rentabilidad 2026']) {
    try {
      const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es&gl=ES&ceid=ES:es`, {
        headers: { 'User-Agent': 'ia-rest-bot/1.0' }, signal: AbortSignal.timeout(6000),
      })
      const xml = await res.text()
      const matches = xml.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)
      let count = 0
      for (const m of matches) {
        const t = m[1].trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/ - .*$/,'')
        if (t.length > 20 && !t.includes('Google') && count < 3) { noticias.push({ titulo: t, fuente: 'Google News' }); count++ }
      }
    } catch { /* no crítico */ }
  }
  return [...new Map(noticias.map(n => [n.titulo.slice(0,30), n])).values()].slice(0, 8)
}

export async function leerContextoDrive(): Promise<string> {
  return ''
}

export async function elegirTemaConContexto(plantilla: string, ultimoTema: string, noticias: Noticia[], contextoDrive: string, temasRecientes: string[] = [], modulosRecientes: string[] = []): Promise<{ tema: string; modulo: string; hashtags: string[] }> {
  // Diversidad: prioriza módulos que NO se han usado en los últimos posts (rota entre los 14).
  const modulosSinUsar = IAREST_MODULOS.filter(m => !modulosRecientes.includes(m.modulo))
  const modulosPreferidos = modulosSinUsar.length ? modulosSinUsar : IAREST_MODULOS
  const modulosTexto = modulosPreferidos.map(m => `- ${m.modulo}: ${m.desc}`).join('\n')
  const noticiasTexto = noticias.map(n => `- ${n.titulo}`).join('\n') || 'Sin noticias disponibles'
  const recientesTexto = temasRecientes.length ? temasRecientes.map(t => `- ${t}`).join('\n') : '- (ninguno)'
  const prompt = `Estratega Instagram ia.rest. Elige tema para plantilla "${plantilla}".
MÓDULOS DISPONIBLES (elige uno que NO se haya usado recientemente):
${modulosTexto}
NOTICIAS: ${noticiasTexto}
TEMAS RECIENTES (NO repitas ni parafrasees ninguno — busca un ángulo y módulo DISTINTO):
${recientesTexto}
REGLAS: NUNCA competidores por nombre. El tema debe ser claramente distinto de los recientes.
SOLO JSON: {"tema":"...","modulo":"...","hashtags":["#tag1","#tag2"]}`
  // noFallback=true → NIM puro, NUNCA Anthropic (agente IG; evita "credit balance too low").
  // timeout amplio (25s) para que NIM no caiga al fallback por lentitud puntual.
  const raw = await callAI('Elige tema Instagram. SOLO JSON.', prompt, 300, 25_000, true)
  const d = JSON.parse(cleanJSON(raw))
  const mod = IAREST_MODULOS.find(m => m.modulo === d.modulo)
  return { tema: d.tema || 'gestión digital hostelería', modulo: d.modulo || '', hashtags: [...new Set([...(d.hashtags||[]), ...(mod?.hashtags||[])])].slice(0,4) }
}
