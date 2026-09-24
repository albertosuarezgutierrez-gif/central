/** Lista CERRADA de eventos del embudo. Un evento que no esté aquí no se puede emitir: así el nombre no se teclea distinto en dos sitios. */
export const EVENTOS = {
  calculadora_calculo: 'calculadora_calculo', // la persona pulsó calcular en la calculadora de vencimientos
  cta_portal_click: 'cta_portal_click', // clic en cualquier botón que lleva al portal (prop `origen`)
  lead_enviado: 'lead_enviado', // el formulario de contacto respondió ok (prop `ramo`)
  aviso_solicitado: 'aviso_solicitado', // el visitante pidió el aviso por correo y asegura lo aceptó (prop `ramo`; NUNCA el correo)
  ventana_calculo: 'ventana_calculo', // primera fecha válida en el widget de ventana de renovación (props `ramo`, `fase`)
} as const

export type Evento = keyof typeof EVENTOS
export type PropsEvento = Record<string, string | number | boolean | null>

/**
 * Emite el evento si PostHog está cargado (= hubo consentimiento). Sin PostHog, no hace NADA: ni cola, ni localStorage. Nunca lanza.
 *
 * 🚨 NUNCA mandes datos personales en `props`: ni nombre, ni teléfono, ni email, ni texto libre del formulario. Solo `origen`, `ramo`, contadores.
 */
export function medir(evento: Evento, props: PropsEvento = {}): boolean {
  if (typeof window === 'undefined') return false
  const ph = (window as { posthog?: { capture?: (n: string, p?: object) => void } }).posthog
  if (!ph || typeof ph.capture !== 'function') return false
  try {
    ph.capture(EVENTOS[evento], props)
    return true
  } catch {
    return false
  }
}
