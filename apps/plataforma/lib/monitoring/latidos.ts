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
    id: 'ses_transporte',
    etiqueta: '🛂 Transporte con SES.HOSPEDAJES (parte de viajeros, cron diario 07:15)',
    // Diario a las 07:15 → 30 h dejan pasar un tropiezo aislado y cazan dos días caídos.
    maxHoras: 30,
    nota:
      'No estamos pudiendo hablar con el Ministerio. Hoy NO manda partes nadie de esta casa (los ' +
      'manda Chekin), así que esto no es todavía un incumplimiento — pero es la puerta por la que ' +
      'van a ir, y si se cierra hay que saberlo ANTES de depender de ella. Lee el `detalle`, que ' +
      'distingue las dos averías y son opuestas: «SES no responde» es ESPERAR (su entorno de ' +
      'pruebas llevaba días dando 502 el 20/08/2026, y no se arregla desde aquí); «credenciales o ' +
      'alta rechazadas» es ACTUAR, en el portal de SES, no en el repo. ' +
      '🚨 Sospecha primero del CERTIFICADO si el detalle nombra TLS: la hoja de *.ses.mir.es ' +
      'caducaba el 03/09/2026 y al rotarla puede cambiar la cadena; el bundle FNMT bueno está en ' +
      '`packages/module-ses/certs/ses-ca-bundle.pem` y se carga con NODE_EXTRA_CA_CERTS. ' +
      'Y si el aviso dice «sin ninguna señal registrada» recién desplegado, es el estreno, no una ' +
      'avería. Huella: agente_latidos.ses_transporte.',
  },
  {
    id: 'pricing',
    etiqueta: '🏷️ Agente de pricing (SIVRA, sesión semanal)',
    // Semanal → 8 días de margen: solo salta si se salta una semana entera + un día.
    // La huella se mide POR PISO (el más viejo manda, ver la sonda en el route): la Rutina
    // debe decidir sobre los 4 pisos cada semana, así que un solo piso rezagado ya es señal.
    maxHoras: 192,
    nota:
      'Algún piso lleva demasiado sin ciclo de pricing (huella: pricing_decisiones.ciclo_at, por piso). ' +
      'La Rutina semanal marca ✅ en claude.ai pero puede no estar decidiendo nada: revisa que corre con ' +
      'los conectores de viaje y que el resumen reporta filas por piso (por API corre a ciegas). ' +
      'OJO al elegir huella aquí: `market_rates prop_*` YA NO SIRVE — desde que el barrido Serper y la ' +
      'rutina de Booking escriben ahí a diario, esa sonda sale verde con la Rutina parada (08/08/2026).',
  },
  {
    id: 'trading_watchdog',
    etiqueta: '🐕 Vigía de la pasada de trading (cron mar-sáb 06:30)',
    // 🚨 Vigila al VIGILANTE, no a la pasada. Los tres tramos de trading (NAV, /analizar, /puntuar)
    // los comprueba el propio `trading-watchdog`, que es más fino que esta lista porque sabe QUÉ
    // días se espera pasada. Meter aquí `trading_puntuar` sería duplicar su aviso Y saltar en falso
    // cada domingo y lunes (la pasada es L-V ~20:15 UTC: el lunes por la mañana la última buena es
    // la del viernes, ~59 h). Lo que faltaba es esto: el watchdog no dejaba huella de sí mismo, así
    // que si dejaba de correr su silencio se leía como «los tres tramos frescos».
    //
    // Umbral 80 h, no 30: el cron es `30 6 * * 2-6`, así que el hueco legítimo más largo es de
    // sábado 06:30 a martes 06:30 = 72 h. Por debajo de eso avisaría todos los lunes sin avería.
    maxHoras: 80,
    nota:
      'El vigía de trading no ha comprobado la pasada. Mientras esté así, NADIE mira el NAV de IBKR, ' +
      'ni las tesis de /analizar, ni el cierre de /puntuar: los tres pueden estar caídos y no saltará ' +
      'nada, porque el único que los cruza es él. Revisa que `/api/cron/trading-watchdog` sigue en ' +
      '`CRON_JOBS` (lib/cron-dispatch.ts, `30 6 * * 2-6`) y sus logs en Vercel. OJO al leer el hueco: ' +
      'de sábado a martes son 72 h SIN avería — el umbral son 80 h por eso. ' +
      'Y si el aviso dice «sin ninguna señal registrada» justo después de desplegar esta huella, es el ' +
      'estreno, no una avería: la primera constancia la deja la primera pasada del cron (martes 06:30 ' +
      'si se desplegó en fin de semana). Huella: agente_latidos.trading_watchdog.',
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
    id: 'subastas_mercado',
    etiqueta: '🏘️ Mercado de subastas: comparables y chollos (cron diario 06:20)',
    // Diario → 30 h, igual que el resto de diarios: tolera un día saltado.
    maxHoras: 30,
    nota:
      'La pasada no llega a avisar. Es el fallo del 06/08/2026: el handler murió con un 504 a los ' +
      '300 s JUSTO antes de `avisarChollos` (los pasos de red del portal se comían el presupuesto), ' +
      'así que ese día hubo cero avisos sin un solo error a la vista — y «hoy no hay chollos» era en ' +
      'realidad «hoy no se ha podido mirar». Mira los logs de /api/cron/subastas-mercado: si es 504, ' +
      'el portal va lento y el presupuesto está cortando de más (revisa `presupuesto-mercado.ts`); si ' +
      'es IMAP, las alertas de Idealista/Fotocasa no se están leyendo. Huella: agente_latidos.subastas_mercado.',
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
    id: 'sivra_eventos_verificar',
    etiqueta: '🔍 Verificación automática de eventos previstos (diaria 05:30)',
    maxHoras: 30,
    nota:
      'Nadie está juzgando los eventos PREVISTOS, y un previsto sin veredicto NO es neutro: ' +
      'protege el suelo de esa noche y, si la fecha está lejos, sube el precio ponderado por su ' +
      'confianza. Antes esto lo decidía Alberto por Telegram; desde el 12/08/2026 lo decide el ' +
      'cron contra tres fuentes independientes (otra fila ya confirmada, búsqueda dirigida en ' +
      'prensa, y el mercado real de esa noche). EL DETALLE DICE QUÉ FALLÓ: «sin poder verificar» ' +
      '= la búsqueda web no respondió, y entonces NO se descarta nada a propósito (una búsqueda ' +
      'caída no es un evento inexistente) — con lo cual los previstos se acumulan sin caducar. ' +
      'Mira el presupuesto diario de la pasarela y las keys de búsqueda antes que nada. ' +
      'Huella: agente_latidos.sivra_eventos_verificar.',
  },
  {
    id: 'sivra_canal',
    etiqueta: '📐 Calibrado del canal Booking (diario 07:45)',
    maxHoras: 30,
    nota:
      'Nadie está comprobando con qué números el motor convierte el mercado en precio base. La ' +
      'conversión NO es un detalle: durante tres días fue un ×1,20 supuesto contra un canal que en ' +
      'realidad multiplica por ~0,9 y SUMA una cuota fija por estancia, y eso desplazaba TODAS las ' +
      'fechas de los cuatro pisos a la vez sin que nada se pusiera rojo (reserva de House de ' +
      'Navidad, 19/08/2026). LEE EL DETALLE Y NO PRESUPONGAS DÓNDE ESTÁ EL FALLO: el 19/08/2026 ' +
      'esta misma nota afirmaba que un rojo aquí significaba que el problema estaba «aguas arriba, ' +
      'en la rutina de Booking y en el plan de escaparate» — y era FALSO: las 22 mediciones de ' +
      'escaparate estaban en market_rates y el cron moría en su PRIMERA consulta (42883, ' +
      'date - bigint: Prisma manda los números como int8). Un diagnóstico escrito de antemano ' +
      'manda al fichero equivocado. Qué mirar, en este orden: (1) si el detalle trae un SQLSTATE o ' +
      'una excepción, el fallo es de ESTE cron — arréglalo aquí; (2) «sin ajuste fiable» en todos ' +
      'los pisos SIN excepción = pasó la consulta y no hay mediciones suficientes, y entonces sí ' +
      'toca mirar aguas arriba (sivra_mercado_booking y /api/sivra/mercado/plan); (3) «SIMULACRO» = ' +
      'alguien lo está llamando sin CRON_SECRET y no escribe nada. ' +
      'Huella: agente_latidos.sivra_canal.',
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
    id: 'sivra_mercado_booking',
    etiqueta: '🏨 Mercado real por fecha (rutina Booking, diaria)',
    // Diaria → 30 h deja pasar una pasada saltada sin dar la lata. La cobertura se ACUMULA (el
    // motor mira 120 días atrás), así que un día perdido no rompe nada; una semana perdida sí.
    maxHoras: 30,
    nota:
      'Es la ÚNICA fuente que mide el precio de una fecha CONCRETA: el barrido por búsqueda web da ' +
      'precios de anuncio sin fecha (el mismo comparable a 305€ en agosto, noviembre y marzo — ' +
      'medido el 06/08/2026), y con eso el motor tarifica un mes entero con el precio de hoy. Si ' +
      'esta rutina calla, la línea de temporada deja de refrescarse y en 120 días el corpus fiable ' +
      'se vacía solo. EL DETALLE DICE QUÉ FALLÓ: «sin respuesta del conector» = Booking no contestó ' +
      '(NO es «no hay mercado»); «sin precio utilizable» = contestó sin cifra. Revisa en claude.ai → ' +
      'Rutinas que la rutina corre, que tiene el conector de Booking.com adjunto y que su env lleva ' +
      'PLATAFORMA_URL + ALERTA_TOKEN (sin ellos no puede ni pedir el plan ni escribir). ' +
      'Huella: agente_latidos.sivra_mercado_booking.',
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
