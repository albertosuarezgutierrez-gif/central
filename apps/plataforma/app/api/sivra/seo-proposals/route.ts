import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const proposals = await prisma.$queryRaw<Array<{
      id: string
      title: string
      description: string
      og_description: string
      analysis: string
      current_title: string
      current_description: string
      top_competitors: any
      created_at: string
    }>>`
      SELECT id, title, description, "ogDescription" AS og_description,
             analysis, "currentTitle" AS current_title,
             "currentDescription" AS current_description,
             "topCompetitors" AS top_competitors,
             "createdAt" AS created_at
      FROM seo_proposals
      ORDER BY "createdAt" DESC
      LIMIT 20
    `

    return NextResponse.json({
      proposals: proposals.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        ogDescription: p.og_description,
        analysis: p.analysis,
        currentTitle: p.current_title,
        currentDescription: p.current_description,
        topCompetitors: p.top_competitors,
        createdAt: p.created_at,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
