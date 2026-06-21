// Chat IA sobre el mapa de arquitectura ("pregúntale al mapa"). Solo lectura:
// pasa la radiografía + curaduría como contexto a aiComplete (NVIDIA NIM) y responde.
import { NextRequest, NextResponse } from 'next/server'
import { aiComplete } from '@central/core-ai'
import { getAdmin } from '@/lib/superadmin'
import { RADIOGRAFIA as R, MODULOS, VERTICALES, AGENTES } from '@/lib/estructura'

export const maxDuration = 30

function contexto(): string {
  const apps = R.verticales.map(app => {
    const mods = R.packages.filter(p => R.matrizModulos[p.id]?.[app]?.estado === 'usado').map(p => p.id)
    const caps = R.capacidades.filter(c => R.matrizCapacidades[c.id]?.[app]?.presente).map(c => c.label)
    const v = VERTICALES.find(x => x.app === app)
    return `- ${app}${v ? ` (${v.sector}: ${v.desc})` : ''}: usa [${mods.join(', ')}]; capacidades [${caps.join(', ')}]; ${(R.tablasPorVertical[app] || []).length} tablas; ${(R.apisPorVertical[app] || []).length} rutas API.`
  }).join('\n')
  const pkgs = R.packages.map(p => {
    const desc = MODULOS.find(m => m.id === p.id)?.desc || ''
    const usan = R.verticales.filter(v => R.matrizModulos[p.id]?.[v]?.estado === 'usado')
    return `- ${p.id} (${p.tipo}): ${desc} Lo usan: [${usan.join(', ')}]. Depende de: [${(R.depsModulos[p.id] || []).join(', ') || 'ninguno'}].`
  }).join('\n')
  const ag = AGENTES.map(a => `- ${a.nombre} (${a.ambito}): ${a.desc}`).join('\n')
  const gaps = R.gaps.reimplementaciones.map(r => `- ${r.label}: duplicada en ${r.duplicada.join(', ')} (debería usar ${r.modulo}).`).join('\n')
  return `# Arquitectura de la casa de marcas "central"
La raíz es la matriz. Las apps (apps/*) son verticales de producto. Los packages (@central/*) son módulos compartidos: core-* (infraestructura) y module-* (dominio puro). El operador modela clientes como Cuenta→Sociedad→Negocio.

## Apps\n${apps}

## Packages\n${pkgs}

## Agentes IA\n${ag}

## Avisos\n${gaps || '- (ninguno)'}`
}

export async function POST(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { pregunta } = await req.json().catch(() => ({}))
  if (typeof pregunta !== 'string' || !pregunta.trim()) {
    return NextResponse.json({ error: 'pregunta requerida' }, { status: 400 })
  }
  const system = 'Eres un asistente que conoce la arquitectura de un monorepo (casa de marcas). Responde SOLO con la información del contexto, en español, claro y conciso. Si la respuesta no está en el contexto, dilo. No inventes módulos, tablas ni clientes.'
  const prompt = `${contexto()}\n\n## Pregunta\n${pregunta.trim()}\n\n## Respuesta (basada solo en el contexto)`
  try {
    const respuesta = await aiComplete(prompt, { system, maxTokens: 700, timeoutMs: 25_000 })
    return NextResponse.json({ respuesta })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('NVIDIA_API_KEY')) {
      return NextResponse.json({ respuesta: 'El chat IA necesita la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma. Mientras tanto, usa el buscador y el detalle de cada nodo del mapa.' })
    }
    return NextResponse.json({ respuesta: 'No se pudo consultar la IA: ' + msg.slice(0, 140) })
  }
}
