// ────────────────────────────────────────────────────────────────────────────
// Titular de salud del sync de Smoobu → `incomes`. Puro (sin BD ni red): lo
// consume el Check 4 del health-check y lo cubren tests con `node --test`.
// ────────────────────────────────────────────────────────────────────────────
//
// 🚨 POR QUÉ EXISTE (31/07/2026). El Check 4 medía la salud del sync con
// `MAX(incomes."createdAt")` y avisaba en rojo por encima de 2 días. Pero esa
// columna solo avanza cuando entra una reserva NUEVA: no dice absolutamente
// nada sobre si el sync ha corrido. Con ~0,7 reservas nuevas al día (21 en 30
// días), los huecos de 3 a 7 días son lo NORMAL — el corpus ya traía uno de 7
// días (16→23 de junio) y otro de 5 (24→29 de junio). Resultado: 🔴 «Smoobu
// sync: último registro hace 5 días» el 31/07 mientras el cron de las 05:00
// había corrido esa misma mañana y devuelto 200.
//
// El fallo de fondo es el de siempre en este repo: **medir un agente por su
// producto en vez de por su latido**. Y tiene la cara peligrosa, no solo la
// molesta: el día que el sync SÍ muera, basta una reserva suelta (por el
// webhook, o por un reintento) para que el check se ponía verde y tape la
// avería. «No hay reservas nuevas» y «no se ha podido mirar Smoobu» eran el
// mismo silencio, exactamente como pasaba con el escaneo de facturas antes de
// `agente_latidos` (PR #1184).
//
// Desde aquí la fuente de verdad es la huella que `runSync` deja en
// `agente_latidos` en CADA pasada, corra bien o mal. `incomes` se queda para lo
// que sí sabe responder: cuántas reservas nuevas hay.

/** Huella de `agente_latidos` para el agente `smoobu_sync`. */
export interface LatidoSync {
  /** Última pasada COMPLETADA sin error. Es la que mide la frescura. */
  ultimoOkAt: Date | null
  /** Última pasada, haya ido bien o mal. */
  ultimoAt: Date | null
  /** Si la ÚLTIMA pasada terminó bien. */
  ok: boolean
  /** `detalle` tal cual está en BD (JSON escrito por `runSync`). */
  detalle: string | null
}

/** 🟢 todo en orden · 🟠 no se sabe / hay que mirarlo · 🔴 el sync no está sincronizando. */
export type NivelSync = 'ok' | 'aviso' | 'fallo'

export interface EstadoSync {
  nivel: NivelSync
  /** Frase lista para el Telegram del health-check (sin emoji: lo pone el caller). */
  titular: string
}

/**
 * Lee el `detalle` JSON que escribe `runSync`.
 *
 * Devuelve `null` en cada campo que no se pueda leer — **`null` es «no se sabe»,
 * nunca 0**. Un `detalle` viejo, truncado o de otro formato no debe convertirse
 * en «vio 0 reservas», que es justo la afirmación falsa que este módulo existe
 * para evitar.
 */
export function leerDetalleSync(detalle: string | null | undefined): {
  reservasVistas: number | null
  origen: string | null
  error: string | null
} {
  const vacio = { reservasVistas: null, origen: null, error: null }
  if (!detalle) return vacio
  try {
    const d = JSON.parse(detalle) as Record<string, unknown>
    if (d === null || typeof d !== 'object') return vacio
    return {
      reservasVistas: typeof d.vistas === 'number' ? d.vistas : null,
      origen: typeof d.origen === 'string' ? d.origen : null,
      error: typeof d.error === 'string' ? d.error : null,
    }
  } catch {
    return vacio
  }
}

function horasDesde(ahora: Date, antes: Date): number {
  return (ahora.getTime() - antes.getTime()) / 3_600_000
}

function fmtHoras(h: number): string {
  return h < 48 ? `${h.toFixed(1)} h` : `${Math.floor(h / 24)} días`
}

