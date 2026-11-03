// Avisos de Telegram del CUADRE mensual de comisiones (cron `cima-liq`). PURO: sin BD, red ni reloj
// (`hoy` se inyecta). `node --test lib/correduria/cuadre-avisos.test.ts`.
//
// Por compañía, sobre las filas del libro (`comisiones_devengo`) ya cuadradas:
//   (a) 🔴 devengado/liquidado y SIN abono en el banco tras más de 60 días del cierre del periodo;
//   (b) 🔴 neto liquidado (remesa) contra el abono del banco con diferencia > 5 €;
//   (c) ℹ️ abono en el banco sin ninguna liquidación (ni CIMA ni PDF): aviso suave;
//   (d) 🔴 aritmética del extracto: bruto − retención ≠ remesa (el `descuadra` interno de `estadoCuadre`).
// Antes el cron mandaba un mensaje CADA DÍA con todo lo que no cuadraba (incluido lo recién liquidado
// que aún no había tenido tiempo de cobrarse). Ahora: una alerta por compañía y tipo, con clave
// estable, y el cron las pasa por `decidirEnvios` (`fiscal_avisos_enviados`): el mismo contenido no se
// repite en 7 días (30 los suaves); si el contenido cambia, es un aviso nuevo.
//
// 🚨 Una fila con `leidoOk = false` no avisa de nada: «no se ha podido mirar» no es «no te han pagado».
import { eur } from '../dinero.ts'
import { remesaEfectiva, brutoEfectivo, TOLERANCIA_ARITMETICA } from './cuadre.ts'

export const DIAS_SIN_ABONO = 60
export const TOLERANCIA_AVISO_BANCO = 5
/** Máximo de periodos listados por aviso (el resto se cuenta). */
const MAX_LINEAS = 6

export interface PeriodoAviso {
  codigo: string
  compania: string
  inicio: string
  fin: string
  leidoOk: boolean
  esperadoBruto: number | null
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  bancoTotal: number | null
  /** `'cima'` | `'pdf'` | `'manual'` | null. Solo para decirlo en el aviso. */
  liqOrigen: string | null
}

export interface AlertaComisiones {
  clave: string
  texto: string
  /** true = aviso suave (se repite como mucho cada 30 días). */
  suave: boolean
}

const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const dinero = (n: number | null) => (n == null ? '—' : eur(n))

