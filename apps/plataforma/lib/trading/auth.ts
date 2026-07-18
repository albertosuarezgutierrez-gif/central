import type { NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { getAdmin } from '@/lib/superadmin'

// Autorización de los endpoints de trading de SOLO LECTURA (selección/validación: factores, gurus,
// fundamentales, insiders, validar-oos). Acepta DOS vías:
//   1) el token de rutina (`ALERTA_TOKEN`/`CRON_SECRET`) — lo usan las rutinas de Claude Code, y
//   2) una sesión de SUPERADMIN válida (cookie `plataforma_admin`, verificada en BD por `getAdmin`).
// La vía (2) permite VERIFICAR estos endpoints desde el navegador ya logueado SIN pegar ningún secreto
// en la consola. Solo para endpoints que NO operan ni persisten (aquí solo LEEN y calculan). Los que
// pueden disparar avisos u operar en paper (p.ej. /analizar) siguen SOLO con token (`isRoutineAuthorized`).
export async function isTradingLecturaAutorizado(req: NextRequest): Promise<boolean> {
  if (isRoutineAuthorized(req)) return true
  try {
    return !!(await getAdmin())
  } catch {
    return false
  }
}
