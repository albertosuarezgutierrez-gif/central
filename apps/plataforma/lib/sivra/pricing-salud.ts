// lib/sivra/pricing-salud.ts — veredicto PURO de salud del motor de precios de SIVRA.
//
// ─── POR QUÉ EXISTE (auditoría 27/08/2026) ──────────────────────────────────────────────
// La auditoría diaria vigilaba que los crons de pricing CORRIERAN (heartbeat `agente_latidos`
// + filas frescas en `pricing_applied`). Eso responde «¿el motor se movió?», que no es la
// pregunta cara. La pregunta cara es «¿lo que escribió está SANO?», y no la hacía nadie.
//
// Es la misma familia que el fallo del PR #1787 anotado en `CLAUDE.md`: **verde no dice que el
// diff sea el tuyo**. Aquí: un latido verde no dice que el precio sea el correcto. El motor
// puede correr las tres pasadas, escribir 500 noches, dejar el latido en ok=true y aun así
// haber desplomado un piso un 40% o haberse quedado con `apply_enabled=false` sin que nadie
// lo note hasta ver la factura del mes.
//
// Y hay precedente de las dos cosas:
//   · 20/07/2026 — una reserva de Luxury Busto entró a ~110€ con el mercado a ~160-185€.
//     De ahí salió `pricing-guardia.ts` (sub-mercado), que YA cubre «precio bajo vs mercado».
//   · 18/07/2026 — un cambio de raíl metió un doble conteo del premio de evento e iba camino
//     de 2.000€/noche en una fecha de Karol G (PR #985→#987).
// Este módulo NO repite el de sub-mercado: cubre lo que quedaba fuera —desplomes, suelos
// pisados, palancas apagadas en silencio y oscilación— con umbrales deterministas.
//
// ─── LA ASIMETRÍA DEL RAÍL, QUE ES LO QUE MÁS SE MALINTERPRETA ──────────────────────────
// Medido sobre los 10 días previos al 27/08/2026: el raíl ±20% se rompe AL ALZA con
// frecuencia (94 noches el 24/08, hasta 2,01×) y NUNCA a la baja (0 de ~4.200 noches).
// No es un fallo: `apply/route.ts` tiene el «salto de evento» —una fecha de evento CONOCIDA
// sube a su precio de golpe, sin rampa— y está deliberadamente limitado a subidas.
//
// Consecuencia para quien lea esto: **romper el raíl al alza puede ser NORMAL y no se avisa.**
// Lo que no puede pasar nunca es romperlo a la BAJA, porque eso es malvender, y es
// irreversible: la noche vendida barata no se recupera.
//
// ─── SALTOS LEGÍTIMOS AL ALZA: SON DOS, NO UNO ─────────────────────────────────────────
// Las dos fijan `eventTarget` en `apply/route.ts` y las dos se saltan el raíl a propósito:
//   1. **Salto de evento** — la fecha está en el calendario `EVENTS` de `lib/pricing-calendar.ts`
//      o en la tabla `pricing_eventos_auto`.
//   2. **Premio de mercado por fecha** (`premioMercadoFecha`) — el mercado MEDIDO de ese día
//      concreto va ≥1,5× su base normal, aunque nadie haya catalogado un evento. Existe justo
//      para lo contrario de lo que parece: es el hueco por el que Karol G y la Feria se
//      vendieron BARATAS.
// ⚠️ Contar solo la vía 1 infla la alarma y la vuelve inútil. Medido el 27/08/2026 sobre 7 días:
// descontando solo eventos quedaban 23 noches «sospechosas»; descontando también el premio de
// mercado quedan **4**. Una alarma de 23/día se ignora a la semana; una de 4 se mira.
//
// ⚠️ Y por eso NO se mide el raíl como `new_price / old_price` de la misma fila. El ancla del
// raíl es `ref24` —el último precio que aplicó el motor el día ANTERIOR— justamente para que
// tres pasadas al día no compongan ±20% tres veces (ver `pricing-ancla-rail.ts`). Medirlo
// contra `old_price` da falsos positivos a puñados: al auditar esto se contaron 112 «fuera de
// raíl» que eran redondeos a euro y anclas distintas.

export type PisoPricing = {
  propertyId: string
  enabled: boolean
  applyEnabled: boolean
  /** Palanca de anticipación. Apagada (0) por decisión de Alberto: ver docs/POSICION-MERCADO-lejano.md */
  antelacionK: number
  minPrice: number | null
  maxPrice: number | null
}

export type MedidaPricing = {
  pisos: PisoPricing[]
  /** Horas desde la última pasada de `apply-auto` que escribió algo. `null` = nunca ha escrito. */
  horasDesdeUltimaPasada: number | null
  /** Noches escritas en la última pasada. */
  nochesUltimaPasada: number
  /** Noches que bajaron MÁS del raíl respecto a su ancla del día anterior. Debe ser 0. */
  railBajaRoto: number
  /**
   * Noches que subieron más del raíl SIN que lo explique ninguna de las dos vías legítimas.
   * Ver `SALTOS LEGÍTIMOS` en la cabecera: hay que descontar evento Y premio de mercado.
   */
  railAlzaSinJustificar: number
  /** Noches escritas por debajo del `min_price` de su piso. Debe ser 0. */
  bajoMinimo: number
  /** Pares (piso, fecha) que cambiaron de dirección ≥3 veces en la ventana: ciclo límite. */
  oscilantes: number
}

export type Hallazgo = { sev: '🔴' | '🟠'; texto: string }
export type SaludPricing = { estado: '🔴' | '🟠' | '✅'; hallazgos: Hallazgo[] }

