// lib/sivra/pricing-descongelar.ts — la SEGUNDA llave de los congeladores.
//
// POR QUÉ (27/08/2026). El motor tiene dos guardas que abortan la escritura de una fecha para no
// bajarle el precio «a ciegas»: la de OUTLIER (el precio vivo supera en +40% lo normal del piso y
// faltan más de 30 días) y la de EVENTO A CIEGAS (noche de evento sin comps fiables de su fecha).
// Las dos son correctas por separado. La única llave que las abría era el techo de mercado
// MEDIDO (`pricing-techo-mercado.ts`), y esa llave exige ≥5 comparables fiables de la FECHA EXACTA.
//
// Medido ese día contra producción: de 279 noches A LA VENTA congeladas a más de 30 días vista,
// 249 —el 89%— no tenían esos comparables y por tanto NO PODÍAN descongelarse nunca. Algunas
// llevaban desde el 17 de junio con el mismo precio. El caso completo:
//
//     Busto Reform, 21-feb-2027 (Sevilla FC – Real Madrid, evento confirmado x1,35)
//     15/07  221€ → 717€   el salto de evento se salta el raíl: +224% en UNA pasada
//     17/07  459€ → 452€   última escritura
//     27/08  452€          41 días clavada, a la venta · mercado real de esa fecha: 116€
//
// La fecha se descongeló sola el 27/08 a las 08:30 —452€ → 362€— exactamente el día en que la
// rutina de Booking midió su fecha por primera vez. Ese es el problema en una frase: **el candado
// se abre el día que hay medición, y en tres cuartas partes del calendario no la hay.**
//
// LAS DOS LLAVES NUEVAS, y por qué son seguras:
//
//   1. ANTIGÜEDAD. Si la fecha lleva `diasMaximos` sin poder reescribirse, la guarda ha dejado de
//      proteger y ha pasado a atrapar. Bajar está acotado por el raíl de ±%/día, por el suelo del
//      propietario y por el suelo estacional: deshacer un ×2 cuesta 3-4 pasadas y es REVERSIBLE.
//      Quedarse a 2,3× el precio normal dos meses no lo es. El riesgo es asimétrico y al revés de
//      como lo trataba el motor.
//
//   2. RUMOR CAÍDO. Decisión de Alberto (27/08/2026): «no se puede coger un rumor, subir el precio
//      y dejarlos trancados». Un evento PREVISTO sube el precio ponderado por confianza (ver
//      `eventos-estado.ts`), y cuando `eventos/verificar` lo DESCARTA su premio desaparece… pero el
//      precio que ese premio empujó se queda arriba, y entonces cae en la guarda de outlier. La
//      apuesta se deshace en la tabla de eventos y NO en el precio. Aquí se cierra el ciclo: si la
//      fecha tuvo un evento descartado y hoy no le queda ningún evento vivo, se libera SIN esperar
//      los 21 días — la razón que justificaba el precio alto ya no existe.
//
//   3. SALTO NUESTRO. La guarda de outlier parte de que «este precio alto sabe algo que el modelo
//      no ve» (un puente, un evento). Esa premisa solo se sostiene si el precio viene de FUERA del
//      modelo. Un precio que el propio motor escribió hace unas horas no aporta ninguna prueba
//      independiente: es su propia salida, y usarla como evidencia deja al motor incapaz de
//      deshacer lo que acaba de hacer.
//
//      Caso fundacional (03/09/2026, PR #2228 y su seguimiento). El filtro de liga del #2192 subió
//      a Busto Reform 61 noches de jul/ago-2027 de 82€ a 113€ en la pasada de las 14:30. La guarda
//      de monotonía del #2228 corrigió el objetivo esa misma tarde… y no sirvió de nada: con la
//      base normal del mes en ~80€, 113/80 = 1,41 supera el OUTLIER_RATIO de 1,40, así que la
//      guarda leyó el precio inflado como «noche especial» y bloqueó la corrección. De 61 noches
//      solo se arreglaron 3 —las que quedaron justo por debajo del 1,40—. **La salida del fallo se
//      convirtió en la prueba que protegía al fallo**, y la llave por antigüedad no abría hasta
//      pasados 21 días.
//
//      Se libera SOLO cuando la última escritura del motor: (a) es reciente, (b) fue una SUBIDA,
//      (c) es la que CRUZÓ el umbral —antes de ella la fecha no era outlier— y (d) su precio es el
//      que hoy sigue vivo. Las cuatro juntas describen «el motor se acaba de disparar solo». Si el
//      propietario tocó el precio en Smoobu después, (d) falla y la guarda retiene: un precio suyo
//      sí es prueba de fuera del modelo. Y una fecha que lleva tiempo cara no cumple (a): esa la
//      sigue tratando la llave por antigüedad, que es más lenta a propósito.

