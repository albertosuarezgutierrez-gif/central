// Tipos del worker sobre el contrato de @central/module-tarificacion: el adaptador recibe la página
// de Playwright y un contexto con `pulsar()` (el único modo de pulsar algo: guardado contra emisión).

import type { Locator, Page } from 'playwright'
import type { ContextoTarificacion, RiesgoComunidad, TarificadorAdapter } from '@central/module-tarificacion'

export type ContextoPortal = ContextoTarificacion & {
  /** Pulsa un botón/enlace SOLO si no casa con el patrón de emisión. Nunca `locator.click()`. */
  pulsar: (boton: Locator) => Promise<void>
  /** Lanza `ErrorTarificador('captcha')` si el portal presenta un reto: requiere_humano. */
  exigirSinCaptcha: () => Promise<void>
}

export type AdaptadorPortal = TarificadorAdapter<Page, RiesgoComunidad, ContextoPortal> & {
  /** Clave de la credencial: fly secrets `CRED_<clave>_USER` / `CRED_<clave>_PASS`. */
  readonly credencial: string
}
