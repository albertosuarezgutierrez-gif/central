import { autorizacionBearerValida } from '@central/core-identity'
import { conTaller, altaTallerBd } from '@/lib/db'
import { altaTaller, crearManejadorAlta } from '@/lib/alta-taller'

// POST /api/operador/talleres — alta de taller + configuración de alta + primer dueño (PIN temporal, devuelto UNA vez).
// Bearer `TALLER_OPERADOR_SECRET`. Cerrado por defecto: sin la variable no autoriza a nadie. Patrón de apps/rrhh (/api/operador/empresas).
export const dynamic = 'force-dynamic'

export const POST = crearManejadorAlta({
  autorizado: (req) => autorizacionBearerValida(req, 'TALLER_OPERADOR_SECRET'),
  alta: (entrada) => altaTaller({ crearTaller: altaTallerBd, conTaller: conTaller as never }, entrada),
})
