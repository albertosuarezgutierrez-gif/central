// 📒 Libro de OPERACIONES ejecutadas del bróker — parte PURA (sin BD): normalización del payload
// que empuja la pasada diaria del agente (`get_account_trades` de IBKR). El IO (Prisma) vive en
// operaciones-io.ts. Testeable con node --test.
//
// Diferencia con cartera-real.ts: aquella guarda la FOTO de lo que tienes ahora y se reemplaza
// entera en cada pasada. Esto es un LIBRO: cada ejecución es un hecho inmutable que se añade una
// sola vez y no se toca nunca más. Es la fuente del cálculo fiscal (FIFO por valores homogéneos,
// regla de los dos meses del art. 33.5.f LIRPF), donde perder o duplicar una línea cambia la renta.

export type OperacionIn = {
  /** Id de la ejecución en el bróker. Es la CLAVE de idempotencia: sin él no se puede reenviar
   *  la misma pasada sin duplicar el libro, así que una fila sin tradeId se descarta. */
  tradeId: string
  /** Id de la orden: varias ejecuciones (venues distintos) comparten orden. null = no lo dio. */
  orderId: string | null
  simbolo: string
  descripcion: string | null
  /** 'STK' | 'CASH' | … tal cual lo llama el bróker. null = no lo dijo. */
  tipoActivo: string | null
  lado: 'BUY' | 'SELL'
  cantidad: number
  precio: number
  divisa: string
  /** Ausente = 0: no pagar comisión es un hecho comprobable, no una incógnita. */
  comision: number
  /** Importe neto de la ejecución. null = el bróker no lo dio. */
  importeNeto: number | null
  /** 'MARKET' | 'STOP' | 'LIMIT' … null = no lo dijo. Es lo que permitió ver que el 94% de las
   *  ventas de 2026 salieron por STOP. */
  tipoOrden: string | null
  ejecutadoEn: Date
  /** Resultado realizado SEGÚN EL BRÓKER (IBKR usa coste medio). NO es el resultado fiscal
   *  español, que exige FIFO. Se guarda solo para conciliar. null = campo ausente o ilegible;
   *  0 = el bróker dijo que esa ejecución no realizó resultado (una compra, típicamente). */
  pnlBroker: number | null
  /** Unidades de `divisa` por 1 EUR el día de la operación. 1 para EUR (es un hecho, no una
   *  suposición); null para el resto = «TODAVÍA NO SE HA CONSULTADO». Jamás un 1 de relleno:
   *  colapsarlo daría importes en euros falsos sin ningún hueco que delate el fallo. */
  tipoCambio: number | null
}

// Número finito o null — un NaN/Infinity/string rara del bróker NO se convierte en 0 (regla del
// repo: colapsar «no lo sé» a 0 fabrica una afirmación falsa sobre dinero real).
function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Valida y normaliza las ejecuciones del body. Lo que no se puede leer se DESCARTA y se cuenta
 *  (el endpoint lo devuelve en la respuesta): una ejecución ilegible tragada en silencio es una
 *  compra o una venta que desaparece del libro fiscal sin que nadie se entere. */
export function normalizarOperaciones(raw: unknown): { operaciones: OperacionIn[]; descartadas: string[] } {
  if (!Array.isArray(raw)) return { operaciones: [], descartadas: ['payload sin array `operaciones`'] }
  const operaciones: OperacionIn[] = []
  const descartadas: string[] = []
  const vistos = new Set<string>()

  for (const [i, r] of raw.entries()) {
    const o = (r ?? {}) as Record<string, unknown>
    const tradeId = texto(o.tradeId)
    if (!tradeId) { descartadas.push(`fila ${i}: sin tradeId (sin él no hay idempotencia)`); continue }
    if (vistos.has(tradeId)) { descartadas.push(`${tradeId}: duplicado en el mismo envío`); continue }

    const simbolo = texto(o.simbolo)?.toUpperCase() ?? ''
    if (!simbolo) { descartadas.push(`${tradeId}: sin símbolo`); continue }

    const lado = texto(o.lado)?.toUpperCase()
    if (lado !== 'BUY' && lado !== 'SELL') { descartadas.push(`${tradeId}: lado inválido (${String(o.lado)})`); continue }

    const cantidad = num(o.cantidad)
    if (cantidad == null || cantidad <= 0) { descartadas.push(`${tradeId}: cantidad inválida`); continue }

    const precio = num(o.precio)
    if (precio == null || precio < 0) { descartadas.push(`${tradeId}: precio inválido`); continue }

    const ms = typeof o.ejecutadoEn === 'string' ? Date.parse(o.ejecutadoEn) : NaN
    if (!Number.isFinite(ms)) { descartadas.push(`${tradeId}: ejecutadoEn no es una fecha`); continue }

    const divisa = texto(o.divisa)?.toUpperCase() ?? 'EUR'

    vistos.add(tradeId)
    operaciones.push({
      tradeId,
      orderId: texto(o.orderId) ?? (typeof o.orderId === 'number' ? String(o.orderId) : null),
      simbolo,
      descripcion: texto(o.descripcion),
      tipoActivo: texto(o.tipoActivo)?.toUpperCase() ?? null,
      lado,
      cantidad,
      precio,
      divisa,
      comision: num(o.comision) ?? 0,
      importeNeto: num(o.importeNeto),
      tipoOrden: texto(o.tipoOrden)?.toUpperCase() ?? null,
      ejecutadoEn: new Date(ms),
      pnlBroker: num(o.pnlBroker),
      tipoCambio: divisa === 'EUR' ? 1 : null,
    })
  }
  return { operaciones, descartadas }
}
