/**
 * reorganizar-drive.gs — Mudanza one-shot del Drive de Alberto a la estructura CENTRAL/.
 *
 * QUÉ HACE (en este orden):
 *   1) Mueve las carpetas "buenas" que ya existen para que queden ANIDADAS bajo CENTRAL.
 *      Mover conserva el fileId → el pipeline de facturas-correo y los factura_ref del banco
 *      siguen válidos sin tocar código.
 *   2) Reparte los archivos SUELTOS de la raíz («Mi unidad») a su sección por reglas de nombre.
 *   3) Aparta la basura (el repo volcado con .git, carpetas BORRAR) a CENTRAL/_REVISAR_BORRAR
 *      para que Alberto la borre de un vistazo. El script NUNCA borra nada.
 *
 * CÓMO SE USA:
 *   - Pega este fichero en https://script.google.com (proyecto nuevo, con tu cuenta).
 *   - Deja DRY_RUN = true la PRIMERA vez y ejecuta `reorganizarDrive`. Mira el Registro
 *     (Ver > Registro de ejecución): verás el plan completo SIN que se mueva nada.
 *   - Cuando el plan te cuadre, pon DRY_RUN = false y vuelve a ejecutar.
 *
 * Los IDs de destino salen de docs/DRIVE-ESTRUCTURA.md (fuente de verdad).
 */

// ————————————————————————————————————————————————————————————————
// CONFIG
// ————————————————————————————————————————————————————————————————
var DRY_RUN = true; // ← true = solo enseña el plan. false = mueve de verdad.

var CENTRAL = '1won_FB5-36IPLa81WFdTm_SqYvO4enhs';

// Secciones y subcarpetas (docs/DRIVE-ESTRUCTURA.md)
var DEST = {
  PROGRAMA:      '1zgcf3hlfisn3ltUJVxq6Mnkafw_8TWoZ',
  PROG_IAREST:   '1yTVnTSW5JFFrZ3494a2OJigrKyGBKzCw',
  PROG_DOCS:     '1SEWt-CfE-pbo7KHJFzySXyeJcOK-oP8I',
  PROG_ARCHIVO:  '1OfGvr-pQ6BXeN-dyP_1-T7fKbjtS5tB_',
  CONTA:         '18SOMzexkKpI0XYB6rwgPDDjeJCq71jeh',
  CONTA_RENTA:   '1i15-L38NvjRIBQF2CN-ztAeEXBUGKAIP',
  CONTA_INGRE:   '1xBi1Ew4l8qnB8R-dPg-38fINKTzlAFeI',
  CONTA_BANCOS:  '1NK__SD71IWDumj3PdvwW50oNOkR6buF1',
  CONTA_INFOR:   '1l2OLodxPuL07tKykZKtBV382w6yRMQQA',
  FACT:          '1qHEoG_6KkELi9Jo-F5eohObZUd8k0_MW',
  FACT_SUMIN:    '1OjVK9nCL2BP1Ll8yYvYFyicxNcj_A7i1',
  FACT_BUZON:    '1GoXZSURP4-r1GiAT3OacPoF1jQmuMFU3',
  CLI:           '1Kn8U9CB9Za1odex9TWsfq4fnTnj1s39Z',
  CLI_GRAB:      '1khOZcr9Me9avm4TSPpN5CHODEJB_F-y7',
  CLI_REU:       '1Eapg4Mh1Db1H5gezn1xKCRZfsK1pkcnO',
  PERS:          '1l_d0bxjZfvFc5kD6HCJBlV_jTroPNeSk',
  PERS_SEGUROS:  '196TRg3vFz6a3dCGoBMEP08ck6lfbUS0O',
  PERS_PISOS:    '1gQ8BTB_a4VyjW16Bb5gcOxeGGdQvr_BF',
  PERS_CATERING: '1EaL3EAEypYuK_UzRM29fNnu0L79DWk_6',
  PERS_SALUD:    '18uY0jfkwB9jW5eX8Vru1Is5l-6wjmuoH'
};

// Placeholders vacíos que creó Claude y que son REDUNDANTES porque ya existe una carpeta rica
// para esa categoría (la rica se anida bajo la sección y conserva su pipeline). Van a _REVISAR.
var PLACEHOLDERS_REDUNDANTES = [
  '1GVYIiJSWtzf6U89xPyL52i2Rfw6llVqA', // 03/apartamentos (usa la existente FACTURAS Apartamentos)
  '1q-fMhtRXDHEsCGEQiVge80DikoUUmokG', // 03/personal (usa FACTURAS Personal)
  '1VZeuICm8z2E7MC6nTjTQ5dhVuwI6hw5d', // 03/correduria (usa FACTURAS Correduría)
  '10iEFYxLlZmd2AQTvaU3B4v9lBRgMDrYk', // 04/por-cliente (por ahora vacío; se rellenará a mano)
  '1KMZKGEMlGiDhvwL89T9GCT3p0K76Nn8Y'  // 04/leads (los leads viven bajo IA/ia.rest/Conversaciones)
];

