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
// 🚨 Lo que esto NO hace: no baja ningún precio por su cuenta ni toca el objetivo. Solo retira el
// veto de las guardas para que el resto del motor —raíl, suelos, techo— haga su trabajo. Y NO se
// aplica cuando la fecha SÍ tiene un evento vivo con premio: ahí el objetivo ya sube por su cuenta
// y la condición `target < old` de las guardas no llega a cumplirse.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Días sin poder reescribir una fecha a partir de los cuales la guarda deja de proteger. */
export const DIAS_CONGELADA = 21

export type DescongelarInput = {
  /**
   * Días desde la última escritura de ESA fecha en `pricing_applied`.
   * `null` = nunca se ha escrito (tampoco es un «no se sabe»: es que el motor nunca ha podido
   * ponerle precio, que es la forma más antigua de estar atrapada).
   */
  diasSinEscribir: number | null
  /** La fecha tuvo un evento DESCARTADO y hoy no le queda ninguno vivo. */
  rumorCaido: boolean
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
