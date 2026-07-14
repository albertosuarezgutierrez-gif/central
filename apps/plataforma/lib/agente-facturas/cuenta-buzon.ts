// Resuelve a qué cuenta pertenece el buzón Gmail de facturas (GMAIL_USER). El buzón es de UNA sola
// cuenta; `escanearNuevasFacturas` lee ese buzón compartido e inserta bajo el cuentaId que reciba, así
// que escanearlo para CADA cuenta metía las facturas en los otros tenants (incl. el seed-demo) → avisos
// falsos de "proveedor nuevo". La dueña se resuelve por: env FACTURAS_CUENTA_ID → cuenta cuyo email ==
// GMAIL_USER → la única cuenta real si solo hay una. Si no se puede determinar, null (mejor no importar
// que importar en la cuenta equivocada). Puro (sin BD ni '@/') → testeable con node --test.

export type CuentaBuzon = { id: string; email: string | null; esDemo: boolean }

export function resolverCuentaBuzon(
  cuentas: CuentaBuzon[],
  opts: { facturaCuentaId?: string; gmailUser?: string } = {},
): string | null {
  const reales = cuentas.filter(c => !c.esDemo)
  const forzada = (opts.facturaCuentaId || '').trim()
  if (forzada && cuentas.some(c => c.id === forzada)) return forzada
  const gmail = (opts.gmailUser || '').trim().toLowerCase()
  if (gmail) {
    const dueña = reales.find(c => (c.email || '').trim().toLowerCase() === gmail)
    if (dueña) return dueña.id
  }
  return reales.length === 1 ? reales[0].id : null
}
