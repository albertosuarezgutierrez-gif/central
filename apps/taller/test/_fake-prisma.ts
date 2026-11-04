/* eslint-disable @typescript-eslint/no-explicit-any */
// BD FALSA en memoria con la forma mínima de Prisma que usa la app (delegados + $transaction + $queryRaw).
// Emula lo que importa del schema `taller`:
//   · RLS: cada transacción solo ve/escribe filas de `set_config('taller.taller_id', …)`; sin ajuste, nada.
//   · WITH CHECK: insertar una fila de otro taller lanza.
//   · Rollback: si la función de la transacción lanza, las tablas vuelven al estado anterior.
// No es Postgres: lo comprobado aquí es la lógica de la app; el SQL real se probó en un Postgres desechable.

const CON_ACTIVO = new Set(['taller', 'tipoIva', 'tipoVehiculo', 'aceite', 'paquete', 'medioCobro', 'usuarioTaller', 'proveedor'])

export type BdFake = ReturnType<typeof crearBdFake>

export function crearBdFake() {
  let tablas: Record<string, any[]> = {}
  let n = 0
  const llamadasRaw: string[] = []
  let transacciones = 0
  const tabla = (m: string) => (tablas[m] ??= [])

  const coincide = (f: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) =>
      v !== null && typeof v === 'object' && !(v instanceof Date)
        ? Object.entries(v as object).every(([k2, v2]) => f[k2] === v2) // clave compuesta (tallerId_codigo…)
        : f[k] === v,
    )

  function crearTx() {
    const ajuste = { v: null as string | null }
    const visible = (m: string, f: any) => (m === 'taller' ? f.id === ajuste.v : f.tallerId === ajuste.v)
    const filas = (m: string, where: any) => tabla(m).filter((f) => visible(m, f) && coincide(f, where))
    const copia = (f: any) => (f ? { ...f } : null)

    const delegado = (m: string) => {
      const d = {
        findMany: async (a?: any) => filas(m, a?.where).map(copia),
        findFirst: async (a?: any) => copia(filas(m, a?.where)[0]),
        findUnique: async (a: any) => copia(filas(m, a?.where)[0]),
        create: async ({ data }: any) => {
          const fila = { ...(CON_ACTIVO.has(m) ? { activo: true } : {}), id: `id-${++n}`, ...data }
          if (!visible(m, fila)) throw new Error(`new row violates row-level security policy for "${m}"`)
          tabla(m).push(fila)
          return copia(fila)
        },
        update: async ({ where, data }: any) => {
          const f = filas(m, where)[0]
          if (!f) throw new Error(`${m}: registro no encontrado`)
          Object.assign(f, data)
          return copia(f)
        },
        upsert: async ({ where, create, update }: any) =>
          filas(m, where)[0] ? d.update({ where, data: update }) : d.create({ data: create }),
        deleteMany: async ({ where }: any) => {
          const fuera = new Set(filas(m, where))
          tablas[m] = tabla(m).filter((f) => !fuera.has(f))
          return { count: fuera.size }
        },
      }
      return d
    }

    return new Proxy({} as any, {
      get(_t, prop: string) {
        if (prop === '$queryRaw')
          return async (s: TemplateStringsArray, ...vals: unknown[]) => {
            const sql = s.join('?')
            llamadasRaw.push(sql)
            if (sql.includes("set_config('taller.taller_id'")) {
              ajuste.v = vals[0] as string
              return [{ v: vals[0] }]
            }
            return []
          }
        if (prop === '$executeRaw')
          return async (s: TemplateStringsArray, ...vals: unknown[]) => {
            llamadasRaw.push(`${s.join('?')} :: ${vals.map(String).join(',')}`)
            return 1
          }
        if (prop === '__ajuste') return ajuste.v
        return delegado(prop)
      },
    })
  }

  return {
    /** Cliente con `$transaction` (como PrismaClient). */
    cliente: {
      async $transaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
        transacciones++
        const antes = structuredClone(tablas)
        try {
          return await fn(crearTx())
        } catch (e) {
          tablas = antes
          throw e
        }
      },
    },
    /** Acceso directo SIN ajuste (como usar el cliente global fuera de conTaller). */
    sinAjuste: () => crearTx(),
    /** Siembra como operador (salta RLS), igual que 0002 aplicado como postgres. */
    sembrar(m: string, fila: any) {
      const f = { ...(CON_ACTIVO.has(m) ? { activo: true } : {}), id: `id-${++n}`, ...fila }
      tabla(m).push(f)
      return f
    },
    filas: (m: string) => tabla(m).map((f) => ({ ...f })),
    llamadasRaw,
    get transacciones() {
      return transacciones
    },
  }
}
