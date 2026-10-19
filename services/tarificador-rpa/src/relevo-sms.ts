// RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026, decisión de Alberto; Generali = Okta «Autenticación por SMS»).
//
//   worker: pantalla SMS → genera un par X25519 EN MEMORIA → POST /api/tarificador/codigo-sms {trabajoId, clavePublica}
//           (asegura apunta la petición y alarga el lease) → «Enviar» (si hace falta, por el guard) → sondea
//           GET /api/tarificador/codigo-sms/<trabajo> cada 4 s, con tope de 5 min.
//   plataforma (cron cada minuto) avisa por Telegram «Generali pide el código SMS que te acaba de llegar: respóndeme con el
//           código»; Alberto contesta; el webhook (solo TELEGRAM_CHAT_ID) lo entrega a asegura, que lo SELLA con la pública del
//           worker (nunca en claro) y lo borra al recogerlo (un uso).
//   worker: abre el sello con su privada → escribe el código, marca «No volver a solicitar en este dispositivo en 30 días» y
//           pulsa «Verificar» (guard.ts) → el runner guarda el estado del navegador en la bóveda (30 días) y repite el intento.
//
// 🔑 El código: solo en memoria (`CodigoSms`, que no se serializa), solo a su campo y se vacía de la pantalla si la
//    verificación falla (la captura y el HTML de evidencia no lo llevan). Nunca a logs, mensajes, errores ni resultado.
// Sin código a tiempo / canal caído / código rechazado → `ErrorVerificacionHumana` (requiere_humano) con el motivo claro.

import { inspect } from 'node:util'
import type { Page } from 'playwright'
import { ParCodigoSms, selloCodigoSmsValido } from '@central/module-tarificacion/servidor'
import { ErrorVerificacionHumana, type ErrorTarificador } from './errores.ts'
import { textoAvisoCodigoSms } from './aviso.ts'
import { esUrlOktaSmsGenerali, pulsarEnviarSmsGenerali, vaciarCodigoSmsGenerali, verificarCodigoSmsGenerali, type GuardEmision } from './guard.ts'

/** Tope de espera del código (Okta lo invalida a los pocos minutos; asegura lo guarda como mucho 10). */
export const ESPERA_CODIGO_MS = 5 * 60_000
export const SONDEO_CODIGO_MS = 4_000
/** Tras «Verificar», lo que se espera a salir de la pantalla del SMS. */
const ESPERA_VERIFICAR_MS = 30_000

/** El código abierto: solo en memoria; `toJSON`/`inspect` lo tapan. */
export class CodigoSms {
  readonly #valor: string
  constructor(valor: string) {
    this.#valor = valor
  }
  get valor(): string {
    return this.#valor
  }
  toJSON(): string {
    return '[codigo-sms]'
  }
  toString(): string {
    return '[codigo-sms]'
  }
  [inspect.custom](): string {
    return '[codigo-sms]'
  }
}

export type RespuestaPedir = { estado: 'pedido'; leaseHasta: string | null } | { estado: 'no_disponible'; motivo: string }
export type RespuestaRecoger =
  | { estado: 'listo'; sello: string; leaseHasta: string | null }
  | { estado: 'esperando' }
  /** La petición ya no vale (caducada, sin petición, trabajo cerrado): no tiene sentido seguir esperando. */
  | { estado: 'fin'; motivo: string }

export interface PuertoCodigoSms {
  pedir(clavePublica: string): Promise<RespuestaPedir>
  recoger(): Promise<RespuestaRecoger>
}

export type Espera =
  | { ok: true; codigo: CodigoSms }
  | { ok: false; motivo: 'canal_no_disponible' | 'sin_respuesta' | 'sello_invalido' | 'fin' }

/**
 * Pide el código y espera con tope. PURA salvo lo inyectado (puerto, reloj, espera). `antesDeEsperar` corre UNA vez, tras
 * apuntar la petición y antes de sondear (es donde se pulsa «Enviar»: si asegura no apuntó la petición, no se manda SMS).
 * Un fallo de red al sondear NO es «no hay código»: se sigue sondeando hasta el tope.
 */
