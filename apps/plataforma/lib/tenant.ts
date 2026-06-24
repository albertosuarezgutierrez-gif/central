// Shim de tenancy para el módulo de concursos (portado de ialimp).
// En ialimp el scope es `empresa_id`; en plataforma es la CUENTA (`cuenta_id` =
// `session.id`). Las rutas de concursos llaman `requireEmpresaId()` y guardan ese
// id como scope; aquí devolvemos el id de la cuenta de la sesión.
import { requireSession } from './session'

export async function requireEmpresaId(): Promise<string> {
  const s = await requireSession() // lanza si no hay sesión
  return s.id
}
