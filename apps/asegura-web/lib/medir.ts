/** Lista CERRADA de eventos del embudo. Un evento que no esté aquí no se puede emitir: así el nombre no se teclea distinto en dos sitios. */
export const EVENTOS = {
  calculadora_calculo: 'calculadora_calculo', // la persona pulsó calcular en la calculadora de vencimientos
  cta_portal_click: 'cta_portal_click', // clic en cualquier botón que lleva al portal (prop `origen`)
  lead_enviado: 'lead_enviado', // el formulario de contacto respondió ok (prop `ramo`)
  aviso_solicitado: 'aviso_solicitado', // el visitante pidió el aviso por correo y asegura lo aceptó (prop `ramo`; NUNCA el correo)
  ventana_calculo: 'ventana_calculo', // primera fecha válida en el widget de ventana de renovación (props `ramo`, `fase`)
  carta_accion: 'carta_accion', // copiar / imprimir / descargar / correo en la carta de baja (props `accion`, `ramo`, `plazo`, `huecos`; NUNCA el texto)
} as const

export type Evento = keyof typeof EVENTOS
export type PropsEvento = Record<string, string | number | boolean | null>

/**
 * Nombre en GA4 cuando no coincide con el nuestro. `generate_lead` es el evento
 * recomendado de Google para un lead: así GA4 lo cruza con Search Console sin
 * configurar nada más que marcarlo como evento clave.
 */
const NOMBRE_GA4: Partial<Record<Evento, string>> = { lead_enviado: 'generate_lead' }

type Ventana = {
  posthog?: { capture?: (n: string, p?: object) => void }
  gtag?: (...args: unknown[]) => void
}

/**
 * Emite el evento a PostHog y a GA4, a cada uno SOLO si está cargado (= hubo consentimiento:
 * `window.gtag` no existe hasta que `cargarGa4()` corre tras aceptar). Sin ninguno, no hace
 * NADA: ni cola, ni localStorage. Nunca lanza. Devuelve true si llegó a alguno.
 *
 * 🚨 NUNCA mandes datos personales en `props`: ni nombre, ni teléfono, ni email, ni texto libre del formulario. Solo `origen`, `ramo`, contadores.
 */
export function medir(evento: Evento, props: PropsEvento = {}): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Ventana
  let enviado = false
  if (w.posthog && typeof w.posthog.capture === 'function') {
    try {
      w.posthog.capture(EVENTOS[evento], props)
      enviado = true
    } catch {}
  }
  if (typeof w.gtag === 'function') {
    try {
      w.gtag('event', NOMBRE_GA4[evento] ?? EVENTOS[evento], props)
      enviado = true
    } catch {}
  }
  return enviado
}
