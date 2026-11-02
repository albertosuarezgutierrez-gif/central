// Fixture SINTÉTICA reducida con la MISMA estructura de clases/ids que la pantalla real de modalidades de Mapfre Hogar (sin PII).
const NOMBRES = ['HOGAR TÚ ELIGES', 'HOGAR FAMILIAR', 'HOGAR PLATINO']
const PRIMAS = ['100,50 €', '200,00 €', '300,25 €']
export const card = (n: number, nombre = NOMBRES[n]!, prima = PRIMAS[n]!, cuota = prima) => `<div ng-repeat="modalidades in pchctrl.modalidadesCoberturas" class="ng-scope"><div tabindex="${n}" ng-model="pchctrl.modalidadSeleccionada" heading="20000${n}" class="col-md-3 ng-pristine ng-valid"><div id="superCoberturas" class="row affix-top"><div class="col-md-12 cabecera-modalidad2"><div class="row cabecera-modalidad texto-modalidad ng-binding">${nombre} <div ng-show="x" class=""><img alt="alerta" class="pull-right img-controles-tecnicos"></div><div ng-show="y" class="ng-hide"><img alt="circulo"></div></div><div class="row cabecera-modalidad importe ng-binding">${prima}</div></div></div><div class="row"><div class="col-md-12 paddingCoberturas2" style="height: 0px;"></div></div><div class="row col-md-12 recuadro-cuotas"><div ng-show="a" class=""><div class="row variacion-prima ng-hide"><div class="col-md-6 label-cuota ng-binding"> VARIACIÓN</div><div class="col-md-6 text-right importeCuota ng-binding"><span class="glyphicon ng-hide"></span>&nbsp;- €</div></div><div class="row"><div class="col-md-6 label-cuota ng-binding"> 1ª CUOTA</div><div class="col-md-6 text-right importeCuota ng-binding">${cuota}</div></div><div class="row"><div class="col-md-6 label-cuota ng-binding">SIGUIENTES (0)</div><div class="col-md-6 text-right importeCuota ng-binding"> - €</div></div></div><div ng-show="b" class="ng-hide"><div class="row"><div class="col-md-12 tarifa-no-aplicable ng-binding">ESTA TARIFA NO ES APLICABLE </div></div></div></div></div></div>`