// Carpetas existentes → destino (se MUEVEN enteras, conservan su fileId y su contenido).
var MOVE_FOLDERS = [
  // Facturas (pipeline vivo — NO cambian de ID)
  { id: '10fj31nrvi4b4Q7X-PDKdxhkGunRPlWNo', to: DEST.FACT,          nota: 'FACTURAS Apartamentos (pipeline)' },
  { id: '147CU7lZFt0PK2eFl_cNUwROAivIC8OAy', to: DEST.FACT,          nota: 'FACTURAS Personal' },
  { id: '1GFCZ2q63x2hdH7XZOXiO5izFO5XPr2OD', to: DEST.FACT,          nota: 'FACTURAS Correduria' },
  { id: '116fd8uyifRo9qwvCeoOmW2G0rhWbKHv7', to: DEST.FACT,          nota: 'FACTURAS BOOKING 2024' },
  // Suministros
  { id: '1HcI2U4Mu5NRr1c2UPw5VOTMDLZDnoDj5', to: DEST.FACT_SUMIN,    nota: 'Luz Socorro' },
  { id: '1q-HL-KASwzy3bjd0qwKQcLr9ISi-8uFa', to: DEST.FACT_SUMIN,    nota: 'Facturas Luz TotalEnergies - Socorro 2025' },
  // Contabilidad
  { id: '16BI6qLA1iOWV4aoEPiMH2OFLyx-TYjbQ', to: DEST.CONTA_BANCOS,  nota: 'Certificados bancarios' },
  // Programa
  { id: '16qnnDY3H6WHkiaaxCf33QsfQl1mgMTfb', to: DEST.PROGRAMA,      nota: 'IA (ia.rest / Conversaciones / Leads)' },
  { id: '1h_iRqHt1Q01SPbteJW6XlPJbWPQIrl8B', to: DEST.PROG_ARCHIVO,  nota: 'ROI Intranet' },
  // Clientes
  { id: '1tuEruyTOvsPaEIi-OWZ4ysSzYdrmLiFZ', to: DEST.CLI_REU,       nota: 'Reuniones comerciales' },
  // Personal
  { id: '1pyW0_QNOCYuD_0az13sP7MpDyhhNVXt7', to: DEST.PERS_SEGUROS,  nota: 'ALBERTO 2026 PERSONAL (SEGUROS)' },
  { id: '1Zz4N5ASpxzunk1M6Ofx0qCQjFhQ2PoV_', to: DEST.PERS_CATERING, nota: 'TRIUNFO (catering historico)' },
  { id: '154gYlyzi7yqDaYAArferoWlVReOF4FW1', to: DEST.PERS_PISOS,    nota: 'NEW Fotos Socorro' },
  { id: '1My9wUTRgwT-0JGVEfWEpgL-dy9nYXyta', to: DEST.PERS_PISOS,    nota: 'INSTRUCCIONES LLAVES PISOS' },
  { id: '1pRgNCEZ0YBnJaGwBmRTDMnNd1N59RG9f', to: DEST.PERS_PISOS,    nota: 'FOTO BALCON SOCORRO' }
];

// Carpetas a APARTAR (basura / a borrar). Van a _REVISAR_BORRAR, no se borran.
var MOVE_TO_REVISAR = [
  { id: '1nJGmeMolH9n_XQVN81I8E6Ck1GVzHsXJ', nota: 'Mi portatil (volcado de repo con .git — el codigo vive en GitHub)' },
  { id: '1y0pZentv2Waw_kOQudp0NG3bgRY0prFZ', nota: 'BORRAR (papelera vieja)' }
];

