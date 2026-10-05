/**
 * Cuerpo de `POST /api/operador/llamada` («¿quién llama?»). Puro, para probarlo sin Next.
 * El teléfono va en el CUERPO, nunca en la URL: la query string queda en los logs de Vercel.
 */
import { z } from 'zod'

export const CuerpoLlamada = z.object({ tel: z.string().trim().min(1).max(40) }).strict()