//   4. DESCENSO EN CURSO. La guarda de outlier impide bajar «a ciegas» una noche que va +40% sobre
//      lo normal del mes. Pero mide ese +40% contra `normalBase` de HOY, y `normalBase` se mueve:
//      cuando el ancla del piso baja de golpe —una recalibración, un corpus nuevo— la distancia
//      aparece sin que el precio se haya tocado, y la guarda la lee como «esta noche es especial».
//
//      Caso fundacional (04/09/2026). El 03/09 se recalibró el ancla a la baja (#2192, #2228) y
//      `normalBase` cayó ~25% de golpe: **448 noches de los cuatro pisos** pasaron a cumplir la
//      condición de outlier sin que nadie hubiera subido nada, y se quedaron clavadas ARRIBA. Y lo
//      que las delata: en 243/279/186/242 de las noches lejanas a la venta **nuestra última
//      escritura fue una BAJADA**. O sea, el motor había decidido bajar, bajó lo que el raíl del
//      ±20%/día le dejó… y en la pasada siguiente su propia guarda le impidió terminar. Un descenso
//      que necesita 4-5 pasadas se paraba en la primera.
//
//      La guarda existe para frenar una bajada A CIEGAS. Un descenso que el propio motor empezó y
//      que sigue queriendo continuar no es ciego: es el mismo juicio, a medio aplicar. Por eso se
//      libera cuando nuestra última escritura reciente fue a la baja y su precio es el que sigue
//      vivo — si el propietario lo ha vuelto a subir en Smoobu, ese precio ya no es nuestro y la
//      guarda retiene.
//
//      Es la simétrica de la llave 3: aquella deshace nuestra SUBIDA disparada, esta termina
//      nuestra BAJADA interrumpida. Las dos parten de lo mismo — nuestra propia escritura reciente
//      no es prueba de nada sobre el mercado.

// 🚨 Lo que esto NO hace: no baja ningún precio por su cuenta ni toca el objetivo. Solo retira el
// veto de las guardas para que el resto del motor —raíl, suelos, techo— haga su trabajo. Y NO se
// aplica cuando la fecha SÍ tiene un evento vivo con premio: ahí el objetivo ya sube por su cuenta
// y la condición `target < old` de las guardas no llega a cumplirse.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Días sin poder reescribir una fecha a partir de los cuales la guarda deja de proteger. */
export const DIAS_CONGELADA = 21

/**
 * Horas dentro de las cuales una subida escrita por el motor sigue siendo «suya» y por tanto no
 * vale como prueba de que la noche es especial. Cubre con holgura las 3 pasadas del día (08:30 ·
 * 14:30 · 20:30) y un hueco de fin de semana; más allá, la fecha ya ha sobrevivido a varias
 * pasadas con datos nuevos y deja de ser un disparo suelto.
 */
export const HORAS_SALTO_NUESTRO = 48

/**
 * Días dentro de los cuales una bajada nuestra sigue siendo «un descenso en curso». El raíl es de
 * ±20% por día, así que deshacer un 1,8× cuesta 4-5 pasadas: la ventana tiene que cubrir el
 * descenso entero o la guarda lo volvería a parar a mitad. Más allá, la fecha ya se ha estabilizado
 * y vuelve a mandar la llave por antigüedad, que es más lenta a propósito.
 */