export async function esperarCodigoSms(o: {
  puerto: PuertoCodigoSms
  par: { publica: string; abrir(sello: string): string | null }
  prorrogar?: (leaseHasta: string | null) => void
  antesDeEsperar?: () => Promise<void>
  ahora?: () => number
  dormir?: (ms: number) => Promise<void>
  esperaMs?: number
  cadaMs?: number
}): Promise<Espera> {
  const ahora = o.ahora ?? Date.now
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const p = await o.puerto.pedir(o.par.publica).catch(() => ({ estado: 'no_disponible' as const, motivo: 'red' }))
  if (p.estado !== 'pedido') return { ok: false, motivo: 'canal_no_disponible' }
  o.prorrogar?.(p.leaseHasta)
  await o.antesDeEsperar?.()
  const fin = ahora() + (o.esperaMs ?? ESPERA_CODIGO_MS)
  for (;;) {
    const r = await o.puerto.recoger().catch(() => ({ estado: 'esperando' as const }))
    if (r.estado === 'listo') {
      o.prorrogar?.(r.leaseHasta)
      const codigo = selloCodigoSmsValido(r.sello) ? o.par.abrir(r.sello) : null
      return codigo === null ? { ok: false, motivo: 'sello_invalido' } : { ok: true, codigo: new CodigoSms(codigo) }
    }
    if (r.estado === 'fin') return { ok: false, motivo: 'fin' }
    if (ahora() >= fin) return { ok: false, motivo: 'sin_respuesta' }
    await dormir(Math.min(o.cadaMs ?? SONDEO_CODIGO_MS, Math.max(0, fin - ahora())))
  }
}

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** El puerto real: asegura con el Bearer del worker. Ni el sello ni el código pasan por ningún log. */
export function puertoCodigoHttp(c: { apiUrl: string; secreto: string }, trabajoId: string): PuertoCodigoSms {
  const auth = { Authorization: `Bearer ${c.secreto}` }
  return {
    async pedir(clavePublica) {
      const res = await fetch(`${c.apiUrl}/api/tarificador/codigo-sms`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trabajoId, clavePublica }),
        signal: AbortSignal.timeout(15_000),
      })
      const j = (await res.json().catch(() => null)) as { estado?: unknown; leaseHasta?: unknown } | null
      if (res.status === 200 && j?.estado === 'pedido') return { estado: 'pedido', leaseHasta: cadena(j.leaseHasta) }
      return { estado: 'no_disponible', motivo: cadena(j?.estado) ?? `HTTP ${res.status}` }
    },
    async recoger() {
      const res = await fetch(`${c.apiUrl}/api/tarificador/codigo-sms/${encodeURIComponent(trabajoId)}`, { headers: auth, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      const j = (await res.json().catch(() => null)) as { estado?: unknown; sello?: unknown; leaseHasta?: unknown } | null
      if (res.status === 200 && j?.estado === 'listo' && typeof j.sello === 'string') return { estado: 'listo', sello: j.sello, leaseHasta: cadena(j.leaseHasta) }
      if (res.status === 200 && j?.estado === 'esperando') return { estado: 'esperando' }
      // 404/410 = la petición ya no existe o caducó; un 5xx o 503 es pasajero: se sigue sondeando.
      if (res.status === 404 || res.status === 410) return { estado: 'fin', motivo: cadena(j?.estado) ?? `HTTP ${res.status}` }
      return { estado: 'esperando' }
    },
  }
}

export type DepsRelevo = {
  compania: string
  trabajoId: string
  puerto: PuertoCodigoSms
  prorrogar?: (leaseHasta: string | null) => void
  log: (m: string, d?: Record<string, unknown>) => void
  esperaMs?: number
  cadaMs?: number
  /** Lo que se espera a salir de la pantalla tras «Verificar» (30 s; inyectable para los tests). */
  esperaVerificarMs?: number
}

export type Relevo = { ok: true; recordado: boolean } | { ok: false; error: ErrorTarificador }

/**
 * El relevo completo sobre la página que está en la pantalla del SMS de Okta. Nunca lanza por el código: devuelve el error
 * clasificado (requiere_humano). Un `EmisionBloqueadaError` del guard SÍ se propaga (lo trata el runner como siempre).
 */
export async function relevarCodigoSmsGenerali(page: Page, guard: GuardEmision, d: DepsRelevo): Promise<Relevo> {
  const fallo = (m: Parameters<typeof textoAvisoCodigoSms>[1]): Relevo => ({ ok: false, error: new ErrorVerificacionHumana(d.compania, textoAvisoCodigoSms(d.compania, m)) })
  if (!esUrlOktaSmsGenerali(page.url())) return fallo('fin')
  const par = new ParCodigoSms()
  let enviado = false
  const espera = await esperarCodigoSms({
    puerto: d.puerto,
    par: { publica: par.publica, abrir: (s) => par.abrir(s, d.trabajoId) },
    prorrogar: d.prorrogar,
    antesDeEsperar: async () => {
      enviado = await pulsarEnviarSmsGenerali(page, guard)
      d.log('codigo_sms_pedido', { enviado })
    },
    esperaMs: d.esperaMs,
    cadaMs: d.cadaMs,
  })
  if (!espera.ok) {
    d.log('codigo_sms_sin_codigo', { motivo: espera.motivo })
    return fallo(espera.motivo)
  }
  d.log('codigo_sms_recibido')
  try {
    const { recordado } = await verificarCodigoSmsGenerali(page, guard, espera.codigo.valor)
    await page.waitForURL((u) => !esUrlOktaSmsGenerali(u.toString()), { timeout: d.esperaVerificarMs ?? ESPERA_VERIFICAR_MS }).catch(() => undefined)
    guard.comprobar()
    if (esUrlOktaSmsGenerali(page.url())) {
      d.log('codigo_sms_rechazado')
      return fallo('rechazado')
    }
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    d.log('codigo_sms_verificado', { recordado })
    return { ok: true, recordado }
  } finally {
    await vaciarCodigoSmsGenerali(page).catch(() => undefined)
  }
}
