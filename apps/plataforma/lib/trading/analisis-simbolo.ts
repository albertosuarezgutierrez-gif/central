import { prisma } from '@/lib/db'
import { rankearUniverso, etiquetaCalidad, sma, rsi, type EmpresaUniverso } from '@central/module-trading'
import { puntosDiariosVol, cierresDiarios } from './precios-stooq'
import { acumulacionDistribucion, type SenalVolumen } from './volumen'
import { fuerzaRelativaEnCaidas, type FuerzaRelativa } from './fuerza-relativa'
import { submissionsCik, extraerEventos8K, extraerFilingsForm4, estimarProximoInforme, type Evento8K } from './edgar'
import { transaccionesFiling } from './form4'
import { anomaliasUniverso, camposEnvenenados } from './calidad-datos'
import { buscarCandidatos } from './buscar-simbolo'

// 🔍 ANÁLISIS A DEMANDA DE UNA ACCIÓN (idea de Alberto, 20/07/2026: "un buscador para poner una acción
// y que el agente me haga un análisis — por ejemplo PayPal"). Compone las piezas DETERMINISTAS que ya
// existen en el radar sobre UN símbolo: factores de la caché + puesto en el ranking del blend, técnico
// (SMA50/RSI), 📊 volumen, 💪 fuerza relativa en caídas, 📰 8-K, 🧑‍💼 insiders y 📅 próximo informe
// (30 días para el análisis puntual, más ancho que los 7 del digest). Cero cifras inventadas — todo
// sale de la SEC y de precios públicos. Si el símbolo no está en el universo (~550 mayores de EEUU),
// degrada al análisis solo-precio (Yahoo cubre cualquier ticker de EEUU). SOLO estudio.

export type AnalisisSimbolo = {
  simbolo: string
  nombre: string | null
  enUniverso: boolean
  puesto: number | null            // posición en el ranking del blend (1 = mejor) entre `deTotal`
  deTotal: number | null
  score: number | null
  etiqueta: 'fuerte' | 'media' | 'debil' | null
  factores: { piotroski: number | null; roic: number | null; earningsYield: number | null; fcfYield: number | null; momentum: number | null; mktCap: number | null } | null
  precio: number | null
  tecnico: 'si' | 'esperar' | null
  sobreSma50: boolean | null
  rsi14: number | null
  volumen: SenalVolumen | null
  fuerza: FuerzaRelativa | null
  eventos8K: Evento8K[]
  insiders: { compras: number; ventas: number; usdCompras: number } | null
  proximoInforme: string | null
}

const hoyIso = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

// Resultado de una CONSULTA del buscador: análisis directo, sugerencias («¿querías decir…?» cuando
// el nombre casa con varias) o null (nada parecido y tampoco parece un ticker con precios).
export type ResultadoConsulta =
  | { tipo: 'analisis'; analisis: AnalisisSimbolo }
  | { tipo: 'sugerencias'; sugerencias: Array<{ simbolo: string; nombre: string | null }> }
  | null

// Punto de entrada del buscador: acepta ticker («PYPL») o nombre («PayPal») y resuelve contra el
// universo con buscarCandidatos (determinista): 1 candidato → análisis directo; varios → sugerencias;
// ninguno pero con pinta de ticker → intento solo-precio (Yahoo cubre cualquier ticker de EEUU).
export async function analizarConsulta(q: string): Promise<ResultadoConsulta> {
  const filas = await prisma.tradingUniverso.findMany()
  const candidatos = buscarCandidatos(q, filas)
  if (candidatos.length === 1) {
    const analisis = await analizarConFilas(candidatos[0].simbolo, filas)
    return analisis ? { tipo: 'analisis', analisis } : null
  }
  if (candidatos.length > 1) {
    return { tipo: 'sugerencias', sugerencias: candidatos.map(c => ({ simbolo: c.simbolo, nombre: c.nombre })) }
  }
  const ticker = q.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) return null
  const analisis = await analizarConFilas(ticker, filas)
  return analisis ? { tipo: 'analisis', analisis } : null
}

// Compat (skill/agente): análisis directo de un ticker ya resuelto.
export async function analizarSimbolo(simboloRaw: string): Promise<AnalisisSimbolo | null> {
  const simbolo = simboloRaw.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(simbolo)) return null
  return analizarConFilas(simbolo, await prisma.tradingUniverso.findMany())
}

