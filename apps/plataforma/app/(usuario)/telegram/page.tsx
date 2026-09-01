import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import TelegramClient from './TelegramClient'

export const dynamic = 'force-dynamic'

// 🔔 Panel de avisos de Telegram: qué te manda el bot, cada cuánto, y el interruptor de cada uno.
// Todo el estado se carga por `/api/telegram/avisos` (la pantalla es un cliente de esa ruta).
export default async function TelegramPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <TelegramClient />
}
