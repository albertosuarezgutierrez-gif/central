#!/usr/bin/env node
// scripts/ses-probar-conexion.mjs
// Probador de CONEXIÓN y CREDENCIALES contra el servicio web de SES.HOSPEDAJES.
//
// 🚨 NO ENVÍA NINGÚN PARTE DE VIAJEROS. `tipoOperacion` va cableado a 'C' (consulta) y la
// petición no lleva ni un solo dato de persona, así que no puede dar de alta nada en el
// Ministerio. Sirve para responder a UNA pregunta: ¿el usuario y la contraseña del servicio
// web son válidos y el endpoint responde?
//
// POR QUÉ ES UN SCRIPT SUELTO Y NO UNA RUTA: el contenedor de desarrollo de Claude Code tiene
// denegado `*.mir.es` en el proxy de salida (403 en el CONNECT), así que la llamada real tiene
// que salir de una máquina que sí alcance SES: el portátil de Alberto o Vercel.
//
// USO (las credenciales van por entorno, NUNCA por argumento ni por fichero del repo):
//
//   SES_USUARIO=... SES_PASSWORD=... SES_ARRENDADOR=... SES_ESTABLECIMIENTO=... \
//   SES_ENTORNO=pruebas node scripts/ses-probar-conexion.mjs
//
//   --dry   imprime la petición que se enviaría y termina, sin tocar la red.
//
// 🚨 CADENA DE CA (verificado el 20/08/2026 contra los dos endpoints reales): SES sirve un
// certificado que NO valida ningún almacén de CA público — falla con `UnknownIssuer` incluso
// cargando el bundle completo de Mozilla, y el dominio no tiene emisiones en Certificate
// Transparency. Hay que darle la cadena de la Administración explícitamente:
//
//   NODE_EXTRA_CA_CERTS=/ruta/ses-ca.pem SES_USUARIO=... node scripts/ses-probar-conexion.mjs
//
// El PEM se saca del portal de SES o exportando la cadena del endpoint desde el navegador.
// NUNCA se desactiva la verificación TLS para esquivarlo: por este canal viajan documentos de
// identidad, y aceptar cualquier certificado convierte un fallo de configuración en un
// man-in-the-middle silencioso.
//
// CÓMO LEER EL RESULTADO:
//   401  → usuario o contraseña del SERVICIO WEB incorrectos (ojo: son distintos de los del
//          acceso web con certificado digital, y se cambian en el portal SES).
//   200  → conexión y credenciales OK. El cuerpo dirá que la consulta es inválida: es lo
//   o 500   esperado, porque aquí no mandamos una consulta bien formada a propósito.
//   403  → el endpoint no acepta la conexión (política de red por medio).

import { gzipSync } from 'node:zlib';

const ENTORNOS = {
  pruebas:    'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion',
  produccion: 'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion',
};

const dry = process.argv.includes('--dry');
const cfg = {
  usuario:        process.env.SES_USUARIO,
  password:       process.env.SES_PASSWORD,
  arrendador:     process.env.SES_ARRENDADOR,
  establecimiento: process.env.SES_ESTABLECIMIENTO,
  entorno:        process.env.SES_ENTORNO || 'pruebas',
  aplicacion:     process.env.SES_APLICACION || 'central',
};

const faltan = ['usuario', 'password', 'arrendador', 'establecimiento']
  .filter((k) => !cfg[k])
  .map((k) => `SES_${k.toUpperCase()}`);
if (faltan.length) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  process.exit(2);
}
const url = ENTORNOS[cfg.entorno];
if (!url) {
  console.error(`SES_ENTORNO debe ser "pruebas" o "produccion" (recibido: "${cfg.entorno}")`);
  process.exit(2);
}