function diasEntre(desde: string, hasta: string): number {
  return Math.floor((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

function lista(lineas: string[]): string {
  const vis = lineas.slice(0, MAX_LINEAS)
  const resto = lineas.length - vis.length
  return vis.join('\n') + (resto > 0 ? `\n  … y ${resto} periodo(s) más` : '')
}

export function alertasCuadreComisiones(periodos: readonly PeriodoAviso[], hoy: string): AlertaComisiones[] {
  const porCompania = new Map<string, PeriodoAviso[]>()
  for (const p of periodos) {
    if (!p.leidoOk) continue
    const arr = porCompania.get(p.codigo) ?? []
    arr.push(p)
    porCompania.set(p.codigo, arr)
  }

  const alertas: AlertaComisiones[] = []
  for (const [codigo, ps] of [...porCompania.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordenados = [...ps].sort((a, b) => a.inicio.localeCompare(b.inicio))
    const nombre = ordenados[0].compania

    // (a) Sin abono > 60 días: hay algo que cobrar (devengo o liquidación positivos) y el banco no lo trae.
    const sinAbono = ordenados.filter(p => {
      if (p.bancoTotal != null) return false
      const liq = brutoEfectivo(p.liqBruto, p.liqRemesa)
      const algo = (p.esperadoBruto != null && p.esperadoBruto > 0) || (liq != null && liq > 0)
      return algo && diasEntre(p.fin, hoy) > DIAS_SIN_ABONO
    })
    if (sinAbono.length) {
      alertas.push({
        clave: `comisiones-sin-abono-${codigo}`,
        suave: false,
        texto: `🔴 <b>Comisiones · ${nombre}</b> — devengadas y SIN abono en el banco tras más de ${DIAS_SIN_ABONO} días:\n` +
          lista(sinAbono.map(p => `• ${fechaEs(p.inicio)} → ${fechaEs(p.fin)}: devengado ${dinero(p.esperadoBruto)} · liquidado ${dinero(brutoEfectivo(p.liqBruto, p.liqRemesa))}`)) +
          `\nReclámalo a la compañía o revisa el casado en <b>/correduria</b>.`,
      })
    }

    // (b) Neto liquidado vs banco del periodo, diferencia > 5 €.
    const descuadres = ordenados.filter(p => {
      const remesa = remesaEfectiva(p.liqBruto, p.liqRetencion, p.liqRemesa)
      return remesa != null && p.bancoTotal != null && Math.abs(remesa - p.bancoTotal) > TOLERANCIA_AVISO_BANCO
    })
    if (descuadres.length) {
      alertas.push({
        clave: `comisiones-descuadre-${codigo}`,
        suave: false,
        texto: `🔴 <b>Comisiones · ${nombre}</b> — el neto liquidado no casa con el banco (más de ${eur(TOLERANCIA_AVISO_BANCO)}):\n` +
          lista(descuadres.map(p => {
            const remesa = remesaEfectiva(p.liqBruto, p.liqRetencion, p.liqRemesa) as number
            const dif = Math.round(((p.bancoTotal as number) - remesa) * 100) / 100
            return `• ${fechaEs(p.inicio)} → ${fechaEs(p.fin)}: neto ${eur(remesa)}${p.liqOrigen === 'pdf' ? ' (PDF)' : ''} · banco ${eur(p.bancoTotal as number)} · diferencia ${eur(dif)}`
          })) +
          `\nRevísalo en <b>/correduria</b>.`,
      })
    }

    // (c) Abono sin liquidación: entró dinero que ninguna fuente explica. Suave.
    const sinLiq = ordenados.filter(p => p.bancoTotal != null && p.bancoTotal > 0 && p.liqBruto == null)
    if (sinLiq.length) {
      alertas.push({
        clave: `comisiones-abono-sin-liq-${codigo}`,
        suave: true,
        texto: `ℹ️ <b>Comisiones · ${nombre}</b> — abonos en el banco sin liquidación (ni CIMA ni PDF) que los explique:\n` +
          lista(sinLiq.map(p => `• ${fechaEs(p.inicio)} → ${fechaEs(p.fin)}: banco ${eur(p.bancoTotal as number)} · devengado ${dinero(p.esperadoBruto)}`)) +
          `\nSi la compañía manda su liquidación por correo, el agente de facturas la recogerá sola.`,
      })
    }

    // (d) Aritmética interna del extracto: solo con importes completos (bruto y remesa). La convención de
    // Occident (bruto negativo, remesa 0) no es un descuadre: la casa el banco en (b).
    const malSumados = ordenados.filter(p => {
      if (p.liqBruto == null || p.liqRemesa == null) return false
      if (p.liqBruto < 0 && p.liqRemesa === 0) return false
      return Math.abs(p.liqBruto - (p.liqRetencion ?? 0) - p.liqRemesa) > TOLERANCIA_ARITMETICA
    })
    if (malSumados.length) {
      alertas.push({
        clave: `comisiones-aritmetica-${codigo}`,
        suave: false,
        texto: `🔴 <b>Comisiones · ${nombre}</b> — el extracto no cuadra consigo mismo (bruto − retención ≠ remesa):\n` +
          lista(malSumados.map(p => {
            const esperada = Math.round(((p.liqBruto as number) - (p.liqRetencion ?? 0)) * 100) / 100
            return `• ${fechaEs(p.inicio)} → ${fechaEs(p.fin)}: bruto ${eur(p.liqBruto as number)} − retención ${dinero(p.liqRetencion)} = ${eur(esperada)}, pero la remesa dice ${eur(p.liqRemesa as number)}${p.liqOrigen === 'pdf' ? ' (PDF)' : ''}`
          })) +
          `\nRevisa el extracto en <b>/correduria</b>.`,
      })
    }
  }
  return alertas
}
