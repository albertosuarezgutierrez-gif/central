import { autorizacionBearerValida } from '@central/core-identity'
import { fijarContabilidadEmpresaBd } from '@/lib/db'
import { crearManejadorVinculoContabilidad } from '@/lib/vinculo-contabilidad'

// PATCH — el operador vincula el taller con su empresa de contabilidad (el dueño no puede: 0010). Bearer `TALLER_OPERADOR_SECRET`.
export const dynamic = 'force-dynamic'

export const PATCH = crearManejadorVinculoContabilidad({
  autorizado: (req) => autorizacionBearerValida(req, 'TALLER_OPERADOR_SECRET'),
  fijar: fijarContabilidadEmpresaBd,
})
