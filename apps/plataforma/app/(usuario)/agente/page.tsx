import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Ídem: el chat del agente de precios vive en /asistentes.
export default async function AgenteRedirect() {
  redirect('/asistentes?a=precios')
}
