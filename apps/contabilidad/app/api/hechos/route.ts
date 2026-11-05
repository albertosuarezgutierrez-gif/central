import { conRepo } from '@/lib/db'
import { crearManejadorHechos } from '@/lib/puerto-hechos'
import { recibirHecho } from '@/lib/servicio'

// POST /api/hechos — puerto de «hechos contables» de las verticales. Cabecera `X-Origen-App: <vertical>` +
// `Authorization: Bearer <CONTABILIDAD_HECHOS_SECRET_<VERTICAL>>` (requireSecret, sin fallback; tiempo constante).
// Cuerpo: { empresaId, hecho } (HechoContable de @central/module-contabilidad, SIN cuentas). Idempotente por (empresa, app, tipo, ref).
export const dynamic = 'force-dynamic'

export const POST = crearManejadorHechos({ conRepo: (id, fn) => conRepo(id, fn, { timeout: 20_000 }), recibir: recibirHecho })