export const DIAS_DESCENSO_EN_CURSO = 7

export type DescongelarInput = {
  /**
   * Días desde la última escritura de ESA fecha en `pricing_applied`.
   * `null` = nunca se ha escrito (tampoco es un «no se sabe»: es que el motor nunca ha podido
   * ponerle precio, que es la forma más antigua de estar atrapada).
   */
  diasSinEscribir: number | null
  /** La fecha tuvo un evento DESCARTADO y hoy no le queda ninguno vivo. */
  rumorCaido: boolean
  /**
   * La última escritura del motor sobre esta fecha es una subida RECIENTE que cruzó ella misma el
   * umbral de outlier, y su precio es el que sigue vivo. O sea: el precio que la guarda está
   * protegiendo lo puso el propio motor, no el mercado ni el propietario.
   * Lo calcula quien tiene los precios delante (el route); aquí solo se decide con él.
   */
  saltoNuestro?: boolean
  /**
   * Nuestra última escritura reciente sobre esta fecha fue una BAJADA y su precio es el que sigue
   * vivo: el motor está a medio descenso y la guarda no puede interrumpirlo.
   */
  descensoEnCurso?: boolean
}

export type DescongelarOpts = {
  diasMaximos?: number
}

export type Descongelar = {
  /** true = las guardas de congelación no pueden retener esta fecha en esta pasada */
  libera: boolean
  /** por qué, para que una descongelación nunca sea muda */
  motivo: string
}

const RETIENE: Descongelar = { libera: false, motivo: '' }

export function descongelar(i: DescongelarInput, o: DescongelarOpts = {}): Descongelar {
  const diasMaximos = o.diasMaximos ?? DIAS_CONGELADA
  if (!(diasMaximos > 0)) return RETIENE

  // El rumor caído manda: la razón que subió el precio ya no existe, no hay nada que esperar.
  if (i.rumorCaido) {
    return { libera: true, motivo: 'el evento que subió esta fecha se descartó' }
  }

  // Un precio que escribimos nosotros hace horas no es prueba de nada: sin esto, el motor no
  // puede deshacer su propia subida y cualquier fallo que infle un precio se sella solo 21 días.
  if (i.saltoNuestro) {
    return { libera: true, motivo: 'la subida que la puso cara la escribió el motor hace horas' }
  }

  // Simétrica de la anterior: el motor ya decidió bajar y el raíl no le dejó llegar en una pasada.
  if (i.descensoEnCurso) {
    return { libera: true, motivo: 'el motor ya está bajando esta fecha y el raíl no le dejó llegar' }
  }

  const dias = i.diasSinEscribir
  if (dias == null) {
    return { libera: true, motivo: 'el motor nunca ha podido ponerle precio a esta fecha' }
  }
  if (!Number.isFinite(dias) || dias < 0) return RETIENE
  if (dias >= diasMaximos) {
    return { libera: true, motivo: `${dias} días sin poder reescribirse (tope ${diasMaximos})` }
  }
  return RETIENE
}

/**
 * Parte legible para la respuesta y el latido. Una descongelación en masa tiene que poder
 * distinguirse de una pasada normal sin abrir la BD.
 */
