import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const proposals = await prisma.seoProposal.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ proposals })
}