export const tituloCob = (t: string) => `<div class="ng-scope"><div class="row"><div class="col-md-12 recuadro-coberturas descripcion"><div class="col-md-1 descripcionMas">+</div><div title="${t}" class="col-md-11 titulo-cobertura ng-binding">${t}</div></div></div>`
export const tituloGar = (t: string) => `<div class="ng-scope"><div class="row"> <div title="${t}" class="col-md-12 recuadro-garantias descripcion titulo-garantia ng-binding ng-hide">${t} </div></div></div>`
export const tituloDesc = (t: string) => `<div class="ng-scope"><div class="row recuadro-coberturas descripcion"><div class="col-md-12 titulo-cobertura">${t}</div></div></div>`
const envuelve = (id: string, inner: string) => `<div class="ng-scope"><div class="row col-md-12 recuadro-coberturas descripcion"><div class="col-md-12 internal-form"><div directiva-id="${id}" class="ng-isolate-scope"><div class="ng-scope">${inner}</div></div></div></div></div>`
export const celdas = {
  cruz: (id: string) => envuelve(id, '<div class="col-md-12 text-center cobertura-no-contratada"><img src="emision-hogar/img/cross.png" alt="cruz"></div>'),
  check: (id: string) => envuelve(id, '<div class="col-md-12 text-center cobertura-no-modificable"><img src="emision-hogar/img/check.png" alt="check"></div>'),
  combo: (id: string, imp: string, on: boolean) => envuelve(id, `<div class="col-md-4 toggle-cobertura-emision"><input id="toggle_combo_checkbox_${id}" type="checkbox" class="switch_checkbox hidden"${on ? ' checked' : ''}><label class="switch_toggle"></label></div><div class="col-md-8"><button type="button" class="input-margenm5 select-importe select">${imp}&nbsp;<span class="caret"></span></button></div>`),
  texto: (id: string) => envuelve(id, `<div class="col-md-4 toggle-cobertura-emision"><input id="toggle_campo_checkbox_${id}" type="checkbox" class="switch_checkbox hidden"><label class="switch_toggle"></label></div><div class="col-md-8"><input type="text" id="toggle_campo_input_${id}" class="form-control"></div><div class="col-md-12 texto-adicional-cobertura"><span class="ng-binding">Sin todo riesgo</span></div>`),
  valor: (id: string, imp: string) => envuelve(id, `<div class="col-md-12 text-centervalor"><label id="print_valor_${id}" class="control-label texto-importe">${imp}</label></div>`),
  gris: (id: string) => envuelve(id, `<div class="col-md-4 col-md-offset-2"><button type="button" class="select-dato select">0&nbsp;<span class="caret"></span></button></div><div id="print_valor_${id}" class="col-md-5 control-label texto-importe importe-gris">0,00 €</div>`),
}
/** Pantalla completa: 3 tarjetas, 5 filas principales (+ desglose plegado sin celdas) y 2 descuentos; celdas `cobertura_N_M` (N = modalidad). */
export function pantalla(opts: { cards?: string } = {}): string {
  const titulos = [
    tituloCob('DAÑOS VIVIENDA') + tituloGar('INCENDIO Y OTROS DAÑOS VIVIENDA') + tituloGar('ROBO VIVIENDA') + '</div>',
    tituloCob('JOYAS') + tituloGar('ROBO JOYAS') + '</div>',
    tituloCob('RESPONSABILIDAD CIVIL') + '</div>',
    tituloCob('ASISTENCIA URGENTE') + '</div>',
    tituloCob('CONSORCIO') + tituloGar('CONSORCIO DAÑOS MATERIALES') + '</div>',
  ]
  const descuentos = [tituloDesc('DESCUENTO POR INTEGRALIDAD'), tituloDesc('DESCUENTOS COMERCIALES POR CAMPAÑAS')]
  const hueco = (n: number) => '<div class="ng-scope"></div>'.repeat(n)
  const col = (n: number) => {
    const c = (i: number) => `cobertura_${n}_${i}`
    const celdasCol = [
      celdas.texto(c(0)) + hueco(2),
      (n === 0 ? celdas.cruz(c(1)) : celdas.combo(c(1), n === 1 ? '1.500,00 €' : '12.000,00 €', true)) + hueco(1),
      celdas.combo(c(2), n === 0 ? '60.000,00 €' : n === 1 ? '120.000,00 €' : '300.000,00 €', true),
      celdas.check(c(3)),
      celdas.valor(c(4), '94.875,76 €') + hueco(1),
    ]
    return `<div class="ng-scope"><div class="col-md-4">${celdasCol.map((x) => `<div class="ng-scope">${x}</div>`).join('')}</div></div>`
  }
  const colDesc = (n: number) => `<div class="ng-scope"><div class="col-md-4">${[0, 1].map((k) => `<div class="ng-scope"><div class="row col-md-12 recuadro-coberturas descripcion"><div class="col-md-12"><div directiva-id="descuento_${n}${k}" class="ng-isolate-scope"><div class="ng-scope"><div class="col-md-12 text-centervalor"><label class="control-label">${k === 0 ? '8,0 %' : '-'}</label></div></div></div></div></div></div>`).join('')}</div></div>`
  return `<html><body>
<div class="row col-sm-12"><div class="col-md-3"></div>${opts.cards ?? [0, 1, 2].map((n) => card(n)).join('')}</div>
<div class="row col-sm-12"><div class="col-md-3"><div class="row paddingCoberturas">${titulos.join('')}</div></div><div class="col-md-9"><div class="row paddingCoberturas">${[0, 1, 2].map(col).join('')}</div></div></div>
<div class="row col-sm-12"><div class="col-md-3">${descuentos.join('')}</div><div class="col-md-9"><div class="row paddingCoberturas">${[0, 1, 2].map(colDesc).join('')}</div></div></div>
</body></html>`
}
