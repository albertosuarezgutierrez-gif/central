// lib/domotica/meteo.ts — temperatura ACTUAL en Sevilla vía Open-Meteo (gratis, sin API key).
// Fail-safe: si la meteo no responde, el programador NO enciende (null ≠ hace calor).
const URL_SEVILLA =
  'https://api.open-meteo.com/v1/forecast?latitude=37.39&longitude=-5.99&current=temperature_2m'

export function extraerTemperatura(json: unknown): number | null {
  const t = (json as { current?: { temperature_2m?: unknown } } | null)?.current?.temperature_2m
  return typeof t === 'number' && Number.isFinite(t) ? t : null
}

export async function temperaturaSevilla(): Promise<number | null> {
  try {
    const res = await fetch(URL_SEVILLA, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    return extraerTemperatura(await res.json())
  } catch {
    return null
  }
}
