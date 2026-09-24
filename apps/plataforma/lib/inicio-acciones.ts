// Qué pide acción HOY, para la banda de arriba de Inicio.
//
// POR QUÉ (02/09/2026). Alberto: «la página de inicio tiene que tener resumen de lo más
// importante». Inicio no estaba vacío — estaba saturado: 512 líneas con saldo, cuentas, bróker,
// gráficas, P&L, fiscal, antifraude, fugas, benchmark y el libro entero de movimientos. Te lo daba
// todo y por eso no te decía nada.
//
// El criterio de esta banda es UNO: **¿puedo hacer algo hoy con esto?**. Un saldo no es una
// acción; una póliza que vence en 12 días sí. Lo que no es accionable se queda más abajo, que es
// donde se consulta.
//
// 🚨 Y la regla del CLAUDE.md manda aquí más que en ningún sitio, porque esta banda es lo primero
// que se lee: **dato que NO hay ≠ dato que NO se ha mirado**. Un `null` no es un cero. Si las
// pólizas no se han podido leer, la banda lo DICE en vez de callarse — callarse se leería como
// «no vence nada», que es justo la frase con la que se pierde una renovación.

export type Urgencia = 'roja' | 'ambar' | 'info'

export type Accion = {
  clave: string
  titulo: string
  /** Segunda línea: el porqué o el plazo. */
  detalle: string
  urgencia: Urgencia
  href: string
}

/**
 * Entrada de la banda. `null` significa SIEMPRE «no se ha podido comprobar», nunca cero — por eso
 * los contadores son `number | null` y no `number`.
 */
export type EstadoInicio = {
  /** Movimientos que la IA no supo asignar a un negocio. */
  porRevisar: number | null
  /** Abonos con negocio sin confirmar. */
  ingresosPorRevisar: number | null
  /** Posibles cargos duplicados sin resolver. */
  duplicados: number | null
  /** Facturas en la bandeja de `/expenses/pendientes`. */
  facturasPendientes: number | null
  /**
   * Frescura del feed bancario. Tres estados, no dos:
   *   número      → horas desde la última importación
   *   `null`      → NO se ha podido comprobar
   *   'no_aplica' → no hay ningún banco vinculado, así que no hay nada que estar viejo
   * Colapsar los dos últimos en un mismo `null` es el fallo clásico: «no hay banco» se leería
   * como «no se sabe» y llenaría la banda de un aviso que no aplica.
   */
  horasDesdeBanco: number | null | 'no_aplica'
  /** Pólizas que vencen, o el motivo por el que no se sabe. */
  polizas:
    | { estado: 'ok'; enDias: number; polizas: { cliente: string; dias: number }[] }
    | { estado: 'sin_configurar' }
    | { estado: 'error'; motivo: string }
    | null
}

/** Umbral del feed bancario: por encima, el saldo que se lee ya no es de fiar. */
export const BANCO_STALE_H = 48

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios
}

/**
 * Las acciones ordenadas por urgencia. Devuelve `[]` solo cuando de verdad no hay nada que hacer
 * Y todo se ha podido comprobar; cualquier hueco produce su propia fila «no se ha podido».
 */