// Reglas para los archivos SUELTOS de la raíz. Primera que casa, gana. Sin match → _REVISAR.
function reglasArchivo() {
  return [
    { re: /(_original\.txt$|grabaci[oó]n de llamadas|\bjj\b|vanesa|global_original)/i, to: DEST.CLI_GRAB,     nota: 'transcripcion/llamada' },
    { re: /\.(m4a|ogg|mp3|wav|opus)$/i,                                                 to: DEST.CLI_GRAB,     nota: 'audio' },
    { re: /(renta|irpf|cuestionario.*renta|gastos.*declaraci)/i,                        to: DEST.CONTA_RENTA,  nota: 'renta/irpf' },
    { re: /(^|\b)ingresos(\b|$)/i,                                                       to: DEST.CONTA_INGRE,  nota: 'ingresos' },
    { re: /(dac7|resumen pisos|viabilidad|rentabilidad|backtesting|watchlist)/i,        to: DEST.CONTA_INFOR,  nota: 'informe/analisis' },
    { re: /(factura|invoice|recibo|justificante|felec|afv-|camscanner|ccf_|z11_|255000)/i, to: DEST.FACT_BUZON, nota: 'factura suelta → buzon' },
    { re: /(contrato|arrendamiento|alquiler)/i,                                          to: DEST.PERS_PISOS,   nota: 'contrato de piso' },
    { re: /\.(sql|zip|gz|tar)$/i,                                                        to: DEST.PROG_ARCHIVO, nota: 'archivo/backup codigo' },
    { re: /\.(tsx?|jsx?|json|py)$/i,                                                     to: DEST.PROG_ARCHIVO, nota: 'fuente de codigo suelta' },
    { re: /^(ia\.rest|ia-rest|roi-intranet|intranet_)/i,                                 to: DEST.PROG_IAREST,  nota: 'material ia.rest' },
    { re: /(\.md$|manual|referencia|knowledge|estructura|modulos|reglas-desarrollo|stack-arquitectura|comercial|log-cambios|indice|project_skill)/i, to: DEST.PROG_DOCS, nota: 'doc tecnica' },
    { re: /(cuestionario salud|salud)/i,                                                 to: DEST.PERS_SALUD,   nota: 'salud/personal' }
  ];
}

// ————————————————————————————————————————————————————————————————
// MOTOR
// ————————————————————————————————————————————————————————————————
function reorganizarDrive() {
  var log = [];
  var tag = DRY_RUN ? '[DRY-RUN] ' : '[REAL] ';
  log.push(tag + 'Inicio · CENTRAL=' + CENTRAL);

  var revisar = getOrCreateRevisar_(log);

  // 1) Carpetas buenas → su sección
  MOVE_FOLDERS.forEach(function (m) { moverCarpeta_(m.id, m.to, m.nota, log); });

  // 2) Placeholders redundantes → _REVISAR
  PLACEHOLDERS_REDUNDANTES.forEach(function (id) {
    moverCarpeta_(id, revisar, 'placeholder vacio redundante', log);
  });

  // 3) Basura → _REVISAR
  MOVE_TO_REVISAR.forEach(function (m) { moverCarpeta_(m.id, revisar, m.nota, log); });

  // 4) Archivos sueltos de la raíz
  repartirSueltosDeRaiz_(revisar, log);

  log.push(tag + 'Fin.');
  Logger.log(log.join('\n'));
  if (DRY_RUN) Logger.log('\n>>> Era una PASADA EN SECO. Pon DRY_RUN=false y ejecuta otra vez para aplicar.');
}

function getOrCreateRevisar_(log) {
  var central = DriveApp.getFolderById(CENTRAL);
  var it = central.getFoldersByName('_REVISAR_BORRAR');
  if (it.hasNext()) return it.next().getId();
  if (DRY_RUN) { log.push('  crearia: CENTRAL/_REVISAR_BORRAR'); return CENTRAL; }
  var f = central.createFolder('_REVISAR_BORRAR');
  log.push('  creada: CENTRAL/_REVISAR_BORRAR (' + f.getId() + ')');
  return f.getId();
}

function moverCarpeta_(id, destId, nota, log) {
  try {
    var f = DriveApp.getFolderById(id);
    var destName = safeName_(destId);
    log.push('  carpeta "' + f.getName() + '" → ' + destName + '  [' + nota + ']');
    if (!DRY_RUN) f.moveTo(DriveApp.getFolderById(destId));
  } catch (e) {
    log.push('  ⚠️ no pude mover carpeta ' + id + ' (' + nota + '): ' + e.message);
  }
}

function repartirSueltosDeRaiz_(revisar, log) {
  var reglas = reglasArchivo();
  var files = DriveApp.getRootFolder().getFiles();
  var n = 0, sinMatch = 0;
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    var mime = file.getMimeType();
    // No tocar los proyectos de Apps Script (incluido este) ni Google Sites
    if (mime === 'application/vnd.google-apps.script') { continue; }
    var dest = null, nota = '';
    for (var i = 0; i < reglas.length; i++) {
      if (reglas[i].re.test(name)) { dest = reglas[i].to; nota = reglas[i].nota; break; }
    }
    if (!dest) { dest = revisar; nota = 'sin regla → revisar'; sinMatch++; }
    log.push('  archivo "' + name + '" (' + mime + ') → ' + safeName_(dest) + '  [' + nota + ']');
    if (!DRY_RUN) { try { file.moveTo(DriveApp.getFolderById(dest)); } catch (e) { log.push('    ⚠️ ' + e.message); } }
    n++;
  }
  log.push('  → ' + n + ' archivos sueltos procesados (' + sinMatch + ' sin regla, a _REVISAR).');
}

function safeName_(id) {
  try { return DriveApp.getFolderById(id).getName(); } catch (e) { return id; }
}
