import { prisma } from '@/lib/db'
import { eur, eurSinDecimales } from '@/lib/dinero'
import { curvaEnEuros, CAPITAL_ESTUDIO_EUR } from '@/lib/trading/cartera-estudio'
import { puntosDiarios } from '@/lib/trading/precios-stooq'
import { neutralizarUniverso } from '@/lib/trading/calidad-datos'
import { etiquetaCalidad, rankearUniverso, type EmpresaUniverso } from '@central/module-trading'
import OnboardingBanner from './OnboardingBanner'
import RadarExplorador, { type FilaExplorador } from './RadarExplorador'
import CarteraEstudio from './CarteraEstudio'
import CarteraCohetes, { type CarteraCohetesData } from './CarteraCohetes'
import AnalisisSimbolo from './AnalisisSimbolo'
import DetallePerezoso from './DetallePerezoso'
import { COHORTES_PAPER } from '@/lib/trading/paper-cartera'
import { evaluarEscalera, evaluarApagado, emparejarOps } from '@/lib/trading/puerta-fase2'
import { resumenPorDivisa, rentabilidadPosicion } from '@/lib/trading/cartera-real'
import type { CarteraRealUI } from '@/lib/trading/cartera-real-io'

// Contenido del «Laboratorio de inversión», extraído de page.tsx para poder reutilizarlo tal cual en la
// vista de invitado (/invitado/trading, solo lectura vía token — ver lib/trading-acceso.ts). Es 100%
// lectura (no hay ninguna acción que escriba), así que no necesita distinguir sesión de invitado por dentro.

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
function pctN(n: number | null | undefined): string {
  return n == null ? '—' : pct(n)
}
function pct0N(n: number | null | undefined): string {
  return n == null ? '—' : `${(n * 100).toFixed(0)}%`
}

// Mini-curva del forward (SVG puro, sin dependencias): línea de la cesta (MEDIANA) vs el SPY a lo largo de
// los snapshots persistidos. La mediana es la métrica de decisión (un outlier no la mueve).
function CurvaForward({ serie }: { serie: { m: number | null; b: number }[] }) {
  const pts = serie.filter(p => p.m != null) as { m: number; b: number }[]
  if (pts.length < 2) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>acumulando puntos (curva desde el 2º snapshot)…</span>
  const W = 280, H = 56, P = 5
  const ys = pts.flatMap(p => [p.m, p.b])
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const span = hi - lo || 1
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1)
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P)
  const path = (sel: (p: { m: number; b: number }) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: '100%' }} role="img" aria-label="Curva cesta vs SPY">
      <path d={path(p => p.b)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={path(p => p.m)} fill="none" stroke="var(--brand)" strokeWidth={2} />
    </svg>
  )
}
function fechaCorta(d: Date): string {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const CAPA_LABEL: Record<string, string> = { A: 'A · ancla', B: 'B · conocido', C: 'C · cantera' }
const ETIQ_MINI = { fuerte: '🟢', media: '🟡', debil: '⚪' } as const
// Nombres internos del torneo → etiqueta legible (la palabra suelta «momentum»/«reversion» no le
// dice nada a quien no vive en el código; el nombre interno se conserva entre paréntesis).
const ESTRATEGIA_LABEL: Record<string, string> = {
  momentum: 'seguir la tendencia (momentum)',
  reversion: 'comprar el rebote (reversión)',
  valor: 'por fundamentales (valor)',
  catalizador: 'por catalizador (noticias)',
}
// Qué significa cada tramo de la escalera, para el tooltip del hero (importes del pre-registro).
const TRAMO_INFO: Record<1 | 2 | 3, string> = {
  1: 'Tramo 1 = 1.000€ de prueba (~3% del cash) con señal viva — objetivo: medir fricción, no ganar',
  2: 'Tramo 2 = +2.000€ (total ~9%) — exige 4 meses de cesta batiendo al SPY por mediana',
  3: 'Tramo 3 = +3.000€ (total ~18%, techo 6.000€ hasta validar) — exige 3 cestas y 6 meses batiendo',
}

// ❓ Glosario en lenguaje llano — la página usa términos de análisis (Piotroski, ROIC, mediana,
// cohorte…) que no se explican en ningún sitio; esto los traduce UNA vez, plegado para no estorbar.
const GLOSARIO: Array<[string, string]> = [
  ['Paper / simulado', 'todas las operaciones ocurren en nuestra base de datos, jamás en tu cuenta real de Interactive Brokers.'],
  ['Score', 'nota del modelo frente a sus pares (calidad 40% + valor 40% + momentum 20%). Sirve para ordenar el ranking; no es un precio objetivo.'],
  ['Piotroski (0–9)', 'salud contable calculada con las cuentas oficiales de la SEC; ≥6 se considera sólido.'],
  ['ROIC', 'rentabilidad que la empresa saca al capital que emplea; ≥10% es bueno.'],
  ['Earnings yield (EY)', 'beneficio operativo dividido por lo que cuesta comprar la empresa entera — cuanto más alto, más barata está.'],
  ['FCF yield', 'lo mismo pero con la caja libre que genera de verdad (la versión «en efectivo» del EY).'],
  ['Momentum 12m', 'cuánto ha subido en el último año (sin contar el último mes). Se usa para SELECCIONAR, no para hacer trading de cruces.'],
  ['🟢/🟡/⚪ Calidad', 'resumen de los factores de arriba en un vistazo.'],
  ['📈/⏳ Señal técnica', 'el CUÁNDO entrar en un valor ya seleccionado. Solo se calcula para el top-20 del snapshot semanal.'],
  ['🏆 Gurús', 'gestores value conocidos (informes 13F) tienen o están ampliando esa posición.'],
  ['Mediana', 'el valor del medio de la cesta: la mitad de las posiciones lo hace mejor y la otra mitad peor. Es la cifra que decide, porque un pelotazo suelto no la infla (una media sí).'],
  ['Cohorte', 'una cesta congelada en una fecha que ya no se toca — así se puede medir limpia, sin trampas retrospectivas, contra el SPY.'],
  ['SPY', 'el índice S&P 500. Es el listón: comprarlo y no tocarlo es la alternativa que el sistema tiene que batir para merecer dinero real.'],
  ['Caída máx (drawdown)', 'lo peor que ha llegado a ir la cesta de un pico a un valle. Batir con mucho más riesgo no es batir.'],
  ['TE (tracking error)', 'cuánto se separa la cesta del índice en el día a día.'],
  ['🪜 Tramos', 'plan firmado de dinero real: 1.000€ → +2.000€ → +3.000€ (techo 6.000€ hasta validar). Los suben las señales, no el calendario, y cada tramo es una decisión tuya.'],
]

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }
const chipCss: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 13, whiteSpace: 'nowrap' }

