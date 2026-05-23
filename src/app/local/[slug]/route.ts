import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  return new NextResponse(`<html><body><h1>FUNCIONA: ${slug}</h1></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
