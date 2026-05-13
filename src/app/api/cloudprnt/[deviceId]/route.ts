// src/app/api/cloudprnt/[deviceId]/route.ts
// ============================================================
// ia.rest · CloudPRNT endpoint
// ============================================================
// La impresora (Star CloudPRNT) hace polling aquí cada 5s.
// No hay bridge, no hay Pi, no hay técnico.
//
// Modelos compatibles:
//   Star TSP143IV (LAN/WiFi)   — recomendado, 80mm
//   Star mC-Print3              — compacto, 80mm
//   Epson TM-T20III + ePOS     — alternativa
//
// Setup para el dueño:
//   1. Enchufa la impresora a la red (ethernet o WiFi via Star app)
//   2. Imprime el "configuration ticket" → copia el DeviceID
//   3. En el panel /owner: Añadir impresora → pega el ID → elige sección
//   Listo. La IA hace el resto.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();

// ── Construcción del ticket ESC/POS (StarPRNT) ───────────────
function buildStarTicket(job: {
  mesa_codigo: string;
  camarero_nombre: string;
  numero_ticket: number;
  seccion: string;
  items: Array<{ nombre: string; cantidad: number; notas?: string }>;
}): string {
  // StarPRNT text format (simulado como texto plano con comandos ESC)
  // Para producción: usar el formato binario Star o la librería star-micronics-sdk
  const SEP = '--------------------------------';
  const lines: string[] = [];

  // Sección en grande (se puede hacer con comandos de tamaño real en producción)
  lines.push(SEP);
  lines.push(job.seccion.toUpperCase().padStart(20));
  lines.push(SEP);
  lines.push(`MESA ${job.mesa_codigo}`.padEnd(20) + `#${String(job.numero_ticket).padStart(4,'0')}`);
  lines.push(`${new Date().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`);
  lines.push(`${job.camarero_nombre}`);
  lines.push(SEP);
  lines.push('');

  for (const item of job.items) {
    lines.push(`${item.cantidad}x  ${item.nombre.toUpperCase()}`);
    if (item.notas) lines.push(`     ! ${item.notas}`);
  }

  lines.push('');
  lines.push(SEP);
  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

// ── GET — La impresora pregunta: "¿hay trabajo?" ─────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const token = req.nextUrl.searchParams.get('token');

  // Si viene con token → la impresora pide el contenido del job
  if (token) {
    const { data: job } = await supabase
      .from('print_jobs')
      .select('*, impresoras(seccion_id)')
      .eq('job_token', token)
      .single();

    if (!job) return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });

    // Marcar como enviado
    await supabase.from('print_jobs')
      .update({ status: 'enviado', sent_at: new Date().toISOString() })
      .eq('job_token', token);

    const content = buildStarTicket({
      mesa_codigo: job.payload.mesa,
      camarero_nombre: job.payload.camarero ?? 'Sala',
      numero_ticket: job.payload.ticket_num,
      seccion: job.payload.seccion ?? job.impresoras?.seccion_id ?? '',
      items: job.payload.items ?? [],
    });

    // Respuesta CloudPRNT: texto plano que la impresora imprime directamente
    return new NextResponse(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Sin token → polling normal: ¿hay jobs pendientes?
  // 1. Buscar la impresora por deviceId
  const { data: impresora } = await supabase
    .from('impresoras')
    .select('id')
    .eq('cloud_device_id', deviceId)
    .eq('activa', true)
    .single();

  if (!impresora) {
    // Impresora no registrada aún — respondemos "no hay trabajo" y dejamos
    // que el dueño la registre en el panel. La impresora sigue haciendo polling.
    return NextResponse.json({ jobReady: false });
  }

  // Actualizar último ping
  await supabase.from('impresoras')
    .update({ ultimo_ping: new Date().toISOString() })
    .eq('id', impresora.id);

  // Buscar el job pendiente más antiguo para esta impresora
  const { data: job } = await supabase
    .from('print_jobs')
    .select('job_token')
    .eq('impresora_id', impresora.id)
    .in('status', ['pendiente', 'encolado'])
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!job) {
    return NextResponse.json({ jobReady: false });
  }

  // Marcar el momento del polling
  await supabase.from('print_jobs')
    .update({ polled_at: new Date().toISOString(), status: 'encolado' })
    .eq('job_token', job.job_token);

  // Respuesta CloudPRNT estándar con el token del job
  return NextResponse.json({
    jobReady: true,
    jobToken: job.job_token,
    mediaTypes: ['text/plain'],
  });
}

// ── POST — La impresora confirma que ha impreso ──────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const body = await req.json().catch(() => ({}));
  const token = body.jobToken ?? req.nextUrl.searchParams.get('token');

  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  await supabase.from('print_jobs')
    .update({
      status: 'impreso',
      acked_at: new Date().toISOString(),
    })
    .eq('job_token', token);

  // Marcar los items de la comanda como impresos
  const { data: job } = await supabase
    .from('print_jobs')
    .select('comanda_id, seccion_id')
    .eq('job_token', token)
    .single();

  if (job) {
    await supabase.from('comanda_items')
      .update({ print_status: 'impreso', printed_at: new Date().toISOString() })
      .eq('comanda_id', job.comanda_id)
      .eq('seccion_id', job.seccion_id);
  }

  return NextResponse.json({ ok: true });
}
