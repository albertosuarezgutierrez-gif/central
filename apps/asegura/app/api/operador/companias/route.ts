import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { telefonoVerificadoPorCodigo } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias — el directorio de contacto por compañía
 * (`seguros.companias_dgs` + `seguros.compania_contactos`), que mantiene la
 * skill `agente-correduria`. No es cartera de cliente: no hace falta
 * `correduriaId` ni tenant-ámbito, es una tabla de REFERENCIA compartida
 * por toda la correduría.
 *
 * Desde el 13/09/2026 cada compañía trae VARIOS contactos (antes uno solo):
 * docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md.
 *
 * 📞 Desde el 23/09/2026 los teléfonos de siniestros NO salen de la BD: salen
 * del catálogo verificado de `@central/module-seguros`, el mismo que usan la
 * web y el portal. Las columnas `telefono_*` de `companias_dgs` quedan
 * obsoletas y se PISAN aquí para que ningún consumidor lea la copia vieja
 * (daba a Mapfre su línea médica como número de siniestros).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const companias = await prismaAsegura().companiaDgs.findMany({
      where: { activa: true },
      orderBy: { nombreComun: 'asc' },
      include: {
        contactos: {
          where: { activo: true },
          orderBy: { orden: 'asc' },
        },
      },
    })
    const conTelefonos = companias.map((c) => {
      const t = telefonoVerificadoPorCodigo(c.codigoDgs)
      return {
        ...c,
        telefonoSiniestros: t?.siniestros ?? null,
        telefonoAsistencia: null,
        whatsappSiniestros: t?.whatsapp ?? null,
        horarioSiniestros: t?.horario ?? null,
        telefonoFuente: t?.fuente ?? null,
        telefonoVerificadoEn: t?.verificadoEl ?? null,
      }
    })
    return NextResponse.json({ estado: 'ok', companias: conTelefonos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias', e) })
  }
}
