// Sincronización de calendarios iCal (Booking/Airbnb/VRBO/…) → cleaning_sessions.
// Fuente única usada por:
//   - el cron /api/pms/sync (cada 10 min, todas las propiedades con ical_urls)
//   - el portal del propietario /api/propietario/[token]/ical (guardar + probar)
// Mantener aquí TODA la lógica de parseo/upsert para que ambos caminos sean idénticos.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import dns from 'node:dns/promises'
import net from 'node:net'

// ── Guarda anti-SSRF ────────────────────────────────────────────────────────────
// La URL iCal la configura el propietario → input no confiable. Antes de hacer
// fetch server-side, exigimos http(s) y que el host NO resuelva a una IP interna
// (loopback / link-local / privada / metadata cloud 169.254.169.254).
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    return p[0] === 10 || p[0] === 127 || p[0] === 0
      || (p[0] === 169 && p[1] === 254)              // link-local + metadata
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168)
      || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) // CGNAT
  }
  const low = ip.toLowerCase().replace(/^\[|\]$/g, '')
  return low === '::1' || low === '::' || low.startsWith('fe80')
    || low.startsWith('fc') || low.startsWith('fd')  // ULA
    || low.startsWith('::ffff:')                     // IPv4-mapeada
}
async function isSafePublicUrl(raw: string): Promise<boolean> {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false
  if (net.isIP(host)) return !isPrivateIp(host)     // la URL ya trae una IP literal
  try {
    const addrs = await dns.lookup(host, { all: true })
    if (!addrs.length) return false
    return !addrs.some(a => isPrivateIp(a.address))
  } catch { return false }
}

// ── iCal parser ───────────────────────────────────────────────────────────────
export function parseIcal(text: string): any[] {
  const events: any[] = []
  const blocks = text.split('BEGIN:VEVENT')
  for (let i = 1; i < blocks.length; i++) {
    const b   = blocks[i]
    const get = (k: string) => {
      const m = b.match(new RegExp(k + '[^:]*:([^\r\n]+)'))
      return m ? m[1].trim() : ''
    }
    const dtstart = get('DTSTART')
    const dtend   = get('DTEND')
    const uid     = get('UID')
    const summary = get('SUMMARY')
    const desc    = get('DESCRIPTION')
    // Saltar bloqueos (Booking los llama "Not available" / "BLOCKED")
    if (!dtstart || !dtend) continue
    if (/not available|blocked|cerrado|closed/i.test(summary)) continue
    events.push({ uid, summary, desc, dtstart, dtend })
  }
  return events
}

export function icalToDate(s: string): string {
  // Soporta: 20260601 / 20260601T120000Z / 20260601T120000
  return s.replace(/T.*/, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
}

// ── Extraer nombre huésped del SUMMARY/DESCRIPTION de Booking/Airbnb ─────────
export function extractGuest(summary: string, desc: string): string | null {
  // Booking suele poner "Reserva - Nombre Apellido" o directamente el nombre
  // Airbnb: "Airbnb - CONFIRMADO: Nombre (code)"
  const patterns = [
    /reserva[- ]+(.+)/i,
    /booking[:\s-]+(.+)/i,
    /airbnb[^:]*:\s*(.+?)(?:\s*\(|$)/i,
    /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ])/,  // "Nombre Apellido"
  ]
  const s = (summary + ' ' + desc).trim()
  for (const p of patterns) {
    const m = s.match(p)
    if (m?.[1]?.trim().length > 2) return m[1].trim().slice(0, 60)
  }
  return summary?.slice(0, 60) || null
}

// Fecha de HOY en la zona horaria de España (la salida del huésped es lo que
// define la limpieza; comparamos contra el día local, no UTC).
function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

// Correo a la empresa por una limpieza de ÚLTIMA HORA (salida hoy, piso aún sin
// limpiar). No crítico: si falla o no hay proveedor SMTP, no rompe el sync.
async function avisarEmpresaUrgente(
  empresa: { nombre: string; email: string | null },
  piso: string, guest: string | null, fecha: string,
): Promise<boolean> {
  const transporter = getTransporter()
  if (!transporter || !empresa.email) return false
  const fechaEs = fecha.split('-').reverse().join('/') // YYYY-MM-DD → DD/MM/YYYY
  await transporter.sendMail({
    from:    `"${empresa.nombre}" <${MAIL_FROM}>`,
    to:      empresa.email,
    subject: `🔴 Limpieza de ÚLTIMA HORA hoy — ${piso}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px;">
        <div style="background:#dc2626;color:white;padding:20px 24px;border-radius:10px;margin-bottom:18px;">
          <h1 style="margin:0;font-size:20px;">🔴 Limpieza de última hora</h1>
          <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Salida HOY · ${fechaEs}</p>
        </div>
        <p style="font-size:15px;color:#1e293b;margin:0 0 10px;">Ha entrado una reserva nueva en el calendario y <b>${piso}</b> necesita limpieza <b>hoy</b>${guest ? ` (huésped: ${guest})` : ''}.</p>
        <p style="font-size:14px;color:#475569;margin:0 0 16px;">El piso todavía no consta limpio. Asigna una limpiadora cuanto antes desde la agenda.</p>
        <p style="font-size:12px;color:#94a3b8;margin:0;">Aviso automático de ialimp · sincronización de calendario iCal.</p>
      </div>`,
  })
  return true
}

