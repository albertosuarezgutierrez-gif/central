// Explorador 0.3.30 (03/11/2026) · fixtures SINTÉTICAS con la FORMA del inventario real (sin PII):
// Fidelidade Vivienda (exploración 37f3fb2e… del 31/10/2026, bot 0.3.27): tras «Datos Cliente» llega «Domicilio» (`Domicilio.aspx`: uso y
// tipo de vivienda + dirección del riesgo). Su avance (input submit sin rótulo `…$FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton3`,
// clase «Button First Is_Default», onclick OsAjax) caía en `ruta_distinta`. Se añade SOLO esa ruta exacta. El «Buscar» de la dirección
// (`…$wtButtonSearch`, sin Is_Default) y el segundo submit (`…$wtNextButton2`, sin Is_Default) NO quedan cubiertos por la regla.
// TARIFICAR ≠ EMITIR: cada brazo que debe fallar, en rojo.
import { describe, it, expect } from 'vitest'
import { ENTRADAS_EXPLORACION, motivoNoAvanceSinTexto, sanearInventarioDom, validarRespuestaExplorador, type InventarioDom } from './index.ts'

const FI = 'fidelidade:particulares:vivienda'
const URL_DOMICILIO = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Domicilio.aspx'
const PRE = 'OPI_Theme_wt76$block$wtMainContent$FID_B2B_SIM_Pat_wtFormAssistantLayout$block$wtForm$'
const osAjax = (name: string) => `OsAjax(arguments[0] || window.event,'${name.replace(/\$/g, '_')}','${name}','','__OSVSTATE,',''); return false;`
const submit = (name: string, clase: string) => ({ tag: 'input', type: 'submit', id: name.replace(/\$/g, '_'), name, clase, onclick: osAjax(name), conValor: true })
const N_BUSCAR = `${PRE}FID_B2B_SIM_Pat_1_1_0_wt5$block$wtInput$OPI_ES_Entities_CW_wt53$block$wtButtonSearch`
const N_NEXT2 = `${PRE}wtNextButton2`
const N_AVANCE = `${PRE}FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton3`

function inv(url: string, extra: Record<string, unknown>[] = [], titulos: { texto: string; tag: string }[] = []): InventarioDom {
  return sanearInventarioDom(
    {
      marcos: [
        {
          url,
          nombre: 'm',
          titulos,
          elementos: [
            { tag: 'label', texto: 'Uso de la Vivienda' },
            { tag: 'input', type: 'radio', id: 'r1', name: 'uso', texto: 'PRINCIPAL', etiqueta: 'PRINCIPAL', conValor: true },
            { tag: 'label', texto: 'Tipo de vivienda' },
            { tag: 'input', type: 'radio', id: 'r2', name: 'tipo', texto: 'PISO PLANTA INTERMEDIA', etiqueta: 'PISO PLANTA INTERMEDIA', conValor: true },
            { tag: 'label', texto: 'Vía' },
            { tag: 'input', type: 'text', id: 'via', name: 'via', conValor: true },
            submit(N_BUSCAR, 'Button First ThemeGrid_Width2'),
            submit(N_NEXT2, 'Button First'),
            submit(N_AVANCE, 'Button First Is_Default'),
            ...extra,
          ],
        },
      ],
    },
    undefined,
    { refs: true },
  )!
}
// El saneado RECORTA el name largo (como en el inventario real): se localiza por la clase, que es lo que distingue a los tres submit.
const CLASE: Record<string, string> = { [N_BUSCAR]: 'Button First ThemeGrid_Width2', [N_NEXT2]: 'Button First', [N_AVANCE]: 'Button First Is_Default' }
const porName = (i: InventarioDom, name: string) => i.marcos[0].elementos.find((e) => e.tag === 'input' && e.type === 'submit' && e.clase === CLASE[name])!
const motivo = (i: InventarioDom, name: string) => motivoNoAvanceSinTexto(FI, porName(i, name), i.marcos[0])

describe('0.3.30 · Fidelidade «Domicilio»: el avance sin rótulo vale en Domicilio.aspx (ruta exacta vista en real)', () => {
  it('la regla incluye Domicilio.aspx y sigue sin ninguna pantalla de contratación/pago', () => {
    const rutas = ENTRADAS_EXPLORACION[FI].avancesSinTexto![0].rutas
    expect(rutas).toContain('/OPI_ES_Vivienda/Domicilio.aspx')
    expect(rutas.some((r) => /emis|contrat|pago|payment|firma|resumen/i.test(r))).toBe(false)
  })
  it('real (37f3fb2e): el avance Is_Default de Domicilio.aspx → autorizado', () => {
    expect(motivo(inv(URL_DOMICILIO), N_AVANCE)).toBeNull()
  })
  it('el validador acepta [avanzar] sobre ese control', () => {
    const i = inv(URL_DOMICILIO)
    const ref = porName(i, N_AVANCE).ref!
    const r = validarRespuestaExplorador(
      { version: 1, pantalla: { nombre: 'Domicilio', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
      { inventario: i, ramo: 'hogar', entrada: FI, datosReales: null },
    )
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })
  it('BRAZO «Buscar» (wtButtonSearch) y el otro submit (wtNextButton2) NO los cubre la regla (sin Is_Default)', () => {
    const i = inv(URL_DOMICILIO)
    expect(motivo(i, N_BUSCAR)).toBe('clase_distinta')
    expect(motivo(i, N_NEXT2)).toBe('clase_distinta')
  })
  it('BRAZO ruta parecida (mayúsculas, sufijo, carpeta) → ruta_distinta', () => {
    for (const p of ['/OPI_ES_Vivienda/domicilio.aspx', '/OPI_ES_Vivienda/Domicilio2.aspx', '/X/OPI_ES_Vivienda/Domicilio.aspx', '/OPI_ES_Vivienda/Domicilio.aspx/Emitir']) {
      expect(motivo(inv(`https://mediadores.fidelidade.es${p}`), N_AVANCE), p).toBe('ruta_distinta')
    }
  })
  it('BRAZO otro origen → origen_distinto', () => {
    expect(motivo(inv('https://otro.fidelidade.es/OPI_ES_Vivienda/Domicilio.aspx'), N_AVANCE)).toBe('origen_distinto')
  })
  it('BRAZO en Domicilio.aspx con texto de acción final o título de contratación → no se avanza', () => {
    expect(motivo(inv(URL_DOMICILIO, [{ tag: 'a', texto: 'Contratar póliza' }]), N_AVANCE)).toBe('texto_de_accion_final')
    expect(motivo(inv(URL_DOMICILIO, [], [{ texto: 'Resumen y contratación', tag: 'h2' }]), N_AVANCE)).toBe('titulo_de_emision')
  })
  it('BRAZO dos avances Is_Default en Domicilio.aspx → no_unico_en_marco', () => {
    expect(motivo(inv(URL_DOMICILIO, [submit(`${PRE}FID_B2B_SIM_Pat_wtNextButton$block$wtInput$wtNextButton4`, 'Button First Is_Default')]), N_AVANCE)).toBe('no_unico_en_marco')
  })
})
