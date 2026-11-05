import { conRepo, empresasActivasBd } from '@/lib/db'
import { crearManejadorCronAvisos, cronAutorizado, generarAvisosEmpresa } from '@/lib/avisos'

// GET /api/cron/avisos — cron diario (vercel.json). `Authorization: Bearer <CRON_SECRET>` (tiempo constante; sin la variable: 401).
// Evalúa los avisos de cada empresa en SU transacción RLS y los guarda en la app. NO envía push, correo ni Telegram a nadie.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = crearManejadorCronAvisos({
  autorizado: cronAutorizado,
  empresas: empresasActivasBd,
  procesar: (id) => conRepo(id, (repo) => generarAvisosEmpresa(repo, new Date()), { timeout: 30_000 }),
})
