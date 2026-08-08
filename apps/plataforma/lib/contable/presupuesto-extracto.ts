// apps/plataforma/lib/contable/presupuesto-extracto.ts
// Reparto del tiempo de la pasada que importa un extracto de tarjeta. Módulo PURO (testeable con
// `node --test`): solo decide QUÉ pasos caben en el tiempo que queda; no mide ni ejecuta nada.
//
// Motivo (08/08/2026, fallo real en producción): subir el PDF de julio hizo todo el trabajo
// —109 movimientos importados, categorizados, cuadrados y archivados en Drive— y la función murió a
// los 60 s justo ANTES de contestar. En pantalla: «Sin respuesta.» sobre un extracto que sí había
// entrado; y como el usuario no puede saberlo, lo natural es volver a subirlo.
//
// La lección ya estaba escrita en el CLAUDE.md a cuenta de `facturas-scan`: subir el `maxDuration`
// solo mueve la pared. Lo que garantiza que la pasada VUELVE con una respuesta es reservar tiempo
// para responder y soltar por el camino lo prescindible — diciendo qué se ha quedado sin hacer, que
// es justo lo que distingue «hecho» de «no me dio tiempo».

/** Pasos opcionales, en el orden en que se sueltan cuando falta tiempo (el último es el primero en caer). */
export type PasoOpcional = 'telegram' | 'vigilantes' | 'drive' | 'gmail'

/** Milisegundos que hay que tener por delante para atreverse con cada paso. */
const COSTE_MS: Record<PasoOpcional, number> = {
  // Un mensaje por movimiento dudoso, cada uno con su sugerencia de IA: es el paso caro.
  telegram: 90_000,
  vigilantes: 40_000,
  drive: 30_000,
  gmail: 20_000,
}

/** Lo que hay que dejar SIEMPRE libre para cerrar la respuesta y escribirla en el log. */
export const RESERVA_RESPUESTA_MS = 15_000

export interface PlanPasos {
  hacer: Record<PasoOpcional, boolean>
  /** Pasos que NO caben, para poder decirlo en vez de callarlo. */
  saltados: PasoOpcional[]
}

/**
 * Qué pasos opcionales caben en `msRestantes`. Un paso solo entra si, además de su coste, deja la
 * reserva para responder. Se evalúan en orden de importancia, así que quedarse corto degrada de
 * forma predecible (primero se pierde la factura del correo, lo último el aviso al móvil).
 */
export function planificarPasos(msRestantes: number): PlanPasos {
  const orden: PasoOpcional[] = ['telegram', 'vigilantes', 'drive', 'gmail']
  const hacer = { telegram: false, vigilantes: false, drive: false, gmail: false }
  const saltados: PasoOpcional[] = []
  let queda = msRestantes
  for (const paso of orden) {
    if (queda - COSTE_MS[paso] >= RESERVA_RESPUESTA_MS) {
      hacer[paso] = true
      queda -= COSTE_MS[paso]
    } else {
      saltados.push(paso)
    }
  }
  return { hacer, saltados }
}

const ETIQUETA: Record<PasoOpcional, string> = {
  telegram: 'avisarte por Telegram de las compras dudosas (las tienes en la bandeja «por revisar» de /banca)',
  vigilantes: 'repasar cobros dobles y subidas de precio',
  drive: 'archivar el PDF en Drive (vuelve a subirlo cuando quieras: reimportar no duplica nada)',
  gmail: 'buscar las facturas del correo (lo reintenta el cron de esta noche)',
}

/** Línea para el resumen del chat. '' si no se saltó nada. */
export function lineaSaltados(saltados: PasoOpcional[]): string {
  if (!saltados.length) return ''
  return `⏳ No me dio tiempo a ${saltados.map(p => ETIQUETA[p]).join('; ')}.`
}
