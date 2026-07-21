// 💓 Latidos de agentes — vigía genérico de que los agentes/crons de la casa siguen produciendo.
//
// La lección del watchdog de trading (un agente que desaparece/no corre en silencio) NO es exclusiva
// de trading: ya pasó con el **agente de pricing** (dejó de correr y una reserva de Luxury entró un 40%
// por debajo de mercado sin que nadie se enterara). Este monitor generaliza la idea: por cada agente
// vigilado hay una "huella" en BD (una tabla+columna de tiempo que SOLO se refresca cuando ese agente
// corre) y un umbral; un cron diario comprueba las huellas y avisa por Telegram las que llevan demasiado
// tiempo sin latir. Función de decisión PURA (sin IO) para poder testearla.
//
// ⚠️ Regla de oro del diseño: **solo se vigilan huellas FIABLES** — las que se refrescan en CADA pasada
// del agente, no las que solo aparecen cuando hay trabajo (p. ej. `facturas_proveedor` solo escribe si
// llega una factura → daría falsas alarmas). Un monitor que da falsas alarmas se ignora y no sirve.

export type EvalLatido = {
  /** true = hay que avisar (huella vieja o inexistente). */
  alerta: boolean
  /** Horas desde el último latido (null si nunca latió). */
  horas: number | null
  /** Motivo legible para el aviso / log. */
  motivo: string
}

export function evaluarLatido(params: {
  ahora: Date
  ultimo: Date | null
  maxHoras: number
}): EvalLatido {
  const { ahora, ultimo, maxHoras } = params
  if (!ultimo) {
    return { alerta: true, horas: null, motivo: 'sin ninguna señal registrada' }
  }
  const horas = (ahora.getTime() - ultimo.getTime()) / 3_600_000
  if (horas > maxHoras) {
    return { alerta: true, horas, motivo: `${horas.toFixed(1)} h sin actividad (umbral ${maxHoras} h)` }
  }
  return { alerta: false, horas, motivo: `activo (${horas.toFixed(1)} h)` }
}

export type AgenteVigilado = {
  /** Clave estable; el route mapea id → SQL de la huella. */
  id: string
  etiqueta: string
  /** Umbral en horas. Generoso a propósito: mejor detectar tarde que dar falsas alarmas. */
  maxHoras: number
  /** Qué hacer si salta (va en el aviso de Telegram). */
  nota: string
}

// Registro extensible. Añadir un agente = una fila aquí + su probe SQL en el route.
// Sembrado (21/07/2026) con las huellas FIABLES y de más valor. Deliberadamente NO se vigilan:
//   - facturas (facturas_proveedor solo escribe si hay factura → falsa alarma),
//   - psd2/banca (ya cubierto por la skill psd2-health-check; y sin movimientos no escribe),
//   - trading (tiene su propio watchdog dedicado con lógica de días).
export const AGENTES_VIGILADOS: AgenteVigilado[] = [
  {
    id: 'pricing',
    etiqueta: '🏷️ Agente de pricing (SIVRA, sesión semanal)',
    // Semanal → 8 días de margen: solo salta si se salta una semana entera + un día.
    maxHoras: 192,
    nota:
      'No ha estudiado el mercado real (huella: market_rates prop_*). Revisa/crea su Rutina semanal en ' +
      'claude.ai → Rutinas (necesita los conectores de viaje; por API corre a ciegas).',
  },
  {
    id: 'correo_triaje',
    etiqueta: '📧 Triaje de correo (cron cada 10 min)',
    // El cursor avanza en cada pasada; 6 h de margen tolera noches tranquilas y caza un cron muerto.
    maxHoras: 6,
    nota: 'El cursor de correo no avanza. Revisa el cron correo-triaje en Vercel (¿IMAP/auth caídos?).',
  },
]
