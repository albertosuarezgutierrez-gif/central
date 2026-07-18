// Ingesta de movimientos de grandes inversores desde Dataroma (agrega los 13F de gestores value).
// Dataroma ya trae en cada página de holdings una columna "Recent activity" (Buy/Add/Reduce/Sell) y
// resuelve el TICKER — nos ahorra diffear trimestres y el mapeo CUSIP→ticker de EDGAR. El parseo es
// PURO y testeado; el fetch corre desde el egress de Vercel (el sandbox de las sesiones bloquea Dataroma).
import type { MovimientoGuru } from '@central/module-trading'

// Mapea el texto de la columna "Recent activity" de Dataroma a nuestro tipo de movimiento.
// Prioridad: Sell/Reduce (salida) antes que Buy/Add (entrada); vacío = sin cambio = mantiene.
export function mapActividadDataroma(texto: string): MovimientoGuru {
  const t = texto.toLowerCase()
  if (t.includes('sell')) return 'vende'
  if (t.includes('reduce')) return 'recorta'
  if (t.includes('add')) return 'amplia'
  if (t.includes('buy')) return 'nueva'
  return 'mantiene'
}

export type MovDataroma = { simbolo: string; tipo: MovimientoGuru }

// Extrae {ticker, actividad} de una página de holdings de Dataroma. Defensivo (tolera cambios de
// маркup): recorre las filas <tr>, saca el ticker del enlace del stock (`?sym=` o `?t=`) y busca la
// palabra de actividad en el texto de la fila. ⚠️ Verificar/ajustar los selectores contra el HTML real
// en la primera corrida en Vercel (aquí no se puede: Dataroma da 403 al sandbox).
export function parseDataromaHoldings(html: string): MovDataroma[] {
  const out: MovDataroma[] = []
  const vistos = new Set<string>()
  const filas = html.split(/<tr[\s>]/i).slice(1)
  for (const fila of filas) {
    const mTicker = fila.match(/[?&](?:sym|t)=([A-Z][A-Z.\-]{0,6})\b/)
    if (!mTicker) continue
    const simbolo = mTicker[1]
    if (vistos.has(simbolo)) continue
    // Texto plano de la fila para buscar la actividad (sin etiquetas).
    const texto = fila.replace(/<[^>]+>/g, ' ')
    const tipo = mapActividadDataroma(texto)
    vistos.add(simbolo)
    out.push({ simbolo, tipo })
  }
  return out
}

// URL de la página de holdings de un gestor (código de Dataroma, p.ej. 'BRK' Berkshire).
export function urlHoldingsDataroma(codigoGestor: string): string {
  return `https://www.dataroma.com/m/holdings.php?m=${encodeURIComponent(codigoGestor)}`
}

// Descarga y parsea los movimientos de un gestor. Best-effort: ante fallo de red/parseo devuelve [].
export async function movimientosGestorDataroma(codigoGestor: string, timeoutMs = 8000): Promise<MovDataroma[]> {
  try {
    const res = await fetch(urlHoldingsDataroma(codigoGestor), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; central-trading/1.0; paper-research)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return []
    return parseDataromaHoldings(await res.text())
  } catch {
    return []
  }
}

// Gestores value por defecto (códigos Dataroma). ⚠️ Confirmar los códigos exactos en la primera corrida
// (Dataroma los lista en /m/home.php). Se pueden sobreescribir por el body del endpoint.
export const GESTORES_DEFECTO = ['BRK', 'psc', 'ic', 'DA', 'a']
