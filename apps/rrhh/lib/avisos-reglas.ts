// Textos y reglas PURAS de los avisos al empleado (`rrhh.avisos`). Sin BD ni red.

export const TIPOS_AVISO = ['solicitud_firma', 'recordatorio_firma', 'reclamacion_firma', 'documento_nuevo'] as const
export type TipoAviso = (typeof TIPOS_AVISO)[number]

export type DatosAviso = {
  empleadoNombre: string
  documento: string
  empresa: string | null
  resumen: string | null
  /** Días desde que se pidió la firma (solo recordatorios). null = no se sabe → no se menciona. */
  dias: number | null
  url: string
}

export type TextoAviso = { titulo: string; cuerpo: string; asunto: string; texto: string }

const URL_DEFECTO = 'https://empleados.grupoasegura.es'

/** Base pública del portal: env `RRHH_PUBLIC_URL` > origen de la petición > producción. Sin barra final. */
export function basePortal(env: string | undefined, origen?: string | null): string {
  const b = (env || origen || URL_DEFECTO).trim()
  return b.replace(/\/+$/, '')
}

/** Enlace del aviso: el portal del empleado (si no hay sesión, /e redirige a /e/entrar). */
export function enlacePortal(base: string): string {
  return `${base}/e`
}

export function textoAviso(tipo: TipoAviso, d: DatosAviso): TextoAviso {
  const de = d.empresa ? ` de ${d.empresa}` : ''
  const resumen = d.resumen ? `\n\n${d.resumen}` : ''
  const pie = `\n\nEntra en tu portal del empleado${de} para verlo:\n${d.url}\n\nSi tienes dudas, habla con el departamento de RR.HH.`
  switch (tipo) {
    case 'solicitud_firma':
      return {
        titulo: 'Tienes un documento para firmar',
        cuerpo: `«${d.documento}» está pendiente de tu firma.`,
        asunto: `Documento pendiente de firma: ${d.documento}`,
        texto: `Hola ${d.empleadoNombre},\n\nTienes un documento pendiente de firmar: «${d.documento}».${resumen}${pie}`,
      }
    case 'recordatorio_firma': {
      const hace = d.dias != null && d.dias > 0 ? ` desde hace ${d.dias} ${d.dias === 1 ? 'día' : 'días'}` : ''
      return {
        titulo: 'Recordatorio: documento pendiente de firma',
        cuerpo: `«${d.documento}» sigue pendiente de tu firma${hace}.`,
        asunto: `Recordatorio: firma pendiente de «${d.documento}»`,
        texto: `Hola ${d.empleadoNombre},\n\nTe recordamos que «${d.documento}» sigue pendiente de tu firma${hace}.${resumen}${pie}`,
      }
    }
    case 'reclamacion_firma':
      return {
        titulo: 'RR.HH. te pide que firmes un documento',
        cuerpo: `Por favor, firma «${d.documento}» lo antes posible.`,
        asunto: `RR.HH. te pide la firma de «${d.documento}»`,
        texto: `Hola ${d.empleadoNombre},\n\nEl departamento de RR.HH. te pide que firmes «${d.documento}» lo antes posible.${resumen}${pie}`,
      }
    case 'documento_nuevo':
      return {
        titulo: 'Tienes un documento nuevo',
        cuerpo: `Se ha añadido «${d.documento}» a tu expediente.`,
        asunto: `Nuevo documento en tu portal: ${d.documento}`,
        texto: `Hola ${d.empleadoNombre},\n\nSe ha añadido un documento nuevo a tu expediente: «${d.documento}».${resumen}${pie}`,
      }
  }
}

/** Resultado del envío por email a partir de lo que hay (pura: el llamante hace el envío). */
export function estadoEmailPrevio(email: string | null | undefined, hayTransporte: boolean): 'sin_email' | 'sin_transporte' | null {
  if (!email || !email.includes('@')) return 'sin_email'
  if (!hayTransporte) return 'sin_transporte'
  return null // se puede intentar
}
