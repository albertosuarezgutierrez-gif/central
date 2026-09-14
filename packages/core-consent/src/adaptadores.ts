// Adaptadores por proveedor. Las funciones `urlScript*` son puras (testeadas); las
// `cargar*`/`apagar*` tocan el DOM y solo se llaman cuando puedeCargar() ya dio verde —
// nunca al importar este módulo, para que no quepa la posibilidad de dispararse por un `if`
// mal escrito en otro sitio.

export function urlScriptGa4(id: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${id}`
}

/** Host de ingesta de PostHog. Por defecto la nube EUROPEA: un defecto EE.UU. sacaría datos
 * de visitantes del EEE fuera sin que nada fallara. */
export function urlScriptPostHog(host: string = 'https://eu.i.posthog.com'): string {
  return `${host.replace(/\/+$/, '')}/static/array.js`
}

export function urlScriptMetaPixel(): string {
  return 'https://connect.facebook.net/en_US/fbevents.js'
}

/** Forma del `fbq` global de Meta Pixel. Con nombre propio (en vez de inline en
 * `Window`) porque `Object.assign(fn, {...})` tipado contra `typeof window.fbq`
 * —un tipo UNIÓN con `undefined`— confundía al checker de TS (TS2322/TS18048/
 * TS2722 en un consumidor con `strict:true`); con un tipo nombrado, sin unión,
 * `Object.assign` infiere bien y no hace falta ningún `as`. */
type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: unknown
  queue?: unknown[]
  loaded?: boolean
  version?: string
  push?: unknown
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: FbqFn
    posthog?: {
      init: (key: string, opciones: Record<string, unknown>) => void
      capture: (evento: string, props?: Record<string, unknown>) => void
      opt_out_capturing: () => void
      reset: (borrarId?: boolean) => void
    }
  }
}

/** Carga GA4. Sin función de parada: gtag.js no ofrece un opt_out limpio por script suelto,
 * así que el gate real es no cargar el script — igual que ya asumía asegura-web con PostHog. */
export function cargarGa4(id: string): void {
  const s1 = document.createElement('script')
  s1.async = true
  s1.src = urlScriptGa4(id)
  document.head.appendChild(s1)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', id)
}

/** Carga Meta Pixel. Mismo criterio que GA4: sin parada limpia, el gate es no cargar. */
export function cargarMetaPixel(id: string): void {
  if (window.fbq) return
  const n: FbqFn = Object.assign(
    function (...args: unknown[]) {
      n.queue!.push(args)
    },
    { queue: [] as unknown[], loaded: true, version: '2.0' }
  )
  window.fbq = n
  const s = document.createElement('script')
  s.async = true
  s.src = urlScriptMetaPixel()
  document.head.appendChild(s)
  window.fbq('init', id)
  window.fbq('track', 'PageView')
}

/** Arranca PostHog. Refleja components/Analitica.tsx de asegura-web tal cual: pageview
 * manual (App Router no recarga en la navegación), perfiles anónimos, sin grabación de
 * sesión (los formularios de estas webs piden datos personales). */
export function arrancarPostHog(key: string, host: string, alTerminar: () => void): void {
  const s = document.createElement('script')
  s.src = urlScriptPostHog(host)
  s.async = true
  s.onload = () => {
    if (!window.posthog) return
    window.posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: 'identified_only',
      disable_session_recording: true,
    })
    window.posthog.capture('$pageview')
    alTerminar()
  }
  document.head.appendChild(s)
}

export function apagarPostHog(): void {
  if (!window.posthog) return
  window.posthog.opt_out_capturing()
  window.posthog.reset(true)
}
