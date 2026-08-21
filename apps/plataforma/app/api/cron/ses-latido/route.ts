// /api/cron/ses-latido — 💓 Latido del TRANSPORTE con SES.HOSPEDAJES.
//
// Comprueba a diario que seguimos pudiendo hablar con el Ministerio **por cada piso**:
// TLS, credenciales del servicio web y que el `codigoArrendador` tenga el WS habilitado.
// Deja huella en `agente_latidos.ses_transporte`, que es lo que vigila
// `/api/cron/agentes-latido` media hora después.
//
// 🚨 Es de SOLO LECTURA: usa la operación `C` (consulta), que no da de alta ni anula nada.
// No existe todavía ningún envío real de partes —hoy los manda Chekin— y este cron no
// envía ninguno.
//
// POR PISO, NO DE MUESTRA: cada establecimiento tiene sus propias credenciales, así que
// comprobar uno solo y dar por buenos los demás sería exactamente el «se puso verde
// porque no miró» que esta casa persigue. Se recorren todos los activos.
//
// POR QUÉ EXISTE ANTES QUE EL CONECTOR:
//   1. **La hoja del certificado de SES caduca el 03/09/2026.** Cuando la roten, esto es lo
//      único que dirá si la cadena sigue cerrando. Sin el latido nos enteraríamos el día que
//      hiciera falta enviar un parte, con un plazo legal de 24 h corriendo.
//   2. El entorno de pruebas del Ministerio (`pre-ses`) devolvía 502 a todo el 20/08/2026:
//      no hay sandbox. Lo único que se puede ensayar sin riesgo es exactamente esto.
//
// SOBRE LA CADENA DE CA: no se configura nada a propósito. La raíz `AC RAIZ FNMT-RCM` es
// pública y está en el almacén estándar, y SES sirve el intermedio, así que la verificación
// por defecto de Node debería bastar. Si NO basta en Vercel, este latido lo dirá con un
// detalle que nombra el TLS —y entonces se carga `packages/module-ses/certs/ses-ca-bundle.pem`
// vía `NODE_EXTRA_CA_CERTS`. Averiguarlo es parte de lo que este cron está midiendo.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { activosConCredencial, activosSinCredencial } from '@/lib/ses/establecimientos'
import { probarEstablecimiento } from '@/lib/ses/probar'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const [conCredencial, sinCredencial] = await Promise.all([
    activosConCredencial(),
    activosSinCredencial(),
  ])

  // Cero establecimientos NO es «todo en orden»: es que no hay nada configurado
  // todavía. Un vigía que se calla cuando no tiene a quién vigilar es un vigía que
  // se ha apagado sin avisar.
  if (conCredencial.length === 0 && sinCredencial.length === 0) {
    const detalle = 'no hay ningún establecimiento dado de alta en /sivra/partes/establecimientos'
    await registrarLatido('ses_transporte', false, detalle)
    return NextResponse.json({ ok: false, motivo: detalle })
  }

  // Latido de INTENTO antes de hablar con nadie. La huella se escribe DENTRO del
  // trabajo que vigila, así que si la pasada muere a mitad (timeout, excepción no
  // prevista) el vigía tiene que poder distinguir «no se dispara» de «se dispara y
  // no termina»: mandan a mirar a sitios distintos. No toca `ultimo_ok_at`.
  await registrarLatido('ses_transporte', false, `comprobando ${conCredencial.length} piso(s)…`)

  // Secuencial, no en paralelo: son cuatro pisos y no hay prisa, y así no se
  // aporrea al Ministerio con peticiones simultáneas desde la misma IP.
  const resultados: Array<{ nombre: string; ok: boolean; accion: string; detalle: string }> = []
  for (const e of conCredencial) {
    try {
      const r = await probarEstablecimiento(e.id)
      resultados.push({ nombre: e.nombre, ...r })
    } catch (err) {
      // Un piso que revienta —contraseña cifrada con una clave que ya no está,
      // BD que no responde— NO puede dejar sin comprobar a los otros tres. Y se
      // cuenta como fallo suyo, no como piso que no existe: un establecimiento
      // que desaparece del recuento es indistinguible de uno que va bien.
      const detalle = err instanceof Error ? err.message : String(err)
      resultados.push({ nombre: e.nombre, ok: false, accion: 'revisar_portal', detalle })
    }
  }

  const fallan = resultados.filter((r) => !r.ok)
  const ok = fallan.length === 0 && sinCredencial.length === 0

  // El detalle nombra QUÉ piso falla y CON QUÉ acción, porque «SES falla» sin más
  // obliga a abrir la pantalla para saber por dónde empezar.
  const partes: string[] = []
  if (resultados.length) {
    partes.push(`${resultados.length - fallan.length}/${resultados.length} pisos con transporte OK`)
  }
  for (const f of fallan) {
    const que = f.accion === 'esperar' ? 'esperar (no es nuestro)' : 'revisar portal SES'
    partes.push(`${f.nombre}: ${f.detalle} → ${que}`)
  }
  if (sinCredencial.length) {
    partes.push(`sin contraseña guardada: ${sinCredencial.map((e) => e.nombre).join(', ')}`)
  }

  const detalle = partes.join(' · ')
  await registrarLatido('ses_transporte', ok, detalle)

  return NextResponse.json({ ok, detalle, resultados, sinCredencial })
}
