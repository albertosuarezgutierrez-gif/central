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

import { deflateRawSync } from 'node:zlib';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// CRC-32, que el formato ZIP exige en la cabecera de cada entrada.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP mínimo de UNA entrada, método deflate. La <solicitud> NO va en gzip: la guía v3.1.2 exige
// el algoritmo ZIP ("Ha de ser un fichero xml en UTF-8, comprimido (zip) y codificado en
// Base64", error 10111), y gzip es un contenedor distinto.
//
// ⚠️ SUPUESTO SIN CONFIRMAR: la guía no documenta el nombre de la entrada, ni el método, ni si
// admite BOM. Se toma la combinación más conservadora (una entrada, deflate, `solicitud.xml`,
// UTF-8 sin BOM). Si pre-ses lo rechaza, mover en este orden: deflate→store, nombre, BOM.
function zipUnaEntrada(nombre, contenido) {
  const datos = Buffer.from(contenido, 'utf8');       // UTF-8 sin BOM
  const comprimido = deflateRawSync(datos);
  const nom = Buffer.from(nombre, 'ascii');
  const crc = crc32(datos);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);   // firma cabecera local
  local.writeUInt16LE(20, 4);           // versión necesaria
  local.writeUInt16LE(0, 6);            // flags
  local.writeUInt16LE(8, 8);            // método: deflate
  local.writeUInt16LE(0, 10);           // hora
  local.writeUInt16LE(33, 12);          // fecha (1980-01-01, fija: sin relojes, reproducible)
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comprimido.length, 18);
  local.writeUInt32LE(datos.length, 22);
  local.writeUInt16LE(nom.length, 26);
  local.writeUInt16LE(0, 28);           // sin campo extra

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // firma directorio central
  central.writeUInt16LE(20, 4);         // versión que lo creó
  central.writeUInt16LE(20, 6);         // versión necesaria
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprimido.length, 20);
  central.writeUInt32LE(datos.length, 24);
  central.writeUInt16LE(nom.length, 28);
  central.writeUInt16LE(0, 30);         // extra
  central.writeUInt16LE(0, 32);         // comentario
  central.writeUInt16LE(0, 34);         // disco
  central.writeUInt16LE(0, 36);         // atributos internos
  central.writeUInt32LE(0, 38);         // atributos externos
  central.writeUInt32LE(0, 42);         // desplazamiento de la cabecera local

  const finCentral = Buffer.alloc(22);
  const tamCentral = central.length + nom.length;
  const despCentral = local.length + nom.length + comprimido.length;
  finCentral.writeUInt32LE(0x06054b50, 0);
  finCentral.writeUInt16LE(0, 4);
  finCentral.writeUInt16LE(0, 6);
  finCentral.writeUInt16LE(1, 8);       // entradas en este disco
  finCentral.writeUInt16LE(1, 10);      // entradas totales
  finCentral.writeUInt32LE(tamCentral, 12);
  finCentral.writeUInt32LE(despCentral, 16);
  finCentral.writeUInt16LE(0, 20);      // sin comentario

  return Buffer.concat([local, nom, comprimido, central, nom, finCentral]);
}

// Aquí va la solicitud MÁS VACÍA posible: solo el código de establecimiento, sin ninguna
// comunicación. No puede dar de alta nada.
const solicitudXml =
  `<ns2:peticion xmlns:ns2="http://www.neg.hospedajes.mir.es/altaParteHospedaje">` +
  `<solicitud><codigoEstablecimiento>${esc(cfg.establecimiento)}</codigoEstablecimiento></solicitud>` +
  `</ns2:peticion>`;
const solicitudB64 = zipUnaEntrada('solicitud.xml', solicitudXml).toString('base64');

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

// La cadena de CA de SES (FNMT) se sirve desde el repo, no desde el almacén del sistema: hay
// runtimes con almacenes recortados a los que les falta la raíz FNMT, y ese fue justo el fallo
// que costó un diagnóstico equivocado. NUNCA se desactiva la verificación TLS.
const aquí = dirname(fileURLToPath(import.meta.url));
const ca = readFileSync(join(aquí, 'certs', 'ses-ca-bundle.pem'));

function postar(destino, cuerpoPeticion) {
  return new Promise((resolve, reject) => {
    const u = new URL(destino);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'POST',
        ca,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          Authorization: `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(cuerpoPeticion),
        },
        timeout: 30_000,
      },
      (res) => {
        let datos = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (datos += d));
        res.on('end', () => resolve({ status: res.statusCode, texto: datos }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout a los 30 s')));
    req.on('error', reject);
    req.end(cuerpoPeticion);
  });
}

try {
  const res = await postar(url, sobre);
  const cuerpo = res.texto;
  console.log(`HTTP ${res.status}\n`);
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
  if (/UNABLE_TO_(GET|VERIFY)|SELF_SIGNED|self.signed|UnknownIssuer|CERT_/i.test(detalle)) {
    console.log('');
    console.log('   El certificado recibido NO lo firma la FNMT, y este script ya trae la');
    console.log('   cadena correcta (certs/ses-ca-bundle.pem, verificada por huella SHA-256).');
    console.log('   Casi siempre significa que la red desde la que lo ejecutas INTERCEPTA el');
    console.log('   TLS: proxy corporativo, antivirus con inspección SSL, o un entorno de');
    console.log('   agente. El certificado que ves entonces es del interceptador, no de SES.');
    console.log('');
    console.log('   NO lo esquives desactivando la verificación: por aquí van documentos de');
    console.log('   identidad, y aceptar cualquier certificado convierte un fallo de');
    console.log('   configuración en un man-in-the-middle silencioso sobre datos sensibles.');
    console.log('   Ejecútalo desde una red sin interceptación.');
  } else if (/ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|timeout/i.test(detalle)) {
    console.log('   La máquina desde la que lo ejecutas no alcanza *.mir.es (bloqueo de red).');
    console.log('   Ejecútalo desde una red que lo alcance.');
  }
  process.exit(1);
}
