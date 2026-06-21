import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { fetchLanding, pushToGitHub, applySeoReplacements } from '@/lib/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const prop = await prisma.seoProposal.findUnique({ where: { id } })
  if (!prop) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (prop.currentTitle == null || prop.currentDescription == null) {
    return NextResponse.json({ error: 'Esa propuesta no tiene snapshot del estado anterior; no se puede revertir.' }, { status: 422 })
  }

  try {
    const { content, sha } = await fetchLanding()
    const restored = applySeoReplacements(
      content,
      prop.currentTitle,
      prop.currentDescription,
      prop.currentOgDescription ?? '',
    )
    await pushToGitHub(restored, sha, `chore(seo): revertir a estado anterior [${new Date().toISOString().split('T')[0]}]`)
    await prisma.seoProposal.update({ where: { id }, data: { status: 'REVERTED' } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[seo-revert]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