// ── Sync iCal de una propiedad ────────────────────────────────────────────────
// prop debe traer: id, empresa_id, cliente_id, nombre, ical_urls, limpiadora_principal_id
export async function syncPropertyIcal(prop: any): Promise<{ synced: number; urgentes: number; errors: string[] }> {
  const urls: string[] = prop.ical_urls || []
  if (!urls.length) return { synced: 0, urgentes: 0, errors: [] }

  let synced = 0
  let urgentes = 0
  const errors: string[] = []
  // Datos de la empresa (nombre + email destino), cargados una sola vez y solo
  // si hace falta avisar. undefined = aún no consultado.
  let empresaInfo: { nombre: string; email: string | null } | undefined
  const seen = new Set<string>()
  const hoy  = todayMadrid()

  for (const url of urls) {
    try {
      if (!(await isSafePublicUrl(url))) {
        errors.push('URL no permitida — ' + url.slice(0, 40)); continue
      }
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'ialimp/1.0 calendar-sync' },
      })
      if (!res.ok) { errors.push('HTTP ' + res.status + ' — ' + url.slice(0, 40)); continue }

      const text   = await res.text()
      const events = parseIcal(text)

      for (const ev of events) {
        const checkout_date = icalToDate(ev.dtend)
        // El propietario controla la URL iCal → el DTEND es input no confiable.
        // Solo aceptamos fechas YYYY-MM-DD válidas (defensa en profundidad; además
        // el INSERT va parametrizado con Prisma.sql, no por interpolación).
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkout_date)) continue

        // Ignorar pasados (más de 7 días)
        const limite = new Date(); limite.setDate(limite.getDate() - 7)
        if (new Date(checkout_date) < limite) continue

        const external_id = prop.id + '_' + ev.uid
        if (seen.has(external_id)) continue
        seen.add(external_id)

        const guest     = extractGuest(ev.summary || '', ev.desc || '')
        const limp_id   = prop.limpiadora_principal_id || null

        // RETURNING (xmax = 0) = true sólo cuando fue un INSERT real (no un UPDATE):
        // así detectamos reservas NUEVAS sin re-avisar en cada pasada del cron.
        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO cleaning_sessions (
            empresa_id, cliente_id,
            property_id, propiedad_id, property_name,
            session_date, external_reservation_id,
            guest_name, tipo_servicio, origen,
            hora_checkout, limpiadora_id
          ) VALUES (
            ${prop.empresa_id}::uuid,
            ${prop.cliente_id || null}::uuid,
            ${prop.id},
            ${prop.id}::uuid,
            ${String(prop.nombre)},
            ${checkout_date}::date,
            ${external_id},
            ${guest || null},
            'rotacion', 'ical', '11:00',
            ${limp_id}::uuid
          )
          ON CONFLICT (external_reservation_id)
          DO UPDATE SET
            session_date  = EXCLUDED.session_date,
            guest_name    = EXCLUDED.guest_name,
            limpiadora_id = COALESCE(cleaning_sessions.limpiadora_id, EXCLUDED.limpiadora_id),
            property_name = COALESCE(NULLIF(cleaning_sessions.property_name, ''), EXCLUDED.property_name),
            propiedad_id  = COALESCE(cleaning_sessions.propiedad_id, EXCLUDED.propiedad_id),
            updated_at    = now()
          WHERE cleaning_sessions.completed_at IS NULL
          RETURNING (xmax = 0) AS inserted
        `)
        synced++

        // Reserva NUEVA con salida HOY = limpieza de última hora → avisar a la empresa.
        const esNueva = rows?.[0]?.inserted === true
        if (esNueva && checkout_date === hoy) {
          try {
            await prisma.$executeRaw(Prisma.sql`
              INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, datos)
              VALUES (
                ${prop.empresa_id}::uuid,
                'reserva_urgente',
                ${'🔴 Limpieza HOY (última hora) — ' + prop.nombre},
                ${'Nueva reserva en el calendario con salida HOY' + (guest ? ' · ' + guest : '') + '. Asigna limpiadora.'},
                ${JSON.stringify({ external_id, propiedad_id: prop.id, session_date: checkout_date, origen: 'ical' })}::jsonb
              )
            `)
            urgentes++
          } catch { /* el aviso no es crítico: no romper el sync */ }

          // Email a la empresa SOLO si ese piso no tiene ya una limpieza
          // completada hoy (si ya está limpio, no hay urgencia que avisar).
          try {
            const yaLimpio = await prisma.$queryRaw<any[]>(Prisma.sql`
              SELECT 1 FROM cleaning_sessions
              WHERE propiedad_id = ${prop.id}::uuid
                AND session_date = ${hoy}::date
                AND completed_at IS NOT NULL
              LIMIT 1
            `)
            if (!yaLimpio.length) {
              if (empresaInfo === undefined) {
                const er = await prisma.$queryRaw<any[]>(Prisma.sql`
                  SELECT nombre, email FROM empresas WHERE id = ${prop.empresa_id}::uuid LIMIT 1
                `)
                empresaInfo = { nombre: er[0]?.nombre || 'ialimp', email: er[0]?.email || null }
              }
              await avisarEmpresaUrgente(empresaInfo, prop.nombre, guest, checkout_date)
            }
          } catch { /* email no crítico: no romper el sync */ }
        }
      }
    } catch (e: any) {
      errors.push(url.slice(0, 40) + ': ' + (e.message || '').slice(0, 50))
    }
  }
  return { synced, urgentes, errors }
}
