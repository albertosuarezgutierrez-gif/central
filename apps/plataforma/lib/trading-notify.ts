// Formatea el resumen de una pasada del agente de trading para Telegram.
// Importes en formato español con eur() (aunque la cuenta sea multi-divisa, mostramos EUR).
import { eur } from './dinero.ts'

type Idea = { simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string }

export function resumenPasada(fecha: string, navEur: number, top: Idea[]): string {
  const lineas = top.map(i =>
    `• ${i.simbolo} — ${i.direccion} (${i.estrategia}, conf ${i.confianza})` +
    (i.operada ? ' ✅ paper' : i.motivo ? ` ⛔ ${i.motivo}` : ''))
  return [
    `📊 Trading-analista · ${fecha}`,
    `NAV paper base: ${eur(navEur)}`,
    '',
    ...(lineas.length ? lineas : ['Sin ideas accionables hoy.']),
  ].join('\n')
}

// Aviso INMEDIATO de una compra paper (una posición recién abierta). El precio es de la acción (USD),
// así que NO usa eur() — solo el % sobre el NAV es una referencia relativa. Deja claro que es simulado.
export type CompraPaper = { simbolo: string; cantidad: number; precio: number; estrategia: string; confianza: number; stop: number; pctNav?: number }

export function mensajeCompraPaper(fecha: string, o: CompraPaper): string {
  const pct = o.pctNav != null ? ` · ~${Math.round(o.pctNav * 100)}% NAV` : ''
  return [
    `🟢 <b>COMPRA PAPER</b> · ${o.simbolo}`,
    `${o.cantidad} acc @ ${o.precio.toFixed(2)} USD${pct}`,
    `${o.estrategia} · conf ${o.confianza} · stop ${o.stop.toFixed(2)}`,
    `<i>${fecha} · SOLO simulado, ninguna orden real en IBKR</i>`,
  ].join('\n')
}
