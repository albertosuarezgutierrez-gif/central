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
//   - trading (tiene su propio watchdog dedicado con lógica de días),
//   - **smoobu_sync** (31/07/2026): SÍ deja huella fiable en `agente_latidos`, pero su vigilancia
//     vive en el Check 4 del health-check (cron `health-check`, 07:00 UTC) con lógica propia de
//     tres estados en `lib/sivra/estado-sync.ts`. Meterlo también aquí mandaría el MISMO aviso dos
//     veces cada mañana (07:00 y 07:45) y un monitor que repite se acaba ignorando — que es el
//     modo de fallo que este archivo dice evitar en su regla de oro. Si algún día se centraliza,
//     hay que RETIRAR el Check 4 en el mismo cambio, no dejar los dos.
export const AGENTES_VIGILADOS: AgenteVigilado[] = [
  {
    id: 'pricing',
    etiqueta: '🏷️ Agente de pricing (SIVRA, sesión semanal)',
    // Semanal → 8 días de margen: solo salta si se salta una semana entera + un día.
    // La huella se mide POR PISO (el más viejo manda, ver la sonda en el route): la Rutina
    // debe refrescar los 4 pisos cada semana, así que un solo piso rezagado ya es señal.
    maxHoras: 192,
    nota:
      'Algún piso lleva demasiado sin estudio de mercado (huella: market_rates prop_*, por piso). ' +
      'La Rutina semanal marca ✅ pero puede no estar escribiendo comps: revisa en claude.ai → Rutinas ' +
      'que corre con los conectores de viaje y que el resumen reporta filas por piso (por API corre a ciegas).',
  },
  {
    id: 'correo_triaje',
    etiqueta: '📧 Triaje de correo (cron cada 10 min)',
    // El cursor avanza en cada pasada; 6 h de margen tolera noches tranquilas y caza un cron muerto.
    maxHoras: 6,
    nota: 'El cursor de correo no avanza. Revisa el cron correo-triaje en Vercel (¿IMAP/auth caídos?).',
  },
  {
    id: 'ialimp_pms',
    etiqueta: '🧹 Sincronización del PMS de ialimp (Smoobu/iCal, cron cada 10 min)',
    // Cadencia de 10 min → 6 h son 36 pasadas perdidas: no es un tropiezo, está muerta.
    maxHoras: 6,
    nota:
      'Si el PMS no sincroniza, `cleaning_sessions` deja de recibir reservas y TODO lo que cuelga de ' +
      'ella miente en la misma dirección: la app de la limpiadora dice «Sin limpiezas este día», el ' +
      'briefing dice «sin sesiones programadas» y el panel se queda tan ancho. Es una vertical con ' +
      'cliente EN PRODUCCIÓN (Sique Brilla): un piso sin limpiar sale caro. Revisa el cron /api/pms/sync ' +
      'de ialimp y la clave de Smoobu en pms_connections.',
  },
  {
    id: 'facturas_gmail',
    etiqueta: '🧾 Escaneo de facturas en Gmail (cron diario 06:15)',
    // Diario → 30 h deja margen para un día saltado sin dar la lata.
    maxHoras: 30,
    nota:
      'El escaneo del buzón no completa una pasada buena (¿app-password rotada, etiqueta renombrada, ' +
      'IMAP caído?). Mientras esté así, el agente contable dirá «no tienes facturas de proveedor ' +
      'pendientes» porque no ha podido mirar, no porque no las haya — y el IVA soportado del trimestre ' +
      'saldrá corto. Huella: agente_latidos.facturas_gmail.',
  },
]
