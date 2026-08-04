// lib/correo/rutas.ts — FUENTE ÚNICA de la tabla de rutas del triaje de correo.
//
// Cada categoría dice: qué etiqueta Gmail se le pone, si se archiva (sale de INBOX) y cómo
// se notifica. El prompt del clasificador se GENERA desde aquí (ver `descripcionParaPrompt`),
// así que añadir/editar una categoría es cambiar SOLO este archivo. La rutina `/auditoria-diaria`
// reconcilia esta lista contra las skills/agentes del repo (una skill nueva con correo entrante
// sin categoría aquí = hallazgo → PR draft con la fila propuesta).
//
// NO duplicar esta lista en ningún otro sitio (ni en el prompt, ni en docs).

export type Aviso = 'inmediato' | 'digest' | 'ninguno'

export interface RutaCorreo {
  categoria: string
  etiqueta: string | null   // etiqueta Gmail a aplicar (null = no etiquetar)
  archivar: boolean         // true = sacar de INBOX (a «Todos»)
  aviso: Aviso
  cautela?: boolean         // el aviso va con tono de precaución (no actúa nunca)
  enrutarSivra?: boolean    // pasar al agente de huéspedes de SIVRA
  descripcion: string       // para el prompt de clasificación
  ejemplos: string[]        // remitentes/tipos de ejemplo (para el prompt)
}

// Etiquetas de filtros de Gmail YA existentes: si un correo ya las lleva, el triaje NO lo toca.
export const ETIQUETAS_INTOCABLES = ['IA', 'inmobiliaria']

// Umbral de confianza: por debajo, la IA no decide → 'dudoso' (default seguro, no se toca el correo).
// 0.5 (no 0.6): Llama/NIM tiende a dar confianzas moderadas; con 0.6 casi todo caía a 'dudoso'.
export const CONFIANZA_MINIMA = 0.5

// Auto-aprendizaje (mejora 4): si la IA clasifica el mismo remitente igual N veces con confianza ≥X,
// se inserta la regla en correo_reglas (creado_por='auto').
export const AUTO_APRENDER_VECES = 3
export const AUTO_APRENDER_CONFIANZA = 0.8

export const RUTAS: RutaCorreo[] = [
  {
    categoria: 'ruido',
    etiqueta: 'Triaje/Ruido',
    archivar: true,
    aviso: 'ninguno',
    descripcion: 'Ofertas comerciales, newsletters, promociones, boletines de marketing. Nada que requiera acción.',
    ejemplos: ['Endesa', 'Carrefour', 'La Vanguardia', 'ActivTrades', 'boletines de bolsa', 'Artlist', 'Groq', 'Civitatis'],
  },
  {
    categoria: 'contabilidad',
    etiqueta: 'Triaje/Contabilidad',
    archivar: false,
    aviso: 'digest',
    descripcion: 'Facturas, recibos, adeudos, justificantes de pago, avisos de cargo, extractos bancarios. Documentos con relevancia fiscal/contable.',
    ejemplos: ['Booking.com Invoice', 'PayPal recibo', 'fal.ai invoice', 'Petroprix factura', 'Vercel invoice', 'Stripe', 'PetroPrix'],
  },
  {
    categoria: 'correduria',
    etiqueta: 'Triaje/Correduria',
    archivar: false,
    aviso: 'digest',
    descripcion: 'Correos de la correduría de seguros de Alberto (es mediador): regularizaciones, pólizas, liquidaciones de comisiones de aseguradoras.',
    ejemplos: ['Occident regularización RC', 'Mapfre corredores', 'liquidación de comisiones'],
  },
  {
    categoria: 'personal-importante',
    etiqueta: 'Triaje/Personal',
    archivar: false,
    aviso: 'inmediato',
    descripcion: 'Asuntos personales/familiares que requieren atención: colegio de los niños, citas médicas, banca con acción pendiente (firmas, avisos), gestiones familiares.',
    ejemplos: ['colegio clickedu (boletines, libros)', 'guardería', 'VivoDiagnostico cita', 'BBVA firma pendiente', 'correo de Pilar'],
  },
  {
    categoria: 'huespedes',
    etiqueta: 'Triaje/Huespedes',
    archivar: false,
    aviso: 'inmediato',
    enrutarSivra: true,
    descripcion: 'Mensajes de huéspedes de los pisos turísticos (dudas, llaves, horarios). Suelen ser urgentes.',
    ejemplos: ['guest.booking.com', 'HomeExchange', 'mensaje de un cliente sobre una reserva'],
  },
  {
    categoria: 'leads-negocio',
    etiqueta: 'Triaje/Leads',
    archivar: false,
    aviso: 'inmediato',
    descripcion: 'Oportunidades de negocio: partnerships, respuestas a mailings comerciales, leads entrantes de ia-rest / ialimp.',
    ejemplos: ['partnership a hola@iarest.es', 'respuesta a mailing frío de ialimp', 'interés de un cliente potencial'],
  },
  {
    categoria: 'seguridad-sospechosa',
    etiqueta: 'Triaje/Seguridad',
    archivar: false,
    aviso: 'inmediato',
    cautela: true,
    descripcion: 'Correo que SIMULA ser de un banco/entidad/servicio y pide credenciales, mete prisa o parece suplantación/phishing. Marca con cautela: NUNCA actúa, solo avisa.',
    ejemplos: ['aviso de "seguridad" que pide login', 'suplantación de entidad financiera', 'reset de contraseña no solicitado'],
  },
  {
    categoria: 'codigos-verificacion',
    etiqueta: null,
    archivar: false,
    aviso: 'ninguno',
    descripcion: 'Códigos OTP / de verificación de un solo uso (efímeros). Se dejan en INBOX sin tocar.',
    ejemplos: ['Tuya Verification Code', 'código de acceso', 'one-time password'],
  },
  {
    categoria: 'dudoso',
    etiqueta: null,
    archivar: false,
    aviso: 'ninguno',
    descripcion: 'No encaja con claridad en ninguna categoría. Se deja en INBOX sin tocar y sale en el digest para que Alberto lo revise.',
    ejemplos: [],
  },
]

export function rutaDe(categoria: string): RutaCorreo {
  return RUTAS.find(r => r.categoria === categoria)
    ?? RUTAS.find(r => r.categoria === 'dudoso')!
}

// Lista de categorías que la IA puede elegir (excluye ninguna: 'dudoso' es válida como salida).
export const CATEGORIAS_IA = RUTAS.map(r => r.categoria)

// Genera el bloque de categorías para el prompt de clasificación (sin duplicar la lista).
export function descripcionParaPrompt(): string {
  return RUTAS
    .filter(r => r.categoria !== 'dudoso')
    .map(r => {
      const ej = r.ejemplos.length ? ` Ej: ${r.ejemplos.join(', ')}.` : ''
      return `- ${r.categoria}: ${r.descripcion}${ej}`
    })
    .join('\n')
}
