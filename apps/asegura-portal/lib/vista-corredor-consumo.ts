// Consumo ATÓMICO del enlace de la vista de corredor (1 uso). Aparte de
// `vista-corredor.ts` (que importa Prisma) para poder probarlo sin BD.
//
// 🚨 `usadoEn: null` va EN el `where` del `updateMany`: con un `update` por id, dos
// aperturas simultáneas del mismo token leían ambas «válido» y ambas pasaban.
// Gana quien ve `count === 1`; la otra recibe `false` y debe contestar «usado».

export interface TxVistaCorredor {
  portalVistaCorredor: {
    updateMany(args: {
      where: { id: string; usadoEn: null }
      data: { usadoEn: Date }
    }): Promise<{ count: number }>
  }
}

export async function consumirEnlaceVista(tx: TxVistaCorredor, id: string, ahora: Date = new Date()): Promise<boolean> {
  const r = await tx.portalVistaCorredor.updateMany({ where: { id, usadoEn: null }, data: { usadoEn: ahora } })
  return r.count === 1
}
