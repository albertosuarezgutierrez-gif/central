// Insiders (formulario 4 de la SEC): directivos y >10% que compran/venden acciones de SU empresa.
// La señal fuerte NO es una compra suelta (puede ser ejercicio de opciones, plan reglado…) sino el
// CLUSTER BUY: VARIOS insiders distintos comprando en el mercado abierto a la vez → el que manda la
// empresa cree que está barata. Ventas pesan menos (se vende por mil motivos: impuestos, diversificar).
// Puro y serializable: el consumidor aporta las transacciones ya parseadas del XML del Form 4.

export type TxInsider = {
  simbolo: string
  insider: string              // nombre del directivo/propietario que reporta
  rol?: string                 // CEO/CFO/Director/10% owner… (informativo)
  tipo: 'compra' | 'venta'     // P = open-market purchase, S = sale (transactionCode del Form 4)
  acciones: number             // nº de acciones de la transacción (>0)
  precioUsd?: number           // precio por acción reportado (opcional; para el neto en USD)
}

export type ConviccionInsider = {
  simbolo: string
  compradores: number   // nº de insiders DISTINTOS que COMPRAN (el cluster buy es la señal fuerte)
  vendedores: number    // nº de insiders DISTINTOS que VENDEN
  netoUsd: number       // Σ(compra) − Σ(venta) en USD (0 si ninguna transacción trae precio)
  score: number         // convicción: prioriza nº de compradores distintos, desempata por neto
}

// Agrega una lista PLANA de transacciones de insider por símbolo. Cuenta COMPRADORES/VENDEDORES
// DISTINTOS (un mismo insider que compra tres veces cuenta como UN comprador para el cluster, pero su
// dinero sí suma al neto). El score es determinista: (compradores − vendedores) y, a igualdad, el neto.
export function agregarInsiders(txs: TxInsider[]): ConviccionInsider[] {
  type Acc = { simbolo: string; compran: Set<string>; venden: Set<string>; netoUsd: number }
  const acc = new Map<string, Acc>()
  for (const t of txs) {
    if (!t.simbolo || !(t.acciones > 0)) continue
    const a = acc.get(t.simbolo) ?? { simbolo: t.simbolo, compran: new Set<string>(), venden: new Set<string>(), netoUsd: 0 }
    const usd = t.precioUsd && t.precioUsd > 0 ? t.acciones * t.precioUsd : 0
    if (t.tipo === 'compra') { a.compran.add(t.insider); a.netoUsd += usd }
    else { a.venden.add(t.insider); a.netoUsd -= usd }
    acc.set(t.simbolo, a)
  }
  return [...acc.values()]
    .map(a => {
      const compradores = a.compran.size
      const vendedores = a.venden.size
      return { simbolo: a.simbolo, compradores, vendedores, netoUsd: a.netoUsd, score: compradores - vendedores }
    })
    .sort((x, y) => y.score - x.score || y.netoUsd - x.netoUsd || y.compradores - x.compradores)
}
