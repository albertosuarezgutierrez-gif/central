// Fuente de informes sobre el repositorio de UNA empresa (dentro de su transacción RLS).
import type { RepoContable } from '../repo.ts'
import type { FuenteInforme } from './generar.ts'

export const fuenteDeRepo = (repo: RepoContable): FuenteInforme => ({
  asientos: (o) => repo.asientosPeriodo(o),
  sumas: (o) => repo.sumasPorCuenta(o),
  partidas: (prefijos, hasta) => repo.partidasPorDocumento(prefijos, { hasta }),
})
