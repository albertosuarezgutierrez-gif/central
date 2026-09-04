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
  /**
   * true = declarado hace poco y todavía sin señal, pero su primera pasada AÚN NO ha vencido.
   * NO es alerta y NO es «está bien»: es el tercer estado, «todavía no se sabe». Va a la pantalla
   * y al JSON, nunca a las alertas del Telegram.
   */
  estreno?: boolean
  /**
   * true = sigue siendo una avería (`alerta` sigue en true) pero es la que ya está declarada y
   * fechada en `pendienteConocido`. El Telegram la aparta de las alertas; la pantalla NO.
   */
  pendiente?: boolean
  /** Frase para el bloque de pendientes: motivo + hasta cuándo. */
  pendienteNota?: string
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
 *
 * 🚨 Y una CUARTA, que hasta el 04/09/2026 se colapsaba con la primera: **el estreno**. Un latido
 * recién declarado no tiene fila, y «sin ninguna señal registrada» manda a buscar una avería que no
 * existe todavía — el agente simplemente no ha tenido aún una pasada que dar. Medido ese día: las
 * cuatro rutinas cableadas el 02/09 (`psd2_health_check` semanal, `fiscal_novedades` y
 * `rrhh_compliance` mensuales día 1, `github_vigia` mensual día 15) salieron en ROJO desde el minuto
 * uno, y las dos mensuales iban a seguir gritando **27 días** hasta su primera pasada del 01/10. El
 * quinto de la tanda, `facturas_correo` (diario), latía al día siguiente: la maquinaria funcionaba: lo
 * que fallaba era el juicio.
 *
 * Eso es exactamente lo que la regla de oro de este fichero prohíbe — «un monitor que da falsas
 * alarmas se ignora y no sirve» — y la doctrina del CLAUDE.md raíz: **`NULL` es «todavía no se sabe»,
 * no «está roto»**. La señal de que faltaba modelarlo estaba a la vista: tres entradas del registro
 * (`ses_transporte`, `trading_watchdog`) llevaban escrito a mano en su `nota` «si dice sin ninguna
 * señal recién desplegado, es el estreno, no una avería». Una salvedad repetida en prosa es un
 * concepto que falta en el tipo.
 *
 * Por eso se pasa `vigiladoDesde` (cuándo se dio de alta la vigilancia). Sin ninguna señal y dentro
 * de su primer `maxHoras` desde el alta → `estreno`, que NO alerta. `maxHoras` ya es «cadencia × ~1,2»,
 * así que da margen para una pasada completa más holgura, y ni un minuto más: pasado eso, un agente
 * que sigue sin latir SÍ es una avería y vuelve a rojo él solo, sin que nadie tenga que acordarse.
 *
 * ⚠️ El estreno solo aplica **sin ninguna señal**. Un agente que ya latía una vez no vuelve a
 * estrenarse: si su huella envejece, es avería, por reciente que sea el alta.
 */
