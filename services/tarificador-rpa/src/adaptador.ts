// Tipos del worker sobre el contrato de @central/module-tarificacion: el adaptador recibe la página
// de Playwright y un contexto con `pulsar()` (el único modo de pulsar algo: guardado contra emisión).

import type { Locator, Page } from 'playwright'
import type { ModalidadPortal } from '@central/module-tarificacion'
import type { ContextoTarificacion, RiesgoComunidad, TarificadorAdapter } from '@central/module-tarificacion'
import type { ContextoFormador } from './formador.ts'

export type ContextoPortal = ContextoTarificacion & {
  /** Pulsa un botón/enlace SOLO si no casa con el patrón de emisión. Nunca `locator.click()`. */
  pulsar: (boton: Locator) => Promise<void>
  /** Lanza `ErrorTarificador('captcha')` si el portal presenta un reto: requiere_humano. */
  exigirSinCaptcha: () => Promise<void>
  /** Elige la modalidad (radio). Solo Datos Básicos, una vez por trabajo, pestaña verificada en DOM. */
  elegirOpcion: (modalidad: ModalidadPortal) => Promise<void>
  /** Avanza de Datos Básicos a Tarificar. Único «Aceptar» permitido (el de Tarificar EMITE: bloqueado). */
  avanzarATarificar: () => Promise<void>
  /** Pulsa la pestaña «Proyecto» (genera el PDF sin grabar). Solo desde Tarificar. */
  abrirProyecto: (pestana: Locator) => Promise<void>
  /**
   * Formador con IA (06/10/2026). `undefined` o `activo: false` = apagado. El adaptador lo usa como
   * FALLBACK: `resolverConFormador(page, ctx.formador, …)` cuando no encuentra un campo o una acción
   * permitida, y `acompanar(page, ctx.formador, paso, …)` en los `PUNTOS_ENGANCHE` (src/formador.ts).
   */
  formador?: ContextoFormador
  /** Pausa corta «humana» (300–1200 ms) antes de cada acción (campo o pulsación). */
  pausaAccion: () => Promise<void>
  /**
   * El contexto arrancó con la sesión guardada en memoria (src/sesion.ts). El adaptador comprueba que sirve y,
   * si sirve, se salta el login; si no, hace login normal. Nunca se le dan las cookies: solo esta bandera.
   */
  sesionReutilizada: boolean
  /**
   * Portal de sesión MANUAL (el adaptador declara `sesion: 'manual'`; p. ej. Generali, SMS en el acceso). El contexto
   * arranca con la sesión que inició Alberto a mano (src/sesion-manual.ts). El adaptador NUNCA hace login ni toca la
   * pantalla de código: si ve el login, lanza o sigue y el runner lo trata como sesión rechazada (se borra y avisa).
   */
  sesionManual: boolean
}

export type AdaptadorPortal = TarificadorAdapter<Page, RiesgoComunidad, ContextoPortal> & {
  /** Clave de la credencial: fly secrets `CRED_<clave>_USER` / `CRED_<clave>_PASS`. */
  readonly credencial: string
  /**
   * `'manual'`: el portal pide SMS en el acceso. El robot no tiene credenciales de ese portal (no se leen los CRED_*),
   * solo reutiliza la sesión sellada que dio de alta una persona; sin ella, `requiere_humano` sin abrir el navegador.
   */
  readonly sesion?: 'manual'
}
