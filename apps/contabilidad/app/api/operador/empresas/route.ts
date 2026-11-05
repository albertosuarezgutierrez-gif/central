import { altaEmpresaBd, altaUsuarioBd, conRepo } from '@/lib/db'
import { altaEmpresa, crearManejadorAlta } from '@/lib/alta-empresa'
import { bearerValido, ENV_OPERADOR } from '@/lib/secretos'

// POST /api/operador/empresas — alta de empresa desde plataforma `/operador/clientes` (patrón apps/rrhh).
// Bearer `CONTABILIDAD_OPERADOR_SECRET` (requireSecret, sin fallback; cerrado por defecto: sin la variable no autoriza a nadie).
export const dynamic = 'force-dynamic'

export const POST = crearManejadorAlta({
  autorizado: (req) => bearerValido(req.headers.get('authorization'), ENV_OPERADOR),
  alta: (cuerpo) => altaEmpresa({ altaEmpresa: altaEmpresaBd, altaUsuario: altaUsuarioBd, conRepo: (id, fn) => conRepo(id, fn, { timeout: 30_000 }), hoy: () => new Date() }, cuerpo),
})
