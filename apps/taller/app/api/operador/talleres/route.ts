import { autorizacionBearerValida } from '@central/core-identity'
import { conTaller, altaTallerBd, fijarRrhhEmpresaBd } from '@/lib/db'
import { altaTaller, crearManejadorAlta, crearManejadorVinculoRrhh } from '@/lib/alta-taller'

// POST /api/operador/talleres — alta de taller + configuración de alta + código del taller + primer dueño (PIN temporal, devuelto UNA vez).
// PATCH — el operador fija la empresa de rrhh del taller (el dueño no puede: 0006).
// Bearer `TALLER_OPERADOR_SECRET`. Cerrado por defecto: sin la variable no autoriza a nadie. Patrón de apps/rrhh (/api/operador/empresas).
export const dynamic = 'force-dynamic'

const autorizado = (req: Request) => autorizacionBearerValida(req, 'TALLER_OPERADOR_SECRET')

export const POST = crearManejadorAlta({
  autorizado,
  alta: (entrada) => altaTaller({ crearTaller: altaTallerBd, conTaller: conTaller as never, fijarRrhhEmpresa: fijarRrhhEmpresaBd }, entrada),
})

export const PATCH = crearManejadorVinculoRrhh({ autorizado, fijar: fijarRrhhEmpresaBd })
