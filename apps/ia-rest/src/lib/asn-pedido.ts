// Adaptador de los items de ASN de un pedido (campo `asn_items` de pedidos_proveedor)
// hacia la LineaASN genérica de @iarest/module-asn, para reutilizar el cálculo de totales.
import type { LineaASN, LineaASNAdapter } from '@iarest/module-asn'

export interface AsnItemRow {
  articulo: string
  cantidad?: number
  unidad?: string
  precio?: number
  lote?: string
  caducidad?: string
}

export const asnItemAdapter: LineaASNAdapter<AsnItemRow> = {
  toLinea(row): LineaASN {
    return {
      productoNombre: row.articulo,
      cantidad: row.cantidad ?? 0,
      unidad: row.unidad ?? null,
      precioUnitario: row.precio ?? null,
      lote: row.lote ?? null,
      caducidad: row.caducidad ?? null,
    }
  },
  fromLinea(l): AsnItemRow {
    return {
      articulo: l.productoNombre,
      cantidad: l.cantidad,
      unidad: l.unidad ?? undefined,
      precio: l.precioUnitario ?? undefined,
      lote: l.lote ?? undefined,
      caducidad: l.caducidad ?? undefined,
    }
  },
}