type FilaUniverso = Awaited<ReturnType<typeof prisma.tradingUniverso.findMany>>[number]

async function analizarConFilas(simbolo: string, filas: FilaUniverso[]): Promise<AnalisisSimbolo | null> {
  const hoy = hoyIso()

  // 1) Caché + puesto en el ranking del blend (mismo motor y misma neutralización 🛡️ que el radar).
  const fila = filas.find(f => f.simbolo === simbolo) ?? null
  const envenenados = camposEnvenenados(anomaliasUniverso(filas))
  const empresas: EmpresaUniverso[] = filas.map(f => {
    const malos = envenenados.get(f.simbolo)
    return {
      simbolo: f.simbolo, nombre: f.nombre ?? undefined,
      piotroski: f.piotroski,
      roic: malos?.has('roic') ? null : f.roic,
      earningsYield: malos?.has('earningsYield') ? null : f.earningsYield,
      fcfYield: malos?.has('fcfYield') ? null : f.fcfYield,
      momentum: malos?.has('momentum') ? null : f.momentum,
      mktCap: malos?.has('mktCap') ? null : f.mktCap,
      guruScore: 0,
      datosFrescos: true,
    }
  })
  const items = rankearUniverso(empresas, { top: empresas.length }).items
  const idx = items.findIndex(i => i.simbolo === simbolo)

  // 2) Precio+volumen del símbolo (Yahoo cubre cualquier ticker de EEUU) y SPY para la fuerza relativa.
  const [puntos, cierresSpy] = await Promise.all([
    puntosDiariosVol(simbolo, haceDias(400), hoy),
    cierresDiarios('SPY', haceDias(400), hoy),
  ])
  if (!fila && puntos.length < 40) return null   // ni en universo ni con precios → no existe/sin datos
  const cierres = puntos.map(p => p.cierre)
  const s50 = cierres.length >= 60 ? sma(cierres, 50) : null
  const r14 = cierres.length >= 60 ? rsi(cierres) : null
  const sobreSma50 = s50 != null ? cierres[cierres.length - 1] > s50 : null
  const tecnico = s50 != null && r14 != null ? (sobreSma50 && r14 >= 40 && r14 <= 70 ? 'si' as const : 'esperar' as const) : null

  // 3) Capas SEC (solo con CIK en la caché): 8-K + insiders (30 días) + próximo informe estimado.
  let eventos8K: Evento8K[] = []
  let insiders: AnalisisSimbolo['insiders'] = null
  let proximoInforme: string | null = null
  if (fila?.cik) {
    const subs = await submissionsCik(fila.cik).catch(() => null)
    if (subs) {
      eventos8K = extraerEventos8K(subs, haceDias(30))
      proximoInforme = estimarProximoInforme(subs, hoy)
      let compras = 0; let ventas = 0; let usdCompras = 0
      const cikCorto = fila.cik.replace(/^0+/, '') || '0'
      for (const f of extraerFilingsForm4(subs, haceDias(30)).slice(0, 5)) {
        for (const tx of await transaccionesFiling(cikCorto, f.accesion).catch(() => [])) {
          if (tx.tipo === 'compra') { compras++; usdCompras += tx.acciones * (tx.precioUsd ?? 0) }
          else ventas++
        }
      }
      if (compras || ventas) insiders = { compras, ventas, usdCompras }
    }
  }

  return {
    simbolo,
    nombre: fila?.nombre ?? null,
    enUniverso: fila != null,
    puesto: idx >= 0 && items[idx].score != null ? idx + 1 : null,
    deTotal: idx >= 0 ? items.length : null,
    score: idx >= 0 ? items[idx].score : null,
    etiqueta: fila ? etiquetaCalidad({
      simbolo, piotroski: fila.piotroski, roic: fila.roic, earningsYield: fila.earningsYield,
      momentum: fila.momentum, mktCap: fila.mktCap, guruScore: 0, datosFrescos: true,
    }) : null,
    factores: fila ? {
      piotroski: fila.piotroski, roic: fila.roic, earningsYield: fila.earningsYield,
      fcfYield: fila.fcfYield, momentum: fila.momentum, mktCap: fila.mktCap,
    } : null,
    precio: cierres.at(-1) ?? null,
    tecnico, sobreSma50, rsi14: r14,
    volumen: acumulacionDistribucion(puntos),
    fuerza: fuerzaRelativaEnCaidas(cierres, cierresSpy),
    eventos8K, insiders, proximoInforme,
  }
}
