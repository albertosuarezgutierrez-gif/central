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
