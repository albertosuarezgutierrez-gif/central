import { createServerClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function DELETE() {
  try {
    const supabase = createServerClient()
    
    const testEmails = [
      'alberto.suarez.gutierrez@gmail.com',
      'test.hosteleria@example.com',
      'test.catering@example.com',
      'test.espacios@example.com',
      'test.main@example.com',
      'juan.garcia@elbuencomer.com'
    ]

    const { error } = await supabase
      .from('leads_landing')
      .delete()
      .in('email', testEmails)

    if (error) {
      console.error('Error borrando leads:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      mensaje: '✅ Leads de prueba borrados',
      cantidad: testEmails.length 
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