export function accionesDeInicio(e: EstadoInicio): Accion[] {
  const out: Accion[] = []

  // ── Banco: lo primero, porque envenena todo lo demás ────────────────────────────────────────
  // Un saldo viejo no se distingue de uno bueno mirándolo. Si el feed está parado, cualquier
  // número de esta página es de hace días y hay que decirlo ANTES de que Alberto decida con él.
  if (e.horasDesdeBanco === 'no_aplica') {
    // Sin banco vinculado no hay frescura que vigilar. No es un hueco: es que no aplica.
  } else if (e.horasDesdeBanco == null) {
    out.push({
      clave: 'banco-desconocido', urgencia: 'ambar',
      titulo: 'No se sabe si el banco está al día',
      detalle: 'No se pudo leer la frescura del feed: los saldos de abajo pueden ser viejos.',
      href: '/banca',
    })
  } else if (typeof e.horasDesdeBanco === 'number' && e.horasDesdeBanco > BANCO_STALE_H) {
    const d = Math.floor(e.horasDesdeBanco / 24)
    out.push({
      clave: 'banco-viejo', urgencia: 'roja',
      titulo: 'El banco lleva sin actualizarse ' + (d >= 1 ? `${d} ${plural(d, 'día', 'días')}` : `${Math.round(e.horasDesdeBanco)} h`),
      detalle: 'Los saldos y el P&L de esta página son de antes de esa fecha.',
      href: '/banca',
    })
  }

  // ── Pólizas ─────────────────────────────────────────────────────────────────────────────────
  if (e.polizas == null || e.polizas.estado === 'error') {
    const motivo = e.polizas && e.polizas.estado === 'error' ? e.polizas.motivo : 'no se pudo consultar'
    out.push({
      clave: 'polizas-error', urgencia: 'ambar',
      titulo: 'No se han podido leer los vencimientos',
      detalle: `${motivo}. Esto NO significa que no venza ninguna póliza.`,
      href: '/correduria',
    })
  } else if (e.polizas.estado === 'ok' && e.polizas.polizas.length > 0) {
    const ps = [...e.polizas.polizas].sort((a, b) => a.dias - b.dias)
    const urgente = ps[0].dias <= 15
    out.push({
      clave: 'polizas', urgencia: urgente ? 'roja' : 'ambar',
      titulo: `${ps.length} ${plural(ps.length, 'póliza vence', 'pólizas vencen')} en ${e.polizas.enDias} días`,
      detalle: `La más próxima: ${ps[0].cliente}, en ${ps[0].dias} ${plural(ps[0].dias, 'día', 'días')}.`,
      href: '/correduria',
    })
  }

  // ── Trabajo pendiente de Alberto ────────────────────────────────────────────────────────────
  // Estos SÍ pueden ser cero de verdad (la consulta corrió y no encontró nada), así que un 0 no
  // pinta fila. El null es el que habla.
  const pendientes: { clave: string; n: number | null; uno: string; varios: string; detalle: string; href: string }[] = [
    { clave: 'por-revisar', n: e.porRevisar, uno: 'movimiento sin clasificar', varios: 'movimientos sin clasificar',
      detalle: 'Hasta que estén asignados, el P&L del mes está incompleto.', href: '/banca' },
    { clave: 'ingresos-por-revisar', n: e.ingresosPorRevisar, uno: 'ingreso sin negocio asignado', varios: 'ingresos sin negocio asignado',
      detalle: 'Cobros que no cuentan todavía en el resultado de ningún negocio.', href: '/banca?tab=ingresos' },
    { clave: 'duplicados', n: e.duplicados, uno: 'posible cargo duplicado', varios: 'posibles cargos duplicados',
      detalle: 'Confírmalos o descártalos: si son reales, hay dinero que reclamar.', href: '/banca' },
    { clave: 'facturas', n: e.facturasPendientes, uno: 'factura por revisar', varios: 'facturas por revisar',
      detalle: 'La bandeja acumula; el aviso de Telegram solo cuenta las de su pasada.', href: '/expenses/pendientes' },
  ]
  for (const p of pendientes) {
    if (p.n == null) {
      out.push({
        clave: `${p.clave}-desconocido`, urgencia: 'ambar',
        titulo: `No se pudo contar: ${p.varios}`,
        detalle: 'La consulta falló. No es que no haya: es que no se sabe.',
        href: p.href,
      })
    } else if (p.n > 0) {
      out.push({
        clave: p.clave, urgencia: 'info',
        titulo: `${p.n} ${plural(p.n, p.uno, p.varios)}`,
        detalle: p.detalle, href: p.href,
      })
    }
  }

  const PESO: Record<Urgencia, number> = { roja: 0, ambar: 1, info: 2 }
  return out.sort((a, b) => PESO[a.urgencia] - PESO[b.urgencia])
}

/** ¿Se ha podido comprobar TODO? Si no, la banda no puede decir «no hay nada pendiente». */
export function todoComprobado(e: EstadoInicio): boolean {
  return e.porRevisar != null && e.ingresosPorRevisar != null && e.duplicados != null
    && e.facturasPendientes != null && e.horasDesdeBanco !== null
    && e.polizas != null && e.polizas.estado !== 'error'
}
