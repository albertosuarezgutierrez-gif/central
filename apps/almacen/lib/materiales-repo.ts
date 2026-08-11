import type { Material } from '@central/module-materiales'

// Fila Prisma (Decimal llega como string/Decimal según driver): tipamos laxo.
type FilaMaterial = {
  id: string; cuentaId: string; negocioId: string | null; familiaId: string | null
  nombre: string; categoria: string; tipo: string; estado: string
  cantidadTotal: number; cantidadDisponible: number; unidadesPorBandeja: number
  stockMinimo: number | null; costeReposicion: unknown; precioCompra: unknown
  codigo: string | null; imagenUrl: string | null; activo: boolean
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))

/** Mapea una fila almacen_materiales al tipo Material de @central/module-materiales. */
export function aMaterial(f: FilaMaterial): Material {
  return {
    id: f.id,
    negocioId: f.negocioId ?? '',
    nombre: f.nombre,
    categoria: f.categoria,
    tipo: f.tipo as Material['tipo'],
    estado: f.estado as Material['estado'],
    cantidadTotal: f.cantidadTotal,
    cantidadDisponible: f.cantidadDisponible,
    stockMinimo: f.stockMinimo ?? undefined,
    precioCompra: num(f.precioCompra),
    costeReposicion: num(f.costeReposicion),
    codigo: f.codigo ?? undefined,
    imagenUrl: f.imagenUrl ?? undefined,
    activo: f.activo,
  }
}

/** Ajusta cantidad_disponible por el delta al editar cantidad_total (no pierde lo que está fuera). */
export function disponibleTrasEditarTotal(totalActual: number, dispActual: number, totalNuevo: number): number {
  return Math.max(0, dispActual + (totalNuevo - totalActual))
}

/** Lista los materiales activos de una cuenta, ordenados por familia y nombre. */
export async function listarMateriales(cuentaId: string) {
  // Import perezoso de Prisma: mantiene testeables las funciones puras de arriba
  // con `node --test` (type-stripping) sin cargar el cliente Prisma en cada test.
  const { prisma } = await import('./db')
  return prisma.almacenMaterial.findMany({
    where: { cuentaId, activo: true },
    orderBy: [{ familiaId: 'asc' }, { nombre: 'asc' }],
  })
}
