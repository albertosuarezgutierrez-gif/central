import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { SECRETS_REGISTRY } from '@/lib/secrets-registry'
import SecretosClient from './SecretosClient'

export const dynamic = 'force-dynamic'

export default async function OperadorSecretosPage() {
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try { admin = await getAdmin() } catch { admin = null }
  if (!admin) redirect('/dashboard')

  return <SecretosClient secrets={SECRETS_REGISTRY} />
}