// Escapado XML mínimo. Los códigos son numéricos y el nombre de aplicación lo ponemos
// nosotros, pero se escapa igual: un día alguien pondrá un "&" en SES_APLICACION.
const esc = (s) => String(s).replace(/[<>&'"]/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// La <solicitud> viaja como XML comprimido en gzip y codificado en base64. Aquí va la
// solicitud MÁS VACÍA posible: solo el código de establecimiento, sin ninguna comunicación.
const solicitudXml =
  `<ns2:peticion xmlns:ns2="http://www.neg.hospedajes.mir.es/altaParteHospedaje">` +
  `<solicitud><codigoEstablecimiento>${esc(cfg.establecimiento)}</codigoEstablecimiento></solicitud>` +
  `</ns2:peticion>`;
const solicitudB64 = gzipSync(Buffer.from(solicitudXml, 'utf8')).toString('base64');

const sobre =
`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion">
  <soapenv:Header/>
  <soapenv:Body>
    <com:comunicacionRequest>
      <peticion>
        <cabecera>
          <codigoArrendador>${esc(cfg.arrendador)}</codigoArrendador>
          <aplicacion>${esc(cfg.aplicacion)}</aplicacion>
          <tipoOperacion>C</tipoOperacion>
          <tipoComunicacion>PV</tipoComunicacion>
        </cabecera>
        <solicitud>${solicitudB64}</solicitud>
      </peticion>
    </com:comunicacionRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

console.log(`Entorno         : ${cfg.entorno}`);
console.log(`Endpoint        : ${url}`);
console.log(`Usuario         : ${cfg.usuario}`);
console.log(`Contraseña      : ${'*'.repeat(cfg.password.length)} (${cfg.password.length} caracteres)`);
console.log(`Arrendador      : ${cfg.arrendador}`);
console.log(`Establecimiento : ${cfg.establecimiento}`);
console.log(`Operación       : C (consulta) — no se da de alta ningún parte\n`);

if (dry) {
  console.log('--- petición (no se envía, --dry) ---');
  console.log(sobre);
  process.exit(0);
}

const auth = Buffer.from(`${cfg.usuario}:${cfg.password}`, 'utf8').toString('base64');
const ctrl = AbortSignal.timeout(30_000);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', Authorization: `Basic ${auth}` },
    body: sobre,
    signal: ctrl,
  });
  const cuerpo = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText}\n`);
  console.log(cuerpo.slice(0, 4000));
  console.log('\n--- veredicto ---');
  if (res.status === 401) {
    console.log('❌ Credenciales del SERVICIO WEB rechazadas. Revísalas en el portal SES');
    console.log('   (son distintas de las del acceso web con certificado digital).');
  } else if (res.status === 403) {
    console.log('❌ Conexión rechazada por el endpoint. Puede ser política de red por medio.');
  } else {
    console.log('✅ Conexión establecida y credenciales aceptadas.');
    console.log('   Que el cuerpo se queje de la consulta es lo ESPERADO: no mandamos una');
    console.log('   consulta bien formada a propósito. Lo que se estaba probando era el acceso.');
  }
} catch (e) {
  const detalle = `${e.message} ${e.cause?.message ?? ''}`;
  console.log(`❌ No se pudo conectar: ${e.message}`);
  if (/UNABLE_TO_(GET|VERIFY)|SELF_SIGNED|UnknownIssuer|CERT_/i.test(detalle)) {
    console.log('   Es el fallo de CADENA DE CA conocido: SES no usa una CA pública.');
    console.log('   Relánzalo con la cadena de la Administración:');
    console.log('     NODE_EXTRA_CA_CERTS=/ruta/ses-ca.pem node scripts/ses-probar-conexion.mjs');
    console.log('   No lo esquives desactivando la verificación TLS: por aquí van documentos');
    console.log('   de identidad y aceptar cualquier certificado abre la puerta a un MITM.');
  } else {
    console.log('   Si sale un 403 en el CONNECT, la máquina desde la que corres esto tiene');
    console.log('   bloqueado *.mir.es. Ejecútalo desde una red que lo alcance.');
  }
  process.exit(1);
}