// Importe en la divisa de la posición, formato español (regla global: nunca estilo dólar).
function dinero(n: number, divisa: string): string {
  const v = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
  return divisa === 'EUR' ? `${v}€` : divisa === 'USD' ? `${v} $` : `${v} ${divisa}`
}

// `carteraReal` solo llega desde la página con SESIÓN (app/(usuario)/trading/page.tsx): es dinero
// REAL de Alberto y la vista de invitado (/invitado/trading) no debe verlo — ahí queda undefined
// y la sección no se pinta. `null` = cuenta con sesión pero IBKR nunca sincronizado (estado
// «pendiente» honesto, distinto de «sin posiciones»).
export default async function TradingDashboard({ carteraCohetes, carteraReal }: { carteraCohetes: CarteraCohetesData | null; carteraReal?: CarteraRealUI | null | 'error' }) {
  // Un fallo de BD NO es «no hay datos»: se apunta qué consulta cayó y se avisa arriba con un banner
  // de datos parciales — nunca se pinta el estado vacío tranquilizador sobre un error (regla del repo).
  const fallos: string[] = []
  const vigilado = <T,>(nombre: string, p: Promise<T>, fallback: T): Promise<T> =>
    p.catch(() => { fallos.push(nombre); return fallback })
  const [posiciones, tesis, compras, watchlist, track, radar, universoFilas, ordenes] = await Promise.all([
    vigilado('posiciones', prisma.tradingPaperPosicion.findMany({ orderBy: { abiertaEn: 'desc' } }), []),
    // `anulado: false`: las tesis anuladas se construyeron con el precio de otra empresa (17/07, 03/08
    // y 04/08 de 2026). Pintarlas sería enseñar como idea del agente una señal que nunca fue de ese
    // símbolo; siguen en BD como registro del incidente.
    vigilado('ideas del agente', prisma.tradingTesis.findMany({ where: { anulado: false }, orderBy: [{ fecha: 'desc' }, { confianza: 'desc' }], take: 40, include: { resultado: true } }), []),
    // Compras REALES por consulta PROPIA: filtrar las 40 tesis recientes escondía las compras de hace
    // días detrás de las señales nuevas (una pasada mete ~22 tesis/día → a los 2 días solo quedaba la
    // compra más reciente y Alberto veía «solo ORCL» con 8 posiciones abiertas, 15/08/2026).
    vigilado('compras', prisma.tradingTesis.findMany({ where: { anulado: false, direccion: 'alcista', operada: true }, orderBy: { fecha: 'desc' }, take: 8, include: { resultado: true } }), []),
    vigilado('watchlist', prisma.tradingWatchlist.findMany({ where: { activo: true }, orderBy: [{ capa: 'asc' }, { simbolo: 'asc' }] }), []),
    vigilado('seguimiento forward', prisma.tradingPaperTrack.findMany({ orderBy: [{ cohorte: 'asc' }, { fecha: 'asc' }] }), []),
    vigilado('radar', prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } }), null),
    vigilado('universo', prisma.tradingUniverso.findMany({
      select: { simbolo: true, nombre: true, piotroski: true, roic: true, earningsYield: true, fcfYield: true, momentum: true, mktCap: true, actualizadoEn: true },
    }), []),
    vigilado('órdenes', prisma.tradingPaperOrden.findMany(), []),
  ])

  // Ranking+explorador UNIFICADOS (petición de Alberto 20/07: dos tablas eran la misma información):
  // el score del blend se calcula para TODO el universo elegible con el MISMO rankearUniverso del cron,
  // y la tabla única se ordena por él por defecto — las primeras filas SON el top del radar. El guruScore
  // solo se conoce para el top-20 del snapshot (para el resto 0, aproximación documentada).
  // 🛡️ MISMO escudo de calidad de datos que el cron ANTES de puntuar: esta página leía la caché CRUDA
  // y un ADR con resultados en rupias (RDY, EY «682%») salió nº 1 con score 6,03 (11/08/2026). Los
  // campos imposibles se anulan (no puntúan) y se declaran bajo el ranking.
  const { filas: universoSano, anomalias } = neutralizarUniverso(universoFilas)
  const limiteFresco = new Date(Date.now() - 14 * 86_400_000)
  const badges = new Map(((radar?.entries as unknown as { simbolo: string; guru: boolean; tecnico: 'si' | 'esperar' | null; volumen?: 'acumulacion' | 'distribucion' | 'neutral' | null }[] | null) ?? []).map(e => [e.simbolo, e]))
  const empresasUniverso: EmpresaUniverso[] = universoSano.map(f => ({
    simbolo: f.simbolo, nombre: f.nombre ?? undefined,
    piotroski: f.piotroski, roic: f.roic, earningsYield: f.earningsYield, fcfYield: f.fcfYield,
    momentum: f.momentum, mktCap: f.mktCap, guruScore: badges.get(f.simbolo)?.guru ? 1 : 0,
    datosFrescos: f.actualizadoEn > limiteFresco,
  }))
  const scorePorSimbolo = new Map(rankearUniverso(empresasUniverso, { top: empresasUniverso.length }).items.map(i => [i.simbolo, i.score]))
  const universoExplorador: FilaExplorador[] = universoFilas.map(f => {
    const b = badges.get(f.simbolo)
    return {
      simbolo: f.simbolo, nombre: f.nombre, score: scorePorSimbolo.get(f.simbolo) ?? null,
      piotroski: f.piotroski, roic: f.roic, ey: f.earningsYield, momentum: f.momentum, mktCap: f.mktCap,
      etiqueta: etiquetaCalidad({
        simbolo: f.simbolo, piotroski: f.piotroski, roic: f.roic, earningsYield: f.earningsYield,
        momentum: f.momentum, mktCap: f.mktCap, guruScore: b?.guru ? 1 : 0, datosFrescos: f.actualizadoEn > limiteFresco,
      }),
      guru: b?.guru ?? false, tecnico: b?.tecnico ?? null, volumen: b?.volumen ?? null,
    }
  })

  // Forward paper: agrupa los snapshots por cohorte y FUSIONA las que comparten la MISMA cesta.
  // Dos cohortes con los mismos valores no son dos pruebas independientes: son la misma cesta medida
  // desde dos fechas. Pintarlas como dos tarjetas con cifras idénticas se lee como doble confirmación
  // (pasó con 2026-07-18.v1 y 2026-07-20.v1: los mismos 8 valores, dos días de diferencia). Se queda la
  // más ANTIGUA —la que lleva más recorrido— y las otras fechas de arranque se citan al lado.
  const cestaDe = (version: string) => {
    const c = COHORTES_PAPER.find(x => x.version === version)
    return c ? [...c.simbolos].sort().join(',') : version
  }
  const porCesta = new Map<string, { cohorte: string; alias: string[]; filas: typeof track }>()
  for (const cohorte of [...new Set(track.map(t => t.cohorte))].sort()) {
    const clave = cestaDe(cohorte)
    const ya = porCesta.get(clave)
    if (ya) ya.alias.push(cohorte)
    else porCesta.set(clave, { cohorte, alias: [], filas: track.filter(t => t.cohorte === cohorte) })
  }
  const cohortesPaper = [...porCesta.values()].map(g => ({ ...g, ultima: g.filas[g.filas.length - 1] }))

  // 🪜 Escalera de dinero real (firmada en TRADING-HIPOTESIS-PREREGISTRO.md): evaluada sobre las
  // cohortes DEDUPLICADAS por cesta (mismo helper que el digest semanal). SIN fecha objetivo.
  const cohortesEscalera = cohortesPaper.map(({ cohorte, ultima }) => {
    // Cobertura = símbolos medidos (n del snapshot) / tamaño de la cesta congelada. Un alpha medido
    // sobre media cesta no sube tramos (enmienda de operacionalización, auditoría 11/08/2026).
    const total = COHORTES_PAPER.find(x => x.version === cohorte)?.simbolos.length
    return {
      cohorte, dias: ultima.dias,
      alphaMediana: ultima.retornoMediana != null ? ultima.retornoMediana - ultima.retornoBench : null,
      maxDrawdown: ultima.maxDrawdown, maxDrawdownBench: ultima.maxDrawdownBench,
      cobertura: total ? ultima.n / total : null,
    }
  })
  const escalera = evaluarEscalera(cohortesEscalera)
  // 🛑 Regla de apagado (firmada 15/08/2026): la contraparte de la escalera, sobre las mismas cohortes.
  const apagado = evaluarApagado(cohortesEscalera)
  const opsCerradas = emparejarOps(ordenes.map(o => ({ simbolo: o.simbolo, lado: o.lado, precio: o.precio, fecha: o.fecha.toISOString().slice(0, 10) })))
  const deslizBuys = ordenes.filter(o => o.lado === 'BUY' && o.precioDiaSiguiente != null && o.precio > 0)
  const deslizMedio = deslizBuys.length ? deslizBuys.reduce((s, o) => s + (o.precioDiaSiguiente! - o.precio) / o.precio, 0) / deslizBuys.length : null

  // Señales alcistas GANADORAS que las barreras vetaron (últimos 14 días), agrupadas por motivo.
  const limite14d = new Date(Date.now() - 14 * 86_400_000)
  const vetadasPorMotivo = new Map<string, string[]>()
  for (const t of tesis.filter(t => t.motivoBloqueo && !t.operada && t.fecha >= limite14d)) {
    const lista = vetadasPorMotivo.get(t.motivoBloqueo!) ?? []
    if (!lista.includes(t.simbolo)) lista.push(t.simbolo)
    vetadasPorMotivo.set(t.motivoBloqueo!, lista)
  }

  const ultimaPasada = tesis[0]?.fecha
  const vacio = posiciones.length === 0 && tesis.length === 0 && watchlist.length === 0
  // Página completamente virgen Y sin errores de lectura → 🌱 (con un fallo de BD NUNCA: sería
  // pintar «no hay nada» sobre un «no he podido mirar»).
  const nadaDeNada = vacio && fallos.length === 0 && !radar && universoFilas.length === 0 && cohortesPaper.length === 0
    && !(carteraReal != null && (carteraReal === 'error' || carteraReal.posiciones.length > 0))

  // 💵 Precio actual de cada posición abierta (último cierre público, Stooq→Yahoo) para poder pintar
  // la RENTABILIDAD por posición — lo que faltaba cuando se retiró la «Cartera simulada» (04/08) y lo
  // que Alberto pidió el 15/08. Best-effort con presupuesto corto: sin precio → null y se DECLARA
  // («—»), nunca un 0 ni la entrada disfrazada de precio de hoy.
  const precioAhora = new Map<string, number | null>()
  if (posiciones.length) {
    const hoyIso = new Date().toISOString().slice(0, 10)
    const desde = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
    const cierres = await Promise.all(posiciones.map(p =>
      puntosDiarios(p.simbolo, desde, hoyIso, 2500).then(s => s.at(-1)?.cierre ?? null).catch(() => null),
    ))
    posiciones.forEach((p, i) => precioAhora.set(p.simbolo, cierres[i]))
  }
  const usd = (n: number): string => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`

  // 📌 Datos del hero (las dos respuestas de la página; cero queries nuevas): cohorte de referencia
  // = la de más recorrido; interesantes = señal 📈 del top-20 + top del ranking; compras reales.
  const cohorteRef = cohortesPaper.reduce<(typeof cohortesPaper)[number] | null>(
    (max, c) => (max == null || c.ultima.dias > max.ultima.dias ? c : max), null)

  // 💶 La rentabilidad del hero, también en EUROS (Alberto piensa en euros; la cifra vivía enterrada
  // en el desplegable del forward). Misma matemática que la cartera de estudio (curvaEnEuros, puro)
  // sobre los snapshots ya leídos + UNA serie FX con presupuesto corto. Best-effort honesto: sin FX
  // real NO se pinta — un 1:1 disfrazado de euros sería mentir, y el detalle plegado ya la enseña.
  let heroEur: { valorEur: number; benchEur: number } | null = null
  if (cohorteRef) {
    const inicio = COHORTES_PAPER.find(c => c.version === cohorteRef.cohorte)?.fechaInicio
    if (inicio) {
      const fx = await puntosDiarios('EURUSD=X', inicio, new Date().toISOString().slice(0, 10), 2500).catch(() => [])
      if (fx.length) {
        const puntos = curvaEnEuros(
          CAPITAL_ESTUDIO_EUR, inicio,
          cohorteRef.filas
            .filter(f => f.retornoCesta != null && f.retornoBench != null)
            .map(f => ({ fecha: f.fecha.toISOString().slice(0, 10), retornoCesta: f.retornoCesta!, retornoBench: f.retornoBench! })),
          fx,
        )
        const ult = puntos.at(-1)
        if (ult && ult.fecha !== inicio) heroEur = { valorEur: ult.valorEur, benchEur: ult.benchEur }
      }
    }
  }
  const senalesCompra = universoExplorador
    .filter(f => f.tecnico === 'si')
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
  const topRanking = [...universoExplorador]
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .slice(0, 5)
  const comprasRecientes = compras.slice(0, 4)

  const cabecera = (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>📈 Laboratorio de inversión</h1>
        <span style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>SOLO SIMULADO · PAPER</span>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 14, fontSize: 14 }}>
        El agente estudia el mercado y opera <strong>en simulación</strong>. No toca tu cuenta real de Interactive Brokers.
        {ultimaPasada ? <> Última pasada: <strong>{fechaCorta(ultimaPasada)}</strong>.</> : null}
      </p>
      <OnboardingBanner />
    </>
  )

  if (nadaDeNada) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
        {cabecera}
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Aún no hay pasadas registradas</div>
          <div style={{ fontSize: 14 }}>Cuando el agente haga su primera pasada nocturna (temas → cantera → torneo paper) verás aquí sus ideas, la cartera simulada y el rendimiento por estrategia.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
      {cabecera}

      {fallos.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: 14, marginBottom: 18 }}>
          ⚠️ Datos parciales — no se pudo leer: {fallos.join(', ')}. Un hueco abajo significa «sin poder leer», no «no hay».
        </div>
      )}

      {/* 📌 HERO — las DOS respuestas que se vienen a buscar (Alberto, 11/08/2026): qué empresas
          interesan AHORA y cómo va la rentabilidad. La metodología y la auditoría van plegadas abajo. */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12, marginBottom: 22 }}>
        <div style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>💡 Empresas interesantes ahora</h2>
          {!radar && universoExplorador.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              El radar aún no tiene snapshot — rankea las ~500 mayores de EEUU (calidad + valor + momentum + gurús) cada lunes. Vuelve tras el próximo lunes.
            </div>
          ) : (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>📈 Señal de compra AHORA (el técnico solo se calcula para el top-20 del snapshot):</div>
              {senalesCompra.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {senalesCompra.slice(0, 8).map(f => (
                    <span key={f.simbolo} style={chipCss} title={f.nombre ?? undefined}>📈 <strong>{f.simbolo}</strong>{f.guru ? ' 🏆' : ''}</span>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>ninguna esta semana — el técnico no marca «compra ahora» en el top del radar.</div>
              )}
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>🏆 Top del ranking (la selección elige el QUÉ; 📈 confirma el CUÁNDO):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topRanking.map((f, i) => (
                  <span key={f.simbolo} style={chipCss} title={f.nombre ?? undefined}>
                    <span style={{ color: 'var(--muted)' }}>{i + 1}.</span> <strong>{f.simbolo}</strong> {ETIQ_MINI[f.etiqueta]}
                  </span>
                ))}
              </div>
              {comprasRecientes.length > 0 && (
                <div style={{ fontSize: 13, marginTop: 10 }}>
                  Últimas compras del agente (paper): <strong>{comprasRecientes.map(t => t.simbolo).join(', ')}</strong> — detalle en «💡 Ideas de compra».
                </div>
              )}
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>Busca, filtra y ordena las ~550 del universo en el 🌎 radar de abajo.</div>
            </>
          )}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>📊 Rentabilidad de la cartera <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(paper)</span></h2>
          {!cohorteRef ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              Aún sin medición: el seguimiento arranca con el cron semanal (lunes 10:00) — la cesta se congela ANTES de medir y se compara con el SPY.
            </div>
          ) : (() => {
            const u = cohorteRef.ultima
            const bate = u.retornoMediana == null ? null : u.retornoMediana > u.retornoBench
            return (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: bate == null ? 'var(--text)' : bate ? 'var(--positive)' : 'var(--negative)' }}>{pctN(u.retornoMediana)}</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>vs SPY {pct(u.retornoBench)}{bate == null ? '' : bate ? ' ✅ va mejor que el índice' : ' ⚠️ va peor que el índice'}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }} title="mediana = el valor del medio de la cesta: la mitad de las posiciones lo hace mejor y la otra mitad peor; un pelotazo suelto no la infla">mediana de la cesta congelada · {u.dias} días medidos</div>
                {heroEur && (
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    💼 Con {eurSinDecimales(CAPITAL_ESTUDIO_EUR)} simulados: <strong style={{ color: heroEur.valorEur >= CAPITAL_ESTUDIO_EUR ? 'var(--positive)' : 'var(--negative)' }}>{eur(heroEur.valorEur)}</strong> <span style={{ color: 'var(--muted)' }}>· en SPY serían {eur(heroEur.benchEur)}</span>
                  </div>
                )}
                <div style={{ margin: '8px 0' }}><CurvaForward serie={cohorteRef.filas.map(f => ({ m: f.retornoMediana, b: f.retornoBench }))} /></div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Baten al SPY {u.baten}/{u.n} · caída máx {pctN(u.maxDrawdown)} · 🪜 dinero real: <strong style={{ color: 'var(--text)' }} title={TRAMO_INFO[escalera.alcanzable]}>Tramo {escalera.alcanzable}</strong> alcanzable <span style={{ fontSize: 12 }}>({escalera.alcanzable === 1 ? '1.000€ de prueba, tu decisión' : escalera.alcanzable === 2 ? 'hasta 3.000€, tu decisión' : 'hasta 6.000€, tu decisión'})</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                  {cohortesPaper.length > 1 ? `Cohorte con más recorrido (de ${cohortesPaper.length}); todas` : 'La única cohorte; el detalle'}, la cartera de estudio (30.000€ simulados) y la escalera, en «🧪 Forward paper» abajo.
                </div>
              </>
            )
          })()}
        </div>
      </section>

      {/* 💼 CARTERA REAL (IBKR) — lo que Alberto tiene comprado DE VERDAD, con su P&L. Petición del
          17/08/2026 («hemos hecho compra en IBKR y no aparece»): hasta hoy la cartera real solo salía
          en el Telegram de la pasada diaria. La foto la empuja esa pasada vía POST /api/trading/cartera
          (la app no habla con IBKR); aquí solo se pinta la última conocida. Solo con SESIÓN (la vista
          de invitado no recibe la prop). Estados: undefined = invitado (nada) · null = IBKR nunca
          sincronizado («pendiente», no «vacía») · posiciones [] = leída y sin posiciones. */}
      {carteraReal !== undefined && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>
            💼 Cartera real — Interactive Brokers{' '}
            <span style={{ background: 'var(--positive-bg, var(--surface))', color: 'var(--positive)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700, verticalAlign: 'middle' }}>DINERO REAL · SOLO LECTURA</span>
          </h2>
          {carteraReal === 'error' ? (
            <div style={{ ...card, borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: 14 }}>
              ⚠️ No se pudo leer la cartera real guardada — esto es un fallo de lectura, NO significa que
              no tengas posiciones. Tu cartera sigue en la app de Interactive Brokers.
            </div>
          ) : carteraReal == null ? (
            <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
              Aún sin sincronizar con IBKR: la pasada nocturna del agente lee tus posiciones (solo lectura)
              y las empuja aquí. Mientras tanto, tu cartera está en la app de Interactive Brokers — esto no
              significa que no tengas posiciones.
            </div>
          ) : carteraReal.posiciones.length === 0 ? (
            <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
              IBKR leído el {fechaCorta(carteraReal.actualizado)}: sin posiciones abiertas en la cuenta.
            </div>
          ) : (
            <>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                  <thead><tr><th style={th}>Posición</th><th style={th}>Cantidad</th><th style={th} title="coste medio por unidad, en la divisa de la posición">Precio medio</th><th style={th} title="precio de mercado del último refresco (la pasada diaria del agente); «—» = IBKR no lo dio, no un 0">Precio</th><th style={th}>Valor</th><th style={th} title="plusvalía/minusvalía NO realizada según IBKR, sobre el coste">Resultado</th></tr></thead>
                  <tbody>
                    {carteraReal.posiciones.map(p => {
                      const ret = rentabilidadPosicion(p)
                      return (
                        <tr key={p.simbolo}>
                          <td style={{ ...td, fontWeight: 700 }}>{p.simbolo}{p.descripcion ? <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}> — {p.descripcion}</span> : null}</td>
                          <td style={td}>{p.cantidad.toLocaleString('es-ES')}</td>
                          <td style={td}>{p.precioMedio != null ? dinero(p.precioMedio, p.divisa) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={td}>{p.precioActual != null ? dinero(p.precioActual, p.divisa) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={td}>{p.valorMercado != null ? dinero(p.valorMercado, p.divisa) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ ...td, fontWeight: 700, color: p.pnlNoRealizado == null ? 'var(--muted)' : p.pnlNoRealizado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {p.pnlNoRealizado != null ? <>{p.pnlNoRealizado >= 0 ? '+' : ''}{dinero(p.pnlNoRealizado, p.divisa)}{ret != null ? ` (${pct(ret)})` : ''}</> : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                {resumenPorDivisa(carteraReal.posiciones).map(r => (
                  <span key={r.divisa}>
                    Total {r.divisa}{r.completo ? '' : ' (parcial — a alguna posición le falta un dato)'}: {r.invertido != null ? <>invertido {dinero(r.invertido, r.divisa)} → </> : null}
                    {r.valor != null ? <strong style={{ color: r.pnl == null ? 'var(--text)' : r.pnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{dinero(r.valor, r.divisa)}</strong> : '—'}
                    {r.pnl != null ? <> ({r.pnl >= 0 ? '+' : ''}{dinero(r.pnl, r.divisa)})</> : null}
                    {' · '}
                  </span>
                ))}
                Última lectura de IBKR: <strong>{fechaCorta(carteraReal.actualizado)}</strong> — la refresca la pasada diaria del agente
                (solo lectura; el agente jamás ejecuta órdenes). Los importes van en la divisa de cada posición, sin mezclar divisas.
              </p>
            </>
          )}
        </section>
      )}

      {/* ❓ Glosario plegado — la página usa términos que no se explican en ningún otro sitio;
          traducirlos UNA vez aquí evita que cada sección cargue con su propia chuleta. */}
      <details style={{ ...card, padding: '10px 16px', marginBottom: 22 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          ❓ Cómo leer esta página <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(qué significa cada término, en cristiano)</span>
        </summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {GLOSARIO.map(([termino, texto]) => (
            <li key={termino}><strong>{termino}</strong> — <span style={{ color: 'var(--muted)' }}>{texto}</span></li>
          ))}
        </ul>
      </details>

      {/* 📦 CARTERA PAPER — las posiciones ABIERTAS con su rentabilidad EN VIVO. Vuelve (15/08/2026,
          petición de Alberto: «¿solo hay comprada ORCL? tampoco indica la rentabilidad por acción») lo
          que la «Cartera simulada» retirada el 04/08 no tenía: el precio de AHORA y el P&L. Además es
          la explicación de los vetos «posición ya abierta» de abajo: el agente no duplica compras. */}
      {posiciones.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>📦 Cartera paper — {posiciones.length} posiciones abiertas <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>— qué tiene comprado el agente AHORA (simulado) y cómo va cada una</span></h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead><tr><th style={th}>Símbolo</th><th style={th}>Abierta</th><th style={th}>Cantidad</th><th style={th}>Entrada</th><th style={th} title="último cierre público (Stooq→Yahoo); «—» = sin precio ahora mismo, no un 0">Precio ahora</th><th style={th}>Rentabilidad</th></tr></thead>
              <tbody>
                {posiciones.map(p => {
                  const px = precioAhora.get(p.simbolo) ?? null
                  const ret = px != null && p.precioEntrada > 0 ? px / p.precioEntrada - 1 : null
                  return (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.simbolo}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{fechaCorta(p.abiertaEn)}</td>
                      <td style={td}>{p.cantidad}</td>
                      <td style={td}>{usd(p.precioEntrada)}</td>
                      <td style={td}>{px != null ? usd(px) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ ...td, fontWeight: 700, color: ret == null ? 'var(--muted)' : ret >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{pctN(ret)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {(() => {
            const conPrecio = posiciones.filter(p => (precioAhora.get(p.simbolo) ?? null) != null && p.precioEntrada > 0)
            const invertido = conPrecio.reduce((s, p) => s + p.cantidad * p.precioEntrada, 0)
            const ahora = conPrecio.reduce((s, p) => s + p.cantidad * (precioAhora.get(p.simbolo) as number), 0)
            const completo = conPrecio.length === posiciones.length
            return (
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                {invertido > 0 && (
                  <>Total{completo ? '' : ` (${conPrecio.length}/${posiciones.length} con precio — parcial, no la cartera entera)`}: invertido {usd(invertido)} → ahora <strong style={{ color: ahora >= invertido ? 'var(--positive)' : 'var(--negative)' }}>{usd(ahora)}</strong> ({pct(ahora / invertido - 1)}) · </>
                )}
                Valorada con el último cierre público; «—» = sin precio ahora mismo (no un 0). Estas posiciones son la razón de los vetos «posición ya abierta»: el agente no duplica compras. La salida es por TIEMPO al vencer la ventana de cada tesis (regla firmada: los stops empeoran, H9).
              </p>
            )
          })()}
        </section>
      )}

      {/* 💡 Ideas de COMPRA — SOLO compras REALES (petición de Alberto 20/07: «aquí solo interesan las de
          comprar»; auditoría 21/07: `operada`=la señal ganadora del torneo que pasó las barreras y el agente
          compró en paper). Antes se listaba TODA señal alcista en bruto → salían nombres cuyo torneo ganó
          bajista o que las barreras vetaron, contradiciendo la tarjeta «Analiza una acción». El histórico
          completo (bajistas/neutrales/no operadas) sigue en BD (trading_tesis). */}
      {(() => {
        const hayAlcistas = compras.length > 0 || tesis.some(t => t.direccion === 'alcista')
        // Sin compras reales y sin ningún histórico alcista → nada que contar (el onboarding cubre el vacío).
        if (!compras.length && !hayAlcistas) return null
        // Hay señales alcistas pero el agente NO ha comprado ninguna (torneo ganado por otra dirección o
        // barreras que vetaron): estado honesto en vez de listar señales que no se compraron.
        if (!compras.length) {
          return (
            <section style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, marginBottom: 8 }}>💡 Ideas de compra del agente</h2>
              <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
                El agente aún no ha abierto ninguna compra en paper. Hubo señales alcistas sueltas, pero no ganaron
                el torneo de su valor o las barreras de riesgo las vetaron, así que no se compraron. Las señales en
                bruto (incl. bajistas/neutrales) quedan en el histórico.
                {vetadasPorMotivo.size > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    {[...vetadasPorMotivo.entries()].map(([motivo, simbolos]) => (
                      <li key={motivo}><strong style={{ color: 'var(--text)' }}>{simbolos.join(', ')}</strong> — {motivo}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )
        }
        const subtitulo = compras.length === 1 ? 'la compra simulada más reciente' : `las ${compras.length} compras simuladas más recientes`
        return (
          <section style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 17, marginBottom: 8 }}>💡 Ideas de compra del agente <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>— ¿qué ha comprado en paper? ({subtitulo})</span></h2>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                <thead><tr><th style={th}>Fecha</th><th style={th}>Símbolo</th><th style={th} title="qué regla del torneo interno ganó y motivó la compra">Estrategia</th><th style={th} title="convicción de la señal, de 0 a 100 (ajustada por el acierto real histórico de cada estrategia)">Confianza</th><th style={th} title="se rellena al vencer la ventana de la tesis (walk-forward) — «pendiente» = aún midiéndose, no un fallo">Resultado</th></tr></thead>
                <tbody>
                  {compras.map(t => (
                    <tr key={t.id}>
                      <td style={{ ...td, color: 'var(--muted)' }}>{fechaCorta(t.fecha)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{t.simbolo}</td>
                      <td style={td}>{ESTRATEGIA_LABEL[t.estrategia] ?? t.estrategia}</td>
                      <td style={td}>{t.confianza}<span style={{ color: 'var(--muted)' }}>/100</span></td>
                      <td style={td}>{t.resultado ? <span style={{ color: t.resultado.acierto ? 'var(--positive)' : 'var(--negative)' }}>{t.resultado.acierto ? '✓' : '✗'} {pct(t.resultado.retorno)}</span> : <span style={{ color: 'var(--muted)' }}>pendiente</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Solo compras REALES en paper: la señal que ganó el torneo de su valor y pasó las barreras de riesgo. El resultado se rellena a posteriori (walk-forward). El histórico completo (señales en bruto, incl. bajistas/neutrales) queda guardado.</p>
            {vetadasPorMotivo.size > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>🚧 Señales ganadoras vetadas por las barreras (últimos 14 días)</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>
                  {[...vetadasPorMotivo.entries()].map(([motivo, simbolos]) => (
                    <li key={motivo}><strong style={{ color: 'var(--text)' }}>{simbolos.join(', ')}</strong> — {motivo}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )
      })()}

      {/* Forward paper — la prueba limpia (sin look-ahead) que decide el paso a dinero real. El
          TITULAR vive en el hero; aquí el detalle completo, PLEGADO con montaje perezoso (la cartera
          de estudio hace fetch de precios + Recharts: solo lo paga quien la abre). */}
      <DetallePerezoso
        style={{ marginBottom: 22 }}
        resumen={<>🧪 Forward paper — detalle <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>— ¿funciona el método? La prueba limpia que decide el dinero real (cestas congeladas vs SPY · la MEDIANA decide · cartera de estudio 30.000€ · 🪜 escalera)</span></>}
      >
        <div style={{ marginTop: 10 }}>
        <CarteraEstudio />
        {cohortesPaper.length === 0 ? (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            El seguimiento arranca con el <strong>cron semanal</strong> (lunes 10:00): cada snapshot mide la cesta congelada frente al SPY y se guarda aquí para dibujar la curva. Aún sin puntos — vuelve tras el primer lunes.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {cohortesPaper.map(({ cohorte, alias, filas, ultima }) => {
              const bateMed = ultima.retornoMediana != null && ultima.retornoMediana > ultima.retornoBench
              return (
                <div key={cohorte} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{cohorte}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{ultima.dias} días · {filas.length} snapshot{filas.length === 1 ? '' : 's'}</span>
                  </div>
                  {alias.length > 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                      Misma cesta que {alias.join(', ')} — es UNA prueba, no {alias.length + 1}.
                    </div>
                  )}
                  <div style={{ margin: '10px 0' }}><CurvaForward serie={filas.map(f => ({ m: f.retornoMediana, b: f.retornoBench }))} /></div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                    <div>Cesta (MEDIANA): <strong style={{ color: bateMed ? 'var(--positive)' : 'var(--negative)' }}>{pctN(ultima.retornoMediana)}</strong> {bateMed ? '✅' : '⚠️'} <span style={{ color: 'var(--muted)' }}>vs SPY {pct(ultima.retornoBench)}</span></div>
                    <div style={{ color: 'var(--muted)' }}>Baten al SPY: {ultima.baten}/{ultima.n} · media {pct(ultima.retornoCesta)}</div>
                    <div style={{ color: 'var(--muted)' }}>Riesgo — caída máx {pctN(ultima.maxDrawdown)} · vol {pct0N(ultima.volAnual)} · TE {pct0N(ultima.trackingError)}</div>
                    {ultima.medianaBase != null && (
                      <div style={{ color: 'var(--muted)' }}>Filtro calidad: base {pct(ultima.medianaBase)} → aporta <strong style={{ color: (ultima.retornoMediana ?? 0) - ultima.medianaBase > 0 ? 'var(--positive)' : 'var(--negative)' }}>{pctN(ultima.retornoMediana != null ? ultima.retornoMediana - ultima.medianaBase : null)}</strong></div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
          Sin look-ahead: las cestas se congelan ANTES de medir. No es veredicto hasta acumular semanas/meses; si la mediana bate al SPY sostenida, entre cohortes y ajustada a riesgo → recién ahí la conversación de dinero real.
        </p>

        {/* 🪜 Escalera de dinero real — requisitos FIRMADOS en docs/TRADING-HIPOTESIS-PREREGISTRO.md
            («escalera de tramos», 05/08/2026). SIN fecha objetivo: la suben las señales, no el
            calendario (Alberto, 05/08/2026). Cada tramo es una decisión SEPARADA de Alberto y la
            orden la ejecuta SIEMPRE él a mano — el agente jamás opera en IBKR. */}
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>🪜 Escalera de dinero real — escalón alcanzable: <span style={{ color: escalera.alcanzable === 3 ? 'var(--positive)' : escalera.alcanzable === 2 ? 'var(--warning)' : 'var(--text)' }}>Tramo {escalera.alcanzable}</span></strong>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>la suben las señales, no el calendario — sin fecha objetivo · techo 6.000€ hasta validar</span>
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {escalera.tramos.map(t => (
              <li key={t.tramo} style={{ color: t.ok ? 'var(--text)' : 'var(--muted)' }}>
                {t.ok ? '✅' : '⬜'} <strong>{t.titulo}</strong> — <span style={{ color: 'var(--muted)' }}>{t.detalle}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {deslizMedio != null ? <>Deslizamiento señal→día sig.: <strong>{pct(deslizMedio)}</strong> (n={deslizBuys.length}) · </> : null}
            Ops cerradas del sistema de señales: <strong>{opsCerradas.length}</strong>{opsCerradas.length ? <> · retorno medio <strong>{pct(opsCerradas.reduce((s, o) => s + o.retorno, 0) / opsCerradas.length)}</strong></> : null}.
            Cada tramo es una decisión separada de Alberto; el agente jamás ejecuta órdenes reales. Congelador H6: si SPY cierra un mes bajo su media de 10 meses, la escalera se congela.
          </p>
          {/* 🛑 La contraparte de la escalera (firmada 15/08/2026): cuándo CERRAR el experimento. */}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: apagado.evaluable && apagado.apagar ? 'var(--negative)' : 'var(--muted)' }}>
            🛑 <strong>Regla de apagado</strong> <span title="firmada en el pre-registro el 15/08/2026: al año de la cesta más vieja, con 3 cestas distintas, si no baten al SPY por mediana al menos 2/3 → capital a ETF global y escalera cerrada">(cuándo cerrar el experimento)</span>: {apagado.detalle}
          </p>
        </div>
        </div>
      </DetallePerezoso>

      {/* 🔍 Buscador de análisis por acción (determinista, mismos ojos del radar) — herramienta bajo demanda */}
      <AnalisisSimbolo />

      {/* Radar del mercado — ranking semanal del universo S&P 500 (caché trading_universo). El
          caza-cohetes va PLEGADO (satélite lotería, secundario). */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>🌎 Radar del mercado <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>— ¿qué empresas vigila y cuáles salen mejor? (las ~550 mayores de EEUU, rankeadas cada lunes; la selección elige el QUÉ, 📈 el CUÁNDO)</span></h2>
        {!radar ? (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            El radar rankea las ~500 mayores de EEUU cada lunes (calidad + valor + momentum + gurús). Aún sin snapshot — la caché de fundamentales se está llenando; primer ranking el próximo lunes.
          </div>
        ) : (() => {
          type Track = { evals: { fecha: string; dias: number; mediana: number | null; retornoBench: number; baten: number; n: number }[]; ventanas: number; bateVentanas: number; cohetes?: { evals: unknown[]; ventanas: number; bateVentanas: number } }
          type CoheteUi = { simbolo: string; nombre: string | null; momentum: number | null; piotroski: number | null; roic: number | null; sobreSmaSem: boolean | null; sobreSmaMes: boolean | null; confirmado: boolean; mesesCotizando?: number | null }
          const cohetes = (radar.cohetes as unknown as CoheteUi[] | null) ?? []
          const track = radar.trackRecord as unknown as Track | null
          const salud = radar.salud as unknown as { total: number; frescas: number; errores: number } | null
          return (
            <>
              {/* La tabla del ranking vive UNIFICADA en el explorador de abajo (orden por score del
                  modelo por defecto) — aquí solo el satélite 🎯 (plegado) y el pie con snapshot/track/salud. */}
              {cohetes.length > 0 && (
                <details style={{ ...card, marginTop: 10, padding: '10px 16px' }}>
                  <summary style={{ fontWeight: 700, cursor: 'pointer' }}>🎯 Caza-cohetes ({cohetes.length}) <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>(screener LOTERÍA — momentum alto + calidad mala; alimenta la 🚀 Cartera cohetes, nunca entra en cohortes)</span></summary>
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                      <thead><tr><th style={th}>Empresa</th><th style={th}>Momentum</th><th style={th}>Piotroski</th><th style={th}>ROIC</th><th style={th}>Medias (sem/mes)</th></tr></thead>
                      <tbody>
                        {cohetes.map(c => (
                          <tr key={c.simbolo}>
                            <td style={{ ...td, fontWeight: 700 }}>{c.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {c.nombre ?? '¿?'}</span>{c.mesesCotizando != null ? <span style={{ color: 'var(--warning)', fontSize: 12, marginLeft: 6 }}>🆕 ~{c.mesesCotizando}m en bolsa</span> : null}</td>
                            <td style={td}>{c.momentum != null ? `+${(c.momentum * 100).toFixed(0)}%` : '—'}</td>
                            <td style={td}>{c.piotroski ?? '—'}</td>
                            <td style={td}>{c.roic != null ? `${(c.roic * 100).toFixed(0)}%` : '—'}</td>
                            <td style={td}>{c.confirmado ? '✅ sobre SMA30sem + SMA12mes' : `${c.sobreSmaSem === true ? '✓' : c.sobreSmaSem === false ? '✗' : '?'} / ${c.sobreSmaMes === true ? '✓' : c.sobreSmaMes === false ? '✗' : '?'}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {track?.cohetes ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                      Track 🎯: {track.cohetes.ventanas > 0 ? `${track.cohetes.bateVentanas}/${track.cohetes.ventanas} ventanas baten al SPY` : 'acumulando historial'}
                    </div>
                  ) : null}
                </details>
              )}
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                Snapshot del {fechaCorta(radar.fecha)} · universo {radar.universoTotal} ({radar.conDatos} con datos)
                {salud ? <> · salud: {salud.frescas}/{salud.total} frescos, {salud.errores} con error</> : null}
                {track && track.evals.length > 0
                  ? <> · track record: {track.bateVentanas}/{track.ventanas} ventanas baten al SPY ({track.evals.map(ev => `${Math.round(ev.dias / 7)}sem ${pct(ev.mediana ?? 0)} vs ${pct(ev.retornoBench)}`).join(' · ')})</>
                  : <> · track record: acumulando historial</>}
              </p>
            </>
          )
        })()}
        {universoExplorador.length > 0 && <RadarExplorador filas={universoExplorador} />}
        {anomalias.length > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            🛡️ Datos imposibles NEUTRALIZADOS (no puntúan ese factor): {anomalias.slice(0, 5).map(a => `${a.simbolo} ${a.campo} (${a.motivo})`).join(' · ')}{anomalias.length > 5 ? ` · +${anomalias.length - 5} más` : ''}
          </p>
        )}
      </section>

      {/* 🚀 Cartera cohetes — bolsillo APARTE (lotería, paper): rota semanal a los cohetes confirmados y
          se valora a diario vs SPY + curva del núcleo. SOLO estudio, nunca entra en cohortes/núcleo.
          Plegada (secundaria): el resumen enseña la cifra sin abrir. */}
      <DetallePerezoso
        style={{ marginBottom: 22 }}
        resumen={<>🚀 Cartera cohetes <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(lotería · 30.000€ simulados, bolsillo aparte)</span>{carteraCohetes ? <> — {eur(carteraCohetes.valorEur)} <span style={{ color: carteraCohetes.plPct != null && carteraCohetes.plPct >= 0 ? 'var(--positive)' : carteraCohetes.plPct != null ? 'var(--negative)' : 'var(--muted)' }}>{pctN(carteraCohetes.plPct)}</span></> : null}</>}
      >
        <CarteraCohetes data={carteraCohetes} />
      </DetallePerezoso>

      {/* (El grid de contadores «Pulso» se retiró el 20/07/2026 — petición de Alberto de página más
          simple y corta: eran 4 números sin acción posible; el detalle vive en sus secciones.) */}

      {/* (💼 «Cartera simulada» RETIRADA el 04/08/2026 — petición de Alberto «quítame el ruido que no me
          da números reales»: la tabla listaba entrada/stop/cantidad SIN ningún resultado. El 15/08/2026
          VOLVIÓ como «📦 Cartera paper» (arriba) exactamente con lo que le faltaba: precio actual y
          rentabilidad por posición — no re-crear una segunda tabla de posiciones sin P&L.) */}

      {/* (📊 «Rendimiento por estrategia» RETIRADA el 04/08/2026 — misma petición. Su «retorno medio»
          NO era dinero: es el retorno HIPOTÉTICO de seguir cada señal del torneo interno (la bajista
          "gana" si el valor cae, la neutral cuenta 0), medido sobre las señales que el propio agente
          generó. Un número que sube sin que nadie compre nada, y que se leía como rentabilidad. Los
          datos siguen en BD `trading_estrategia_stats` si hace falta auditarlos.) */}

      {/* Watchlist — PLEGADA (secundaria) */}
      {watchlist.length > 0 && (
        <details style={{ marginBottom: 22 }}>
          <summary style={{ fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>👀 Watchlist ({watchlist.length}) <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>— los valores que el agente sigue de cerca (A ancla · B conocidos · C cantera)</span></summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {watchlist.map(w => (
              <span key={w.id} title={CAPA_LABEL[w.capa] ?? w.capa} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>
                <strong>{w.simbolo}</strong> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{w.capa}</span>
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
