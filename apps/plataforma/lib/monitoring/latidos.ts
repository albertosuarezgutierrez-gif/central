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
  /** Horas desde el último latido BUENO (null si nunca completó una pasada). */
  horas: number | null
  /** Motivo legible para el aviso / log. */
  motivo: string
}

/**
 * ⚠️ «No ha latido» son DOS averías distintas y hay que decir cuál (lección del
 * 31/07/2026): el escaneo de facturas corría cada día y moría en 504 antes de
 * escribir su huella, y el aviso decía «sin ninguna señal registrada» — que se
 * lee como «el cron no se dispara» y manda a mirar el sitio equivocado (IMAP,
 * app-password) en vez del reloj de la función.
 *
 * Por eso, además de la última pasada BUENA (`ultimo` = `ultimo_ok_at`), se pasa
 * la última EJECUCIÓN (`ultimoIntento` = `ultimo_at`, la escriba quien la escriba,
 * haya ido bien o mal). Con las dos se distingue:
 *   · ni intento ni pasada buena → no se está disparando (o no escribe huella)
 *   · intento fresco, ninguna pasada buena → se dispara y NO termina
 *   · pasada buena vieja → estuvo bien y dejó de estarlo
 */
export function evaluarLatido(params: {
  ahora: Date
  ultimo: Date | null
  maxHoras: number
  ultimoIntento?: Date | null
  detalle?: string | null
}): EvalLatido {
  const { ahora, ultimo, maxHoras, ultimoIntento = null, detalle = null } = params
  const horasDe = (d: Date) => (ahora.getTime() - d.getTime()) / 3_600_000
  const coletilla = detalle ? ` — último parte: «${detalle}»` : ''
  const hIntento = ultimoIntento ? horasDe(ultimoIntento) : null

  if (!ultimo) {
    if (hIntento !== null) {
      return {
        alerta: true,
        horas: null,
        motivo:
          `se ejecuta pero NUNCA completa una pasada buena (último intento hace ${hIntento.toFixed(1)} h). ` +
          `No es que no se dispare: arranca y se queda a medias${coletilla}`,
      }
    }
    return {
      alerta: true,
      horas: null,
      motivo: 'sin ninguna señal registrada: ni una sola ejecución ha dejado huella',
    }
  }

  const horas = horasDe(ultimo)
  if (horas > maxHoras) {
    // Si sigue arrancando, el problema está en que no termina, no en el disparo.
    const matiz = hIntento !== null && hIntento <= maxHoras
      ? `, aunque SÍ arrancó hace ${hIntento.toFixed(1)} h (se ejecuta y no termina)`
      : ''
    return {
      alerta: true,
      horas,
      motivo: `${horas.toFixed(1)} h sin una pasada buena (umbral ${maxHoras} h)${matiz}${coletilla}`,
    }
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
      'El escaneo del buzón no completa una pasada buena. Mira en este orden: (1) si el cron ' +
      'devuelve 504 en los logs de Vercel, la pasada no cabe en su tiempo y muere a medias — fue la ' +
      'causa el 31/07/2026; (2) app-password rotada, etiqueta renombrada o IMAP caído. Mientras esté ' +
      'así, el agente contable dirá «no tienes facturas de proveedor pendientes» porque no ha podido ' +
      'mirar, no porque no las haya — y el IVA soportado del trimestre saldrá corto. ' +
      'Huella: agente_latidos.facturas_gmail.',
  },
  {
    id: 'sivra_eventos',
    etiqueta: '🎪 Descubrimiento de eventos de Sevilla (Ticketmaster + búsqueda web, diario)',
    // Diarios (04:00 y 05:00) → 30 h deja pasar un día saltado sin dar la lata.
    maxHoras: 30,
    nota:
      'Nadie está descubriendo qué pasa en Sevilla, y el motor tarifica 365 días vista. Los dos crons ' +
      'responden 200 {ok:true} CUANDO NO ESTÁN CONFIGURADOS (sin TICKETMASTER_API_KEY o sin ' +
      'GEMINI_API_KEY/OPENROUTER_API_KEY), así que «verde» nunca ha significado «está buscando»: ya ' +
      'estuvieron mudos en junio y julio de 2026 sin que saltara nada. Mira el detalle del latido — ' +
      'dice cuál de las dos vías falló — y luego los logs de eventos/sync y eventos/websearch. ' +
      'Mientras esté así, una fecha con un pelotazo se vende a precio de martes normal. ' +
      'Huella: agente_latidos.sivra_eventos.',
  },
  {
    id: 'sivra_mercado_sweep',
    etiqueta: '🔎 Barrido de mercado por temporada (diario 03:00)',
    maxHoras: 30,
    nota:
      'El corpus de comparables se está quedando viejo. Sin mercado fresco el motor cae al bucket ' +
      'global (bajo) y los precios se deslizan hacia el suelo justo en los meses buenos; además los ' +
      'centinelas de evento se quedan sin muestra y dejan de vigilar (evaluado:false NO es «todo ' +
      'bien»). EL DETALLE DICE QUÉ MITAD FALLÓ, léelo antes de tocar nada: «búsquedas sin ' +
      'resultados» = Serper no devuelve nada para la consulta (agotada, o la consulta ya no casa ' +
      'con nada — pasó el 02/08/2026 con el operador site:booking.com); «que la IA no supo leer» = ' +
      'la pasarela; «el corpus NO refleja temporada» = sí hay comps, pero son los mismos para todas ' +
      'las fechas, así que la línea de temporada es falsa. Un «0 comps» a secas NO es «no hay ' +
      'mercado». Huella: agente_latidos.sivra_mercado_sweep.',
  },
  {
    id: 'sivra_pricing_guard',
    etiqueta: '🛡️ Guardián de precios (diario 07:30)',
    // Cron diario → 30 h deja pasar una pasada saltada sin dar la lata.
    maxHoras: 30,
    nota:
      'La red de seguridad del pricing está muda. Es el que compara lo que cobramos contra el ' +
      'mercado real y el que caza precios revertidos, reservas por debajo de mercado, eventos mal ' +
      'fechados y comparables del aforo equivocado. Hasta el 01/08/2026 era el ÚNICO agente sin ' +
      'vigilante: si dejaba de correr, su silencio se leía como «no hay nada que avisar» — y no hay ' +
      'nada más caro que una red de seguridad que calla porque está rota. Si el detalle dice ' +
      '«pricing_eventos_auto ILEGIBLE», corrió pero con los centinelas de evento apagados. ' +
      'Huella: agente_latidos.sivra_pricing_guard.',
  },
]