/**
 * Estado del sync a partir de su latido.
 *
 * `maxHoras` por defecto 30: el cron corre a diario (05:00 UTC) y el
 * health-check a las 07:00, así que 30 h tolera UNA pasada saltada sin dar la
 * lata y salta a la segunda. La ventana del sync es de 7 días e idempotente,
 * de modo que una pasada perdida no pierde datos — dos seguidas sí es señal.
 *
 * ⚠️ Ningún camino devuelve 'ok' sin una pasada BUENA y reciente confirmada. La
 * ausencia de latido es 'aviso' («todavía no se sabe»), nunca 'ok'.
 */
export function estadoSyncSmoobu(params: {
  ahora: Date
  latido: LatidoSync | null
  maxHoras?: number
}): EstadoSync {
  const { ahora, latido, maxHoras = 30 } = params

  // Sin fila: el vigía es más nuevo que el agente y aún no ha visto una pasada.
  // No es «va bien» y tampoco es «está roto»: es «no se sabe». Se resuelve solo
  // en cuanto corra el cron; si mañana sigue igual, el sync no está corriendo.
  if (!latido) {
    return {
      nivel: 'aviso',
      titular:
        'Smoobu sync: sin ninguna pasada registrada todavía — esto NO es «va bien», es «aún no se sabe». ' +
        'La primera pasada es a las 05:00 UTC; si mañana sigue sin registrar, el sync no está corriendo.',
    }
  }

  const { reservasVistas, origen, error } = leerDetalleSync(latido.detalle)

  // Ha corrido pero NUNCA ha completado bien: nada de lo que hay en `incomes`
  // se está refrescando, aunque el endpoint responda.
  if (!latido.ultimoOkAt) {
    const cuando = latido.ultimoAt ? `, último intento hace ${fmtHoras(horasDesde(ahora, latido.ultimoAt))}` : ''
    return {
      nivel: 'fallo',
      titular:
        `Smoobu sync: ha intentado sincronizar pero NUNCA ha completado una pasada buena${cuando}` +
        `${error ? ` → ${error}` : ''}. Las reservas de \`incomes\` están congeladas: revisa la clave de Smoobu en \`pms_connections\`.`,
    }
  }

  const horas = horasDesde(ahora, latido.ultimoOkAt)

  if (horas > maxHoras) {
    return {
      nivel: 'fallo',
      titular:
        `Smoobu sync: ${fmtHoras(horas)} sin una pasada buena (umbral ${maxHoras} h)` +
        `${error ? ` → ${error}` : ''}. Revisa el job \`/api/sivra/updates/sync\` y la clave de Smoobu en \`pms_connections\`.`,
    }
  }

  // Fresca pero la ÚLTIMA falló: el dato aún vale, pero el sync está tropezando.
  if (!latido.ok) {
    return {
      nivel: 'aviso',
      titular:
        `Smoobu sync: la última pasada FALLÓ${error ? ` (${error})` : ''}; la última buena fue hace ${fmtHoras(horas)}. ` +
        'Aún no hay datos viejos, pero si sigue fallando los habrá.',
    }
  }

  // Corre y completa, pero Smoobu no devuelve NI UNA reserva en su ventana. Con
  // 4 pisos activos eso es rarísimo y huele a clave con permisos recortados —
  // aunque en temporada muerta puede ser legítimo, así que 🟠 y no 🔴.
  if (reservasVistas === 0) {
    return {
      nivel: 'aviso',
      titular:
        `Smoobu sync: corre bien (hace ${fmtHoras(horas)}) pero Smoobu no ha devuelto NI UNA reserva en su ventana. ` +
        'Puede ser temporada muerta, o una clave de API con permisos recortados: compruébalo en Smoobu.',
    }
  }

  const vistas = reservasVistas === null ? '' : `, ${reservasVistas} reserva(s) en ventana`
  const via = origen ? ` vía ${origen}` : ''
  return { nivel: 'ok', titular: `Smoobu sync: activo (última pasada buena hace ${fmtHoras(horas)}${via}${vistas})` }
}