export function evaluarLatido(params: {
  ahora: Date
  ultimo: Date | null
  maxHoras: number
  ultimoIntento?: Date | null
  detalle?: string | null
  /** Fecha de alta de la vigilancia (ISO). Ver el bloque de arriba: gobierna el estreno. */
  vigiladoDesde?: string | Date | null
  /** Avería ya declarada y fechada. Ver `AgenteVigilado.pendienteConocido`. */
  pendienteConocido?: { motivo: string; revisarEl: string; mientras: string } | null
}): EvalLatido {
  const {
    ahora, ultimo, maxHoras, ultimoIntento = null, detalle = null,
    vigiladoDesde = null, pendienteConocido = null,
  } = params

  /**
   * ¿El parte de HOY sigue siendo la avería que ya está declarada?
   *
   * Los tres «no» son deliberados y cada uno tapa una forma de convertir esto en un mute:
   *   · sin `detalle` no casa NADA — un cron que dejó de escribir parte no puede heredar el permiso
   *     de silencio del que sí lo escribía;
   *   · el marcador se compara literal, así que un fallo distinto (otro código) vuelve a sonar;
   *   · pasada `revisarEl` caduca solo. Se compara contra el FINAL de ese día (`T23:59:59Z`) para
   *     que «revisar el 12» signifique el 12 entero y no las 00:00 del 12.
   */
  const pendienteVivo = (): { motivo: string; revisarEl: string } | null => {
    if (!pendienteConocido || !detalle) return null
    if (!detalle.includes(pendienteConocido.mientras)) return null
    const limite = new Date(`${pendienteConocido.revisarEl}T23:59:59Z`)
    if (Number.isNaN(limite.getTime()) || ahora > limite) return null
    return pendienteConocido
  }
  const marcarPendiente = (r: EvalLatido): EvalLatido => {
    const p = pendienteVivo()
    if (!p) return r
    return {
      ...r,
      pendiente: true,
      pendienteNota: `${p.motivo} — declarado pendiente hasta el ${p.revisarEl}; ese día vuelve a sonar solo`,
    }
  }
  const horasDe = (d: Date) => (ahora.getTime() - d.getTime()) / 3_600_000
  const coletilla = detalle ? ` — último parte: «${detalle}»` : ''
  const hIntento = ultimoIntento ? horasDe(ultimoIntento) : null

  if (!ultimo) {
    if (hIntento !== null) {
      return marcarPendiente({
        alerta: true,
        horas: null,
        motivo:
          `se ejecuta pero NUNCA completa una pasada buena (último intento hace ${hIntento.toFixed(1)} h). ` +
          `No es que no se dispare: arranca y se queda a medias${coletilla}`,
      })
    }
    // Estreno: se dio de alta hace poco y su primera pasada todavía no ha vencido.
    const alta = vigiladoDesde ? new Date(vigiladoDesde) : null
    if (alta && !Number.isNaN(alta.getTime())) {
      const hAlta = horasDe(alta)
      // `hAlta < 0` = alta con fecha futura (un dedazo al declararla). No se trata como estreno
      // eterno: se ignora y cae a la alerta, que es el lado conservador.
      if (hAlta >= 0 && hAlta <= maxHoras) {
        const quedan = maxHoras - hAlta
        const vence = new Date(alta.getTime() + maxHoras * 3_600_000)
        return {
          alerta: false,
          estreno: true,
          horas: null,
          motivo:
            `en estreno: vigilado desde hace ${hAlta.toFixed(1)} h y aún sin señal, pero su primera ` +
            `pasada no vence hasta dentro de ${quedan.toFixed(1)} h (${vence.toISOString().slice(0, 10)}). ` +
            'Todavía no se sabe: si sigue mudo pasada esa fecha, entonces sí es avería',
        }
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
    // Si sigue arrancando, el problema NO está en el disparo. Pero cuál de los dos es se DECLARA,
    // no se afirma: `registrarLatido(id, false, …)` lo escriben tanto los agentes que arrancan y
    // mueren a medias (`'pasada en curso'`: facturas-scan, prevision-pisos, subastas-mercado,
    // ses-latido) como los que llegan al final y se declaran con problemas (el programador de
    // accesos: termina las 3 pasadas del día y reporta `ok=false` porque una cerradura da error).
    // Decir «se ejecuta y no termina» a los segundos manda a mirar el reloj de la función cuando
    // la avería está en el `detalle` — el mismo error de dirección que esta función nació para
    // evitar, invertido. El parte va pegado detrás y distingue los dos casos.
    const matiz = hIntento !== null && hIntento <= maxHoras
      ? `, aunque SÍ arrancó hace ${hIntento.toFixed(1)} h: o se queda a medias, o termina y se declara con problemas — lo dice el parte`
      : ''
    return marcarPendiente({
      alerta: true,
      horas,
      motivo: `${horas.toFixed(1)} h sin una pasada buena (umbral ${maxHoras} h)${matiz}${coletilla}`,
    })
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
  /**
   * Fecha de alta de la vigilancia, `YYYY-MM-DD`. OBLIGATORIA: sin ella, un latido recién declarado
   * sale en rojo con «sin ninguna señal registrada» desde el minuto uno y hasta su primera pasada
   * —27 días en el caso de una rutina mensual—, que es justo la falsa alarma que este fichero existe
   * para no dar (ver `evaluarLatido`). Es la fecha del commit que añade ESTA entrada, no la del alta
   * del agente. Solo se usa mientras no haya ninguna señal: en cuanto el agente late una vez, deja
   * de importar para siempre.
   */
  vigiladoDesde: string
  /**
   * Avería REAL, ya vista y decidida, que no se va a arreglar todavía (04/09/2026). No es un
   * silenciador: es la diferencia entre «pendiente conocido» y «avería nueva», que hasta hoy se
   * pintaban igual.
   *
   * 🚨 POR QUÉ HACÍA FALTA. El 04/09 Alberto decidió dejar dos rojos vivos a propósito —la cerradura
   * de Bustos Tavera sin conexión y los establecimientos de SES sin dar de alta—. Los dos son
   * pendientes de verdad, así que apagarlos sería mentir; pero gritarlos cada mañana durante semanas
   * es la fatiga de alarma que acabábamos de quitar con el `estreno`, solo que por la otra puerta. Un
   * parte que siempre trae dos rojos deja de leerse, y entonces el tercero tampoco se ve.
   *
   * Tres candados para que esto NO pueda convertirse en un mute:
   *   1. `mientras` — marcador que TIENE que aparecer en el parte de hoy. Si el fallo cambia (otro
   *      código de Tuya, otro motivo), deja de casar y vuelve a sonar. Un parte SIN detalle tampoco
   *      casa: un cron que deja de correr grita igual que antes.
   *   2. `revisarEl` — fecha en la que caduca. Pasada, vuelve a rojo él solo; nadie tiene que
   *      acordarse de quitar nada.
   *   3. Sigue contando como ALERTA para la pantalla y para `agente_salud`: lo que se calla es la
   *      interrupción del Telegram, no el registro. `/operador/agentes` sigue diciendo la verdad.
   */
  pendienteConocido?: {
    /** Por qué se sabe y por qué no se arregla hoy. Va en el parte. */
    motivo: string
    /** `YYYY-MM-DD`. Pasada esta fecha vuelve a alertar sin más. */
    revisarEl: string
    /** Marcador literal que debe contener el `detalle` para seguir siendo ESTE fallo. */
    mientras: string
  }
}

// Registro extensible. Añadir un agente = una fila aquí + su probe SQL en el route.
// Sembrado (21/07/2026) con las huellas FIABLES y de más valor. Deliberadamente NO se vigilan:
//   - facturas (facturas_proveedor solo escribe si hay factura → falsa alarma),
//   - psd2/banca como TABLA (sin movimientos no escribe). Desde el 02/09/2026 se vigila la PASADA de
//     la skill psd2-health-check por su latido (`psd2_health_check`, abajo): antes «lo cubría la
//     skill» era una cobertura nominal — esa skill no tenía canal de aviso ni dejaba huella.
//   - trading (tiene su propio watchdog dedicado con lógica de días).
export const AGENTES_VIGILADOS: AgenteVigilado[] = [
  {
    id: 'correduria_renovaciones',
    vigiladoDesde: '2026-09-01',
    etiqueta: '🛡️ Renovaciones de la correduría (cron diario 06:30)',
    // Diario → 30 h: un tropiezo aislado pasa, dos días caídos saltan.
    maxHoras: 30,
    nota:
      'Nadie está mirando qué pólizas vencen. La ventana de renovación la marca la LCS art. 22 ' +
      '(el tomador solo puede oponerse hasta UN MES antes), así que cada día caído es cartera que ' +
      'se prorroga sola sin haberla retarificado. Lee el `detalle`, que separa las dos averías: ' +
      '«puerto sin configurar» es que falta ASEGURA_OPERADOR_SECRET en plataforma o en ' +
      'central-asegura (los dos valores deben ser el MISMO); «no se pudo leer la cartera» con un ' +
      'motivo es el puerto o la BD de asegura. Un «0 avisos» con ok NO es un fallo: es que hoy ' +
      'ninguna póliza cruzó un hito. Huella: agente_latidos.correduria_renovaciones.',
  },
  {
    id: 'correduria_ingesta',
    vigiladoDesde: '2026-09-01',
    etiqueta: '🛡️ Ingesta de CIMA — que los datos de las compañías entren (cron diario 06:45)',
    // Diario → 30 h, igual que el resto de los diarios: un tropiezo pasa, dos días saltan.
    maxHoras: 30,
    nota:
      '🚨 Este vigía nació de una avería que duró DOS MESES sin que nadie la viera: del 24/06 al ' +
      '30/08/2026 se quedaron 42 ficheros de CIMA sin procesar (23 recibos por 7.721,71€ de prima ' +
      'y 20 siniestros, casi todos de Occident C0468) mientras el health-check del CRM de origen ' +
      'estaba en verde — su parte traía `cuarentenaTotal: 41` y creciendo, pero sus señales de ' +
      'alarma miraban `ficherosError` y `ficherosDeferred`, que valían cero. Medía lo que no era. ' +
      'Aquí la señal es lo que se PIERDE. Lee el `detalle`: «no se ha podido comprobar» es que no ' +
      'hubo lectura (puerto, secreto o BD de asegura) y NO quiere decir que la ingesta vaya bien; ' +
      '«DEGRADADA» dice cuántos ficheros y de qué compañía. La causa más frecuente medida es que ' +
      'el recibo llega de una póliza que en la cartera está con OTRO nombre de compañía (Occident, ' +
      'Catalana Occidente y Plus Ultra son el mismo grupo bajo C0468). ' +
      'Huella: agente_latidos.correduria_ingesta.',
  },
  {
    id: 'ses_transporte',
    vigiladoDesde: '2026-08-21',
    // Decisión de Alberto (04/09/2026): «déjalo rojo, es un pendiente real». Lo es —la tabla está
    // vacía y la puerta al Ministerio no está montada—, pero hoy los partes los manda Chekin, así
    // que no hay incumplimiento y no hay prisa. Lo que no puede pasar es que grite cada mañana
    // hasta que se dé de alta: el parte se deja de leer y el día que SES falle de verdad no se ve.
    // ⚠️ `revisarEl` es una PROPUESTA (un mes), no una fecha que él haya dado. Cámbiala si no cuadra.
    pendienteConocido: {
      motivo: 'sin establecimientos dados de alta; hoy los partes los manda Chekin, así que no corre prisa',
      revisarEl: '2026-10-06',
      mientras: 'no hay ningún establecimiento dado de alta',
    },
    etiqueta: '🛂 Transporte con SES.HOSPEDAJES (parte de viajeros, cron diario 07:15)',
    // Diario a las 07:15 → 30 h dejan pasar un tropiezo aislado y cazan dos días caídos.
    maxHoras: 30,
    nota:
      'Hoy NO manda partes nadie de esta casa (los manda Chekin), así que esto no es todavía un ' +
      'incumplimiento — pero es la puerta por la que van a ir, y si se cierra hay que saberlo ANTES ' +
      'de depender de ella. 🚨 NO des por hecho que el Ministerio falla: lee el `detalle`, que ' +
      'separa TRES averías que mandan a sitios distintos. ' +
      '(1) «no hay ningún establecimiento dado de alta» NO es una caída: no se ha llegado a llamar ' +
      'a nadie, la tabla `ses_establecimientos` está vacía. Es un pendiente de CONFIGURACIÓN — dar ' +
      'de alta los pisos en /sivra/partes/establecimientos con sus credenciales del portal SES — y ' +
      'es lo que este latido mide desde que existe (medido el 04/09/2026: 0 filas). ' +
      '(2) «SES no responde» es ESPERAR: su entorno de pruebas llevaba días dando 502 el ' +
      '20/08/2026, y no se arregla desde aquí. ' +
      '(3) «credenciales o alta rechazadas» es ACTUAR, en el portal de SES, no en el repo. ' +
      'Y sospecha primero del CERTIFICADO si el detalle nombra TLS: la hoja de *.ses.mir.es ' +
      'caducaba el 03/09/2026 y al rotarla puede cambiar la cadena; el bundle FNMT bueno está en ' +
      '`packages/module-ses/certs/ses-ca-bundle.pem` y se carga con NODE_EXTRA_CA_CERTS. ' +
      'Huella: agente_latidos.ses_transporte.',
  },
  {
    id: 'pricing',
    vigiladoDesde: '2026-07-21',
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
    vigiladoDesde: '2026-08-08',
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
      'Huella: agente_latidos.trading_watchdog.',
  },
  {
    id: 'reservas_booking_vigia',
    vigiladoDesde: '2026-08-30',
    etiqueta: '🛎️ Vigía Booking↔Smoobu (reservas vistas por correo, cron cada 15 min)',
    // Cada 15 min → 3 h cazan un dispatcher tocado sin gritar por una pasada suelta perdida.
    maxHoras: 3,
    nota:
      'El vigía que caza reservas de Booking que Smoobu perdió (caso James Ascott 27-29/08/2026) ' +
      'no está corriendo o no termina. Mira el `detalle`: «sin poder comprobar (Smoobu no responde)» ' +
      'es Smoobu caído — que es JUSTO cuando más reservas se pierden, así que no lo dejes correr. ' +
      'Ruta: /api/sivra/reservas-booking/verificar · lógica en lib/sivra/reservas-booking-vigia.ts. ' +
      'Huella: agente_latidos.reservas_booking_vigia.',
  },
  {
    id: 'correo_triaje',
    vigiladoDesde: '2026-07-21',
    etiqueta: '📧 Triaje de correo (cron cada 10 min)',
    // El cursor avanza en cada pasada; 6 h de margen tolera noches tranquilas y caza un cron muerto.
    maxHoras: 6,
    nota: 'El cursor de correo no avanza. Revisa el cron correo-triaje en Vercel (¿IMAP/auth caídos?).',
  },
  {
    id: 'ialimp_pms',
    vigiladoDesde: '2026-07-31',
    etiqueta: '🧹 Sincronización del PMS de ialimp (Smoobu/iCal, cron cada 10 min)',
    // Cadencia de 10 min → 6 h son 36 pasadas perdidas: no es un tropiezo, está muerta.
    maxHoras: 6,
    nota:
      'Si el PMS no sincroniza, `cleaning_sessions` deja de recibir reservas y TODO lo que cuelga de ' +
      'ella miente en la misma dirección: la app de la limpiadora dice «Sin limpiezas este día», el ' +
      'briefing dice «sin sesiones programadas» y el panel se queda tan ancho. Es una vertical con ' +
      'cliente EN PRODUCCIÓN (Si que Brilla): un piso sin limpiar sale caro. Revisa el cron /api/pms/sync ' +
      'de ialimp y la clave de Smoobu en pms_connections.',
  },
  {
    id: 'facturas_gmail',
    vigiladoDesde: '2026-07-31',
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
    vigiladoDesde: '2026-08-06',
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
    vigiladoDesde: '2026-08-01',
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
    vigiladoDesde: '2026-08-12',
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
    id: 'sivra_eventos_calendario',
    vigiladoDesde: '2026-08-27',
    etiqueta: '📅 Calendario fijo de Sevilla (diario 03:30)',
    maxHoras: 30,
    nota:
      'Nadie está sembrando las fechas de Sevilla que se CALCULAN en vez de buscarse (Semana Santa ' +
      'derivada de la Pascua, y la Feria por tabla). Este cron no descubre nada: repone lo que ya se ' +
      'sabe, y por eso su silencio es especialmente traicionero — las otras cuatro fuentes de ' +
      '`pricing_eventos_auto` seguirán llenando la tabla y el hueco no se verá por ninguna parte. ' +
      'EXISTE porque el mapa `EVENTS` de lib/pricing-calendar.ts está ESCRITO A MANO y CADUCA ' +
      '(hoy, el 2027-05-02) mientras el horizonte de tarificación son 365 días: en cuanto el ' +
      'horizonte cruza el final del mapa, la Semana Santa se tarifica como un abril cualquiera. Eso ' +
      'ya costó dinero una vez — Busto Reform vendió la noche de la Madrugá a 141,00€ tres días ' +
      'antes de que alguien escribiera 2027 en el mapa. EL DETALLE DICE QUÉ PASÓ: los «años sin ' +
      'fechas de tabla» son un hueco DECLARADO (falta la Feria de ese año, hay que añadirla a mano ' +
      'en FIJOS), no un fallo del cron. ' +
      'Huella: agente_latidos.sivra_eventos_calendario.',
  },
  {
    id: 'sivra_canal',
    vigiladoDesde: '2026-08-19',
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
  // 🪦 `sivra_mercado_sweep` y `sivra_mercado_cron` se RETIRARON del registro el 24/08/2026 junto
  // con sus crons (ver `lib/cron-dispatch.ts`): la vía Serper murió por créditos el 22/08 y la
  // rutina de Booking ya cubre el corpus fiable. Un agente sin cron en el registro sería una
  // alarma diaria sin arreglo posible — exactamente el ruido que este vigía no puede permitirse.
  {
    id: 'sivra_mercado_booking',
    vigiladoDesde: '2026-08-06',
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
    id: 'sivra_pricing_apply',
    vigiladoDesde: '2026-08-23',
    etiqueta: '💰 Motor de precios, pasada automática (08:30 · 14:30 · 20:30)',
    // 🚨 El umbral sale de la ARITMÉTICA del cron, no de copiar el 30 h de los diarios. Corre 3
    // veces al día, así que el hueco legítimo más largo es 20:30 → 08:30 = 12 h. El vigía comprueba
    // a las 07:45, y ahí la última pasada buena de un día sano es la de las 20:30 de ayer: 11,25 h.
    // Con 26 h salta cuando se pierde un DÍA ENTERO (35,25 h desde anteayer) y se calla si solo
    // faltó alguna pasada suelta — que es lo que se quiere cazar aquí. Con 30 h no llegaría a
    // saltar hasta perder día y medio; con 12 h saltaría el primer despiste.
    maxHoras: 26,
    nota:
      'NADIE está escribiendo precios. Es el último eslabón: lo que decide este cron es lo que ve ' +
      'el huésped, y mientras esté mudo los cuatro pisos se quedan con el precio del último día ' +
      'que funcionó — que NO es «el mercado dice que están bien», es «no se ha podido mirar». ' +
      'LEE EL DETALLE, que distingue tres averías distintas y mandan a sitios opuestos: ' +
      '(1) «🛑 Smoobu RECHAZÓ» = el motor calculó bien y el CANAL no lo aceptó — mira la API key de ' +
      'Smoobu, no el pricing; esas noches NO se anotaron en `pricing_applied` a propósito, así que ' +
      'la tabla de auditoría sigue siendo verdad; (2) «degradado» = tarificó sin eventos, y esos ' +
      'precios no son de fiar para fechas de evento; (3) «pasada en ' +
      'curso — aún sin completar» con horas encima = arranca y muere antes de terminar (mira si hay ' +
      '504 en los logs: son 365 días × 4 pisos contra Smoobu con maxDuration 300). ' +
      '⚠️ «0 noche(s) escritas en 4 piso(s)» NO es una avería: es que nada cruzó el umbral del 3%. ' +
      'La avería sería que no hubiera latido. Huella: agente_latidos.sivra_pricing_apply.',
  },
  {
    id: 'sivra_domotica_acceso',
    vigiladoDesde: '2026-08-31',
    // Decisión de Alberto (04/09/2026): la cerradura no tiene conexión y se mira «más adelante».
    // 🚨 `mientras` es la firma EXACTA de los códigos de hoy, con su paréntesis de cierre: si
    // aparece un código más el marcador deja de casar y vuelve a sonar el mismo día. Y `revisarEl`
    // NO es «dentro de un mes» a ojo: el 14/09 entra la reserva 154230951 (20 noches), así que el
    // 12 es el último día en que reponer el PIN todavía sirve de algo.
    // ⚠️ Las dos son PROPUESTAS mías, no fechas que él haya dado.
    pendienteConocido: {
      motivo: 'cerradura de Bustos Tavera sin conexión (2001) y el respaldo offline rechazado (1109); se mira en el piso',
      revisarEl: '2026-09-12',
      mientras: '(Tuya 1109, 2001)',
    },
    etiqueta: '🔐 PIN por reserva de la cerradura (04:40 · 12:40 · 20:40)',
    // 3 pasadas/día → el hueco legítimo más largo es 20:40→04:40 = 8 h; el vigía mira a las 07:45.
    // 30 h salta al perder un día entero y se calla si solo falló una pasada.
    maxHoras: 30,
    nota:
<<<<<<< HEAD
      'Los PIN temporales de Tuya no se están poniendo. Desde el 31/08/2026 el mensaje de la ' +
      'víspera manda el PIN de ESA reserva, así que esto está en el camino del huésped. 🚦 Lo que ' +
      'NO pasa: nadie se queda en la puerta — sin PIN vivo el mensaje cae al código MAESTRO, que ' +
      'abre igual. Lo que SÍ pasa: se reparte una llave permanente en vez de una que caduca con la ' +
      'estancia, y en silencio. ' +
      '🚨 EMPIEZA POR EL `detalle`, y por el `motivo`: «se ejecuta y no termina» quiere decir que el ' +
      'cron SÍ está corriendo y que lo que falla son los PIN, que es otra avería y otro sitio donde ' +
      'mirar. El parte crudo de cada PIN está en `domotica_acceso_pin.detalle->>\'error\'` (estado ' +
      '`error`) — léelo antes de creerte ninguna hipótesis, esta incluida. Los códigos de Tuya ' +
      'medidos hasta hoy separan tres averías distintas: «2001 device is offline» es la cerradura ' +
      'sin conexión (batería/pasarela: se arregla EN EL PISO, no en el repo); «1109 param is ' +
      'illegal» sale en la vía OFFLINE, que es justo el respaldo que debería salvar al 2001, así ' +
      'que un 2001+1109 juntos dejan la reserva SIN PIN; «28841002 IoT Core subscription has ' +
      'expired» se renueva en platform.tuya.com. ' +
      '⚠️ NO des por hecho que es el IoT Core: esa era la explicación cableada aquí y el 04/09/2026 ' +
      'ya era FALSA — sus últimos errores eran del 03/08 y lo que fallaba ese día era 2001+1109 en ' +
      'BustoTavera, con tres reservas sin PIN (una con el huésped ya dentro). Un aviso que afirma ' +
      'una causa vieja como conocida es peor que no decir nada: manda a stand-by ante un fallo vivo. ' +
=======
      'Los PIN temporales de Tuya por reserva no se están creando. Desde el 31/08/2026 ' +
      'el mensaje de la víspera manda el PIN de ESA reserva, así que este cron está en el camino del ' +
      'huésped. 🚦 Lo que NO pasa: nadie se queda en la puerta — sin PIN vivo el mensaje cae al ' +
      'código MAESTRO de `sivra_codigos_acceso`, que abre igual (verificado 04/09/2026: los cuatro ' +
      'pisos lo tienen). Lo que SÍ pasa: se reparte una llave permanente en vez de una que caduca ' +
      'con la estancia, y en silencio. ⚠️ Este latido se pone rojo por DOS motivos distintos y hay ' +
      'que leer el `detalle` para saber cuál: (a) el cron no corre — mira `ultimo_at`; (b) el cron ' +
      'corre entero y hay cerraduras con ERROR — es el caso normal aquí, y entonces la avería es de ' +
      'la cerradura, no del cron. 🚫 NO se cablea aquí la causa del error de turno: esta nota tuvo ' +
      'un mes cableado el trial de IoT Core caducado como causa conocida, invitando a descartar el ' +
      'aviso, y el 04/09/2026 el error real era otro (`Tuya 2001: device is offline` en Bustos ' +
      'Tavera, que lleva 0 PIN creados de 10 intentos desde que existe). Un vigía que diagnostica ' +
      'por ti lo que no ha mirado te convence de no mirar. La causa se lee en ' +
      '`domotica_acceso_pin.detalle`. ' +
>>>>>>> origin/main
      'Huella: agente_latidos.sivra_domotica_acceso.',
  },
  {
    id: 'sivra_mensajes_prog',
    vigiladoDesde: '2026-08-31',
    etiqueta: '📬 Mensajes programados a huéspedes (cron cada 30 min)',
    // Cada 30 min → 6 h: caza medio día caído sin saltar por un tropiezo puntual del dispatcher.
    maxHoras: 6,
    nota:
      'El ciclo de mensajes automáticos a huéspedes (confirmación → acceso → víspera con códigos → ' +
      'bienvenida → salida) no está corriendo. Mientras un piso esté en MODO SOMBRA no le llega nada ' +
      'a ningún huésped (lo cubre Smoobu con sus plantillas de siempre); pero en un piso ACTIVADO en ' +
      '`mensajes_prog_pisos` este silencio significa que un huésped puede plantarse en la puerta SIN ' +
      'códigos. Lee el `detalle`: distingue «Smoobu no responde al listado» (esperar/reintentar) de ' +
      'fallos de envío (mirar `mensajes_programados` estado=fallo). ' +
      'Huella: agente_latidos.sivra_mensajes_prog.',
  },
  {
    id: 'sivra_extras_impago',
    vigiladoDesde: '2026-08-28',
    etiqueta: '🍼 Extras del huésped, cobros pendientes (diario 07:00)',
    // Cron diario → 30 h, el umbral de los diarios: deja pasar una pasada saltada sin dar la lata.
    maxHoras: 30,
    nota:
      'Nadie está vigilando los extras cobrados a medias. Lo que se pierde con este cron mudo NO es ' +
      'el cobro (el enlace de Stripe sigue vivo y el webhook seguiría marcando el pago), sino las dos ' +
      'cosas que dependen del tiempo: el recordatorio de las 24 h al huésped que no pagó, y el aviso a ' +
      'Alberto cuando quedan 48 h para la entrada y el extra sigue sin cobrar. O sea, el riesgo es un ' +
      'huésped que llega esperando una cuna que nadie va a montar porque nunca pagó y nadie se enteró. ' +
      '⚠️ «0 pendiente(s)» NO es una avería: es que no hay ningún enlace esperando cobro, que es lo ' +
      'normal. La avería sería que no hubiera latido. Huella: agente_latidos.sivra_extras_impago.',
  },
  {
    id: 'sivra_pricing_guard',
    vigiladoDesde: '2026-08-01',
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
  {
    id: 'paper_tracker',
    vigiladoDesde: '2026-08-23',
    etiqueta: '📊 Paper-tracker de trading (cron semanal lunes 10:00 UTC)',
    // Semanal → 192 h (8 días) de margen, mismo criterio que el de pricing: solo salta
    // si se pierde una semana entera + un día. Cron nuevo (18/08/2026, PR #1476) que ya
    // escribía su latido pero no estaba vigilado: nadie se enteraría si dejara de correr.
    maxHoras: 192,
    nota:
      'El paper-tracker (evolución de las cohortes de paper trading) no ha corrido esta semana. ' +
      'Revisa el cron `/api/cron/paper-tracker` (`0 10 * * 1`) en Vercel. ' +
      'Huella: agente_latidos.paper-tracker.',
  },
  {
    id: 'sivra_prevision',
    vigiladoDesde: '2026-08-30',
    etiqueta: '🔮 Foto diaria de la previsión por piso (diario 05:50)',
    // Diario → 30 h, el estándar de los diarios: tolera un día saltado.
    maxHoras: 30,
    nota:
      'La previsión por piso no se está fotografiando, y sin foto diaria el seguimiento ' +
      '«previsto vs real» de /sivra/resultado-pisos se queda con huecos — un mes sin snapshot ' +
      'previo no se puede juzgar nunca (queda «sin registro», no «acertó/falló»). También decide ' +
      'el aviso de previsión floja a ~30 días del mes, así que un mes flojo pasaría sin sonar. ' +
      'Mira los logs de /api/cron/prevision-pisos; si el detalle trae una excepción de BD sobre ' +
      '`pisos_previsiones`, revisa que la migración 2026-08-30 esté aplicada. ' +
      'Huella: agente_latidos.sivra_prevision.',
  },
  {
    id: 'sivra_rates_snapshot',
    vigiladoDesde: '2026-08-24',
    etiqueta: '📸 Snapshot de precios y disponibilidad de Smoobu (diario 07:00)',
    // Diario → 30 h, el estándar de los diarios: tolera un día saltado.
    maxHoras: 30,
    nota:
      'Es el job que MÁS pesa de la cadena de pricing: alimenta la ocupación y el precio VIVO ' +
      '(`rate_snapshots.price_live`) con el que se compara todo — el motor, el pilot-track, la ' +
      'ocupación por mes y el fallback `actual` del raíl. Si calla, todos ellos trabajan sobre la ' +
      'foto de ayer sin saberlo. Si el detalle trae «HTTP 401/403», la API key de Smoobu; si trae ' +
      'una excepción de BD, este cron. Huella: agente_latidos.sivra_rates_snapshot.',
  },
  {
    id: 'sivra_resumen_diario',
    vigiladoDesde: '2026-08-24',
    etiqueta: '📋 Resumen diario de pricing (cambios 24h + alertas, diario 09:00)',
    maxHoras: 30,
    nota:
      'El parte del día no se está escribiendo. No manda Telegram a propósito (sería ruido diario): ' +
      'su «cómo fue el día» vive en el DETALLE de este latido — cambios aplicados en 24 h y alertas ' +
      'abiertas de pricing_alerts. Si calla, nadie resume el día y las alertas abiertas se acumulan ' +
      'sin que se vean. Huella: agente_latidos.sivra_resumen_diario.',
  },
  {
    id: 'sivra_pilot_track',
    vigiladoDesde: '2026-08-24',
    etiqueta: '🚁 Seguimiento del piloto de precios (veredictos + watchdog, diario 09:15)',
    maxHoras: 30,
    nota:
      'El agente que VIGILA los datos de la cadena (snapshot viejo, mercado de +7 días, calendario ' +
      'corto) no está corriendo — y su silencio se leía como «datos frescos». `ok=false` con el ' +
      'detalle «⚠️ …» significa que corrió y encontró datos viejos: el fallo está en el job que ' +
      'nombra el aviso (rates/snapshot o la ingesta de mercado), no en éste. Un piso en 🔴 NO pone ' +
      'esto en rojo: es el agente haciendo su trabajo y ya avisa por Telegram. ' +
      'Huella: agente_latidos.sivra_pilot_track.',
  },
  {
    id: 'sivra_experimentos',
    vigiladoDesde: '2026-08-24',
    etiqueta: '🧪 Cierre de experimentos de pricing (¿la subida se reservó?, diario 08:00)',
    maxHoras: 30,
    nota:
      'El bucle de aprendizaje del pricing está congelado: nadie registra qué pasó con los precios ' +
      'que el motor cambió (auto_register_experiments / update_experiment_results, funciones SQL de ' +
      'la BD). Si el detalle trae un SQLSTATE, alguna migración se llevó una de las dos funciones ' +
      'por delante. «0 experimento(s) revisados» NO es avería: es un día sin fechas vencidas que ' +
      'cerrar. Huella: agente_latidos.sivra_experimentos.',
  },
  {
    id: 'trading_operaciones',
    vigiladoDesde: '2026-08-20',
    etiqueta: '📒 Libro de operaciones del bróker (pasada diaria, paso 1d)',
    // La pasada corre L-V ~20:15 UTC, así que el hueco legítimo más largo es viernes → lunes = 72 h.
    // 80 h evita saltar todos los lunes sin avería (mismo criterio que trading_watchdog).
    maxHoras: 80,
    nota:
      'El libro de ejecuciones no se está alimentando. NO es «no has operado»: la huella se escribe ' +
      'en CADA pasada, incluso cuando IBKR devuelve cero operaciones nuevas — precisamente para que ' +
      'un mes tranquilo no se confunda con un sincronizador roto. Mientras esté mudo, el cálculo ' +
      'fiscal (FIFO, regla de los dos meses) trabaja sobre un libro incompleto, y una ejecución que ' +
      'falta cambia la renta. Urge además por una razón con fecha: IBKR solo sirve unos cuatro ' +
      'trimestres hacia atrás por MCP, así que lo que no se vuelque a tiempo NO se puede recuperar ' +
      'después. Si el detalle dice «sin respuesta del conector», IBKR no contestó (NO es «no hubo ' +
      'operaciones»). Revisa en claude.ai → Rutinas que la pasada corre con el conector de IBKR ' +
      'adjunto y que su env lleva PLATAFORMA_URL + ALERTA_TOKEN. ' +
      'Huella: agente_latidos.trading_operaciones.',
  },
  // ── Rutinas de Claude Code (sesiones efímeras) que hasta el 02/09/2026 NO dejaban huella ──────
  // Las cinco de abajo eran vigías sin canal: 8 rutinas sin ALERTA_TOKEN, así que su Telegram no
  // salía, y además no escribían latido, así que tampoco se veían en ninguna pantalla. Un vigía
  // mudo y un vigía sin nada que reportar se ven igual: silencio. Ahora dejan latido por
  // /api/internal/latido (allowlist en esa ruta) y el veredicto se persiste en `agente_salud`.
  //
  // ⚠️ Hasta que sus prompts lleven el token, saldrán en ROJO con «sin ninguna señal registrada».
  // Es la verdad, no ruido: hoy están igual de mudas, solo que invisibles. Umbrales generosos a
  // propósito (cadencia real × ~1,2): mejor detectar tarde que dar falsas alarmas.
  {
    id: 'psd2_health_check',
    vigiladoDesde: '2026-09-02',
    etiqueta: '🏦 Guardián del sync bancario PSD2 (rutina semanal, miércoles 09:00)',
    // Semanal → 8 días: una semana perdida salta.
    maxHoras: 192,
    nota:
      'Nadie está comprobando que el banco siga entregando movimientos. Este era el vigía que ' +
      '«cubría» psd2/banca en este registro — y no tenía canal ni huella, así que la cobertura era ' +
      'nominal. Si el detalle dice «feed seco», el sync está roto de verdad; si dice «apuntes sin ' +
      'fecha», el banco entrega pero MAX(fecha_operacion) no lo ve (NO es un feed seco). Sin latido: ' +
      'o la rutina no se dispara, o su prompt no lleva ALERTA_TOKEN. Huella: agente_latidos.psd2_health_check.',
  },
  {
    id: 'facturas_correo',
    vigiladoDesde: '2026-09-02',
    etiqueta: '🧾 Facturas por correo (rutina diaria 11:00, la de Claude — NO el cron facturas_gmail)',
    maxHoras: 30,
    nota:
      'La rutina que clasifica facturas del Gmail (personal vs deducible) y las lleva a Drive no ' +
      'ha dejado huella. OJO: el cron `facturas_gmail` de las 06:15 es OTRO proceso sobre el mismo ' +
      'buzón y tiene su propio latido — que ese esté verde NO dice nada de este. Huella: ' +
      'agente_latidos.facturas_correo.',
  },
  {
    id: 'fiscal_novedades',
    vigiladoDesde: '2026-09-02',
    etiqueta: '⚖️ Radar fiscal IRPF + ayudas (rutina mensual, día 1)',
    // Mensual → 35 días.
    maxHoras: 840,
    nota:
      'El radar que compara las deducciones IRPF con IMPORTES_POR_ANIO y busca convocatorias de ' +
      'ayudas no ha pasado este mes. Una deducción que cambia y no se recoge es renta mal calculada; ' +
      'una ayuda con plazo que no se ve es dinero que caduca. Huella: agente_latidos.fiscal_novedades.',
  },
  {
    id: 'rrhh_compliance',
    vigiladoDesde: '2026-09-02',
    etiqueta: '📋 Calendario de obligaciones RRHH (rutina mensual, día 1)',
    maxHoras: 840,
    nota:
      'El informe mensual de obligaciones legales 🔴 pendientes de la vertical RRHH no ha salido. ' +
      'Huella: agente_latidos.rrhh_compliance.',
  },
  {
    id: 'github_vigia',
    vigiladoDesde: '2026-09-02',
    etiqueta: '🐙 Vigía GitHub/OSS: releases, npm outdated y CVE (rutina mensual, día 15)',
    maxHoras: 840,
    nota:
      'El vigía de releases y CVE de las dependencias no ha pasado este mes. Una CVE en una dep ' +
      'que nadie mira es la clase de aviso que solo se echa en falta después. Huella: ' +
      'agente_latidos.github_vigia.',
  },
]