export function detalleDescongeladas(
  filas: { fecha: string; motivo: string }[],
): string | null {
  if (filas.length === 0) return null
  const porMotivo = new Map<string, number>()
  for (const f of filas) {
    // El nº de días varía por fecha: se agrupa por la FAMILIA del motivo, no por el texto exacto.
    const clave = f.motivo.includes('descartó')
      ? 'rumor descartado'
      : f.motivo.includes('el motor hace horas')
        ? 'subida propia reciente'
        : f.motivo.includes('ya está bajando')
          ? 'descenso en curso'
        : f.motivo.includes('nunca')
          ? 'nunca tarificada'
          : 'antigüedad'
    porMotivo.set(clave, (porMotivo.get(clave) ?? 0) + 1)
  }
  const trozos = [...porMotivo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} por ${k}`)
  return `🔓 ${filas.length} noche(s) descongelada(s): ${trozos.join(' · ')}`
}

/** La última escritura del motor sobre una fecha, tal y como la lee `pricing_applied`. */
export type UltimaEscritura = {
  /** horas transcurridas desde que se escribió */
  horas: number
  /** precio que había ANTES de esa escritura (`old_price`); `null` = no consta */
  prev: number | null
  /** precio que dejó esa escritura (`new_price`) */
  ult: number
}

export type SaltoNuestroCtx = {
  /** precio VIVO hoy en el canal, en la misma unidad que `prev`/`ult` */
  old: number | null
  /** «precio normal» del piso para ese día (mes/global), el mismo que usa la guarda de outlier */
  normalBase: number
  /** el OUTLIER_RATIO del motor; se recibe para no tener dos copias del umbral */
  umbral: number
  horasMax?: number
}

/**
 * ¿El precio alto que hoy protege la guarda de outlier lo puso el propio motor hace unas horas?
 *
 * Exige las CUATRO a la vez, y cada una descarta un caso en el que el precio sí es prueba de algo:
 *  (a) reciente — una fecha que lleva días cara ya ha sobrevivido a pasadas con datos nuevos;
 *  (b) fue una subida — si nuestra última escritura bajó, no hay disparo propio que deshacer;
 *  (c) la cruzó ella — si ya era outlier antes, la razón viene de más atrás y no es este salto;
 *  (d) su precio es el que sigue vivo — si el propietario lo cambió en Smoobu después, el precio
 *      de hoy es SUYO, viene de fuera del modelo y la guarda tiene que retener.
 *
 * Sin lectura de historial (`null`) devuelve `false`: no poder comprobarlo no es haber comprobado
 * que el salto es nuestro, y la degradación conservadora aquí es NO descongelar.
 */
export function esSaltoNuestro(ue: UltimaEscritura | null, ctx: SaltoNuestroCtx): boolean {
  if (!ue || ctx.old == null) return false
  if (!(ctx.normalBase > 0) || !(ctx.umbral > 0)) return false
  const horasMax = ctx.horasMax ?? HORAS_SALTO_NUESTRO
  if (!Number.isFinite(ue.horas) || ue.horas < 0 || ue.horas > horasMax) return false   // (a)
  if (ue.prev == null || !(ue.ult > ue.prev)) return false                              // (b)
  const techo = ctx.normalBase * ctx.umbral
  if (!(ue.ult > techo) || ue.prev > techo) return false                                // (c)
  return Math.round(ue.ult) === Math.round(ctx.old)                                     // (d)
}

/**
 * ¿Estamos a medio bajar esta fecha nosotros mismos?
 *
 * Exige las tres a la vez, y cada una descarta un caso en el que la guarda SÍ debe retener:
 *  (a) reciente — pasada la ventana, la fecha ya se estabilizó y manda la llave por antigüedad;
 *  (b) fue una BAJADA nuestra — si nuestra última escritura subió, esto no es un descenso;
 *  (c) su precio es el que sigue vivo — si el propietario lo ha vuelto a subir en Smoobu, el precio
 *      de hoy es SUYO y viene de fuera del modelo.
 *
 * Nótese que NO mira el objetivo de hoy: la condición `target < old` ya la comprueba la guarda que
 * llama a esto, y duplicarla aquí solo añadiría un sitio más donde equivocarse.
 *
 * Sin lectura de historial (`null`) devuelve `false`: no poder comprobarlo no es haber comprobado
 * que el descenso es nuestro.
 */
export function esDescensoNuestro(
  ue: UltimaEscritura | null,
  ctx: { old: number | null; diasMax?: number },
): boolean {
  if (!ue || ctx.old == null) return false
  const horasMax = (ctx.diasMax ?? DIAS_DESCENSO_EN_CURSO) * 24
  if (!Number.isFinite(ue.horas) || ue.horas < 0 || ue.horas > horasMax) return false  // (a)
  if (ue.prev == null || !(ue.ult < ue.prev)) return false                             // (b)
  return Math.round(ue.ult) === Math.round(ctx.old)                                    // (c)
}
