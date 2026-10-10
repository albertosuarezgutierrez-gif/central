import Link from 'next/link'
import { Pagina, cardStyle } from '@/components/ui'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import RiesgoPantalla from './RiesgoPantalla'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ El bloque «Pedir precio» cotiza AQUÍ (cotizador embebido de auto, moto y hogar): sus acciones de servidor corren
 * dentro de este segmento, y una cotización de Codeoscopic puede tardar hasta 150 s. Sin este margen plataforma la
 * cortaría antes y no sabríamos si nos han cobrado (0,50€). Mismo valor que `…-nuevo/page.tsx`; lo vigila
 * `cotizador-embebido.test.ts`.
 */
export const maxDuration = 180

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/**
 * El riesgo como pantalla (29/09/2026, docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md §5).
 * «Nosotros aseguramos riesgos: el riesgo no cambia, lo que cambia es la persona». Aquí viven las
 * figuras (tomador, propietario, conductores) y los presupuestos P1…Pn de ESTE riesgo. Hasta hoy la
 * ruta solo redirigía a la ficha del cliente; los enlaces que ya apuntan aquí (Vencimientos, «Hoy»)
 * llegan ahora a la pantalla del riesgo, que enlaza a su vez a la ficha.
 */
export default async function OportunidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await riesgoAsegura(id)
  const lectura = interpretarRiesgo(r.status, r.json)
  if (lectura.estado === 'ok') {
    return (
      <Pagina>
        <RiesgoPantalla inicial={lectura.riesgo} hoy={hoyMadrid()} />
      </Pagina>
    )
  }
  const sinConfigurar = typeof r.json === 'object' && r.json !== null && (r.json as Record<string, unknown>).estado === 'sin_configurar'
  const texto =
    lectura.estado === 'no_encontrado'
      ? 'Esta oportunidad no existe o no es de la correduría.'
      : sinConfigurar
        ? 'No se puede leer: falta conectar el puerto con central-asegura.'
        : `No se ha podido leer el riesgo (${lectura.motivo}). No es que no tenga datos: no se han podido mirar.`
  return (
    <Pagina>
      <div style={{ ...cardStyle, fontSize: 14 }}>
        <p style={{ margin: '0 0 8px' }}>{texto}</p>
        <Link href="/correduria" style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
          ← Volver a la correduría
        </Link>
      </div>
    </Pagina>
  )
}