/** Cadencia de `apply-auto`: 08:30, 14:30 y 20:30 UTC. Con 10 h ya se ha saltado una pasada. */
export const HORAS_MAX_SIN_PASADA = 10

/**
 * Umbral de oscilación. Un precio que sube y baja tres veces en una semana sobre la MISMA
 * fecha no está convergiendo: está en un ciclo límite, y cada vuelta publica un precio
 * distinto al huésped. Se detectó en Luxury Busto el 27/08/2026 (149→119→95→114 en el bloque
 * de 51 noches sin comparables). Dos cambios de dirección pueden ser mercado moviéndose; tres
 * ya es el motor peleándose consigo mismo.
 */
export const CAMBIOS_DIRECCION_OSCILA = 3

export function saludPricing(m: MedidaPricing): SaludPricing {
  const h: Hallazgo[] = []

  // ── 🔴 Malventa: lo único verdaderamente irreversible ──────────────────────────────────
  if (m.railBajaRoto > 0) {
    h.push({
      sev: '🔴',
      texto: `${m.railBajaRoto} noche(s) bajaron MÁS del raíl del día. A la baja el raíl no tiene ` +
        `ninguna salida legítima (el salto de evento solo sube), así que esto es un desplome: ` +
        `revisa el ancla (pricing-ancla-rail.ts) y el techo de mercado antes de la próxima pasada.`,
    })
  }
  if (m.bajoMinimo > 0) {
    h.push({
      sev: '🔴',
      texto: `${m.bajoMinimo} noche(s) se escribieron por DEBAJO del min_price de su piso. ` +
        `El suelo es lo último que se aplica: si se lo saltó, se está vendiendo bajo coste.`,
    })
  }

  // ── 🔴 Palancas: el motor apagado no avisa solo ────────────────────────────────────────
  // Un `apply_enabled=false` no rompe nada visible: los crons siguen corriendo y el latido
  // sigue en verde. Simplemente los precios dejan de moverse, y eso solo se ve en la factura.
  for (const p of m.pisos) {
    if (!p.enabled || !p.applyEnabled) {
      h.push({
        sev: '🔴',
        texto: `${p.propertyId}: motor apagado (enabled=${p.enabled}, apply_enabled=${p.applyEnabled}). ` +
          `Si no lo apagó Alberto a propósito, el piso lleva sin tarifar desde entonces.`,
      })
    }
    if (p.minPrice == null) {
      h.push({ sev: '🔴', texto: `${p.propertyId}: sin min_price — no hay suelo que impida malvender.` })
    }
    // La palanca de anticipación se apagó el 27/08/2026 el mismo día de encenderla, y
    // `docs/POSICION-MERCADO-lejano.md` fija las TRES condiciones para volver a encenderla.
    // Que reaparezca en >0 sin que se hayan cumplido es un cambio que hay que ver.
    if (p.antelacionK !== 0) {
      h.push({
        sev: '🟠',
        texto: `${p.propertyId}: antelacion_k=${p.antelacionK} (estaba en 0). Reencenderla exige las ` +
          `tres condiciones de docs/POSICION-MERCADO-lejano.md — confirma que se cumplen.`,
      })
    }
  }

  // ── 🔴 Silencio: el motor que no escribe ───────────────────────────────────────────────
  if (m.horasDesdeUltimaPasada == null) {
    h.push({ sev: '🔴', texto: 'No consta NINGUNA pasada de apply-auto: el motor nunca ha escrito.' })
  } else if (m.horasDesdeUltimaPasada > HORAS_MAX_SIN_PASADA) {
    h.push({
      sev: '🔴',
      texto: `${m.horasDesdeUltimaPasada.toFixed(1)} h sin pasada de apply-auto (máx ${HORAS_MAX_SIN_PASADA} h ` +
        `con tres pasadas diarias): se ha saltado al menos una y los precios están envejeciendo.`,
    })
  } else if (m.nochesUltimaPasada === 0) {
    // 0 noches NO es un fallo por sí solo —puede ser que nada cambiara—, pero sí merece mirada:
    // es indistinguible de «la pasada abortó al principio». Regla NULL≠0 de CLAUDE.md.
    h.push({
      sev: '🟠',
      texto: 'La última pasada escribió 0 noches. Puede ser legítimo (nada que cambiar) o una pasada ' +
        'abortada: mira el `detalle` del latido antes de darlo por bueno.',
    })
  }

  // ── 🟠 Lo que huele mal pero no es sangre ──────────────────────────────────────────────
  if (m.railAlzaSinJustificar > 0) {
    h.push({
      sev: '🟠',
      texto: `${m.railAlzaSinJustificar} noche(s) subieron más del raíl sin que lo expliquen ni un evento ` +
        `ni el premio de mercado de su fecha. Son las únicas subidas de golpe que no tienen vía ` +
        `legítima conocida: comprueba que no sea un doble conteo del premio (18/07/2026, PR #985→#987).`,
    })
  }
  if (m.oscilantes > 0) {
    h.push({
      sev: '🟠',
      texto: `${m.oscilantes} par(es) (piso, fecha) oscilan: ≥${CAMBIOS_DIRECCION_OSCILA} cambios de ` +
        `dirección en la ventana. No converge — cada vuelta publica un precio distinto al huésped.`,
    })
  }

  const estado: SaludPricing['estado'] =
    h.some(x => x.sev === '🔴') ? '🔴' : h.length ? '🟠' : '✅'
  return { estado, hallazgos: h }
}
