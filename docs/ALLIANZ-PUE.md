# Allianz: bajas por el PUE (30/09/2026)

**PUE = «Punto único de entrada»**, la extranet de mediadores de Allianz
(`https://e-pacallianz.com/ngx-osn-ui-service/initial-selection`). **TODAS las bajas de Allianz
(`seguros.companias_dgs` código `C0109`) se solicitan ahí**, no por correo. Y Allianz **tampoco
contesta por correo**: contesta en su intranet.

Operativa: «Anulación a vencimiento - Póliza Individual NO Vida». Se busca por Referencia = Póliza,
nº de póliza, Aplicación 0.

## Flujo semiautomático (construido)
1. El cliente firma la carta de baja en el portal. `enviarAnulacionTrasFirma` (`apps/asegura/lib/aprobaciones.ts`)
   detecta Allianz con `canalBajaCompania()` (`apps/asegura/lib/canal-baja.ts`) y devuelve `{estado:'pue'}`:
   **no propone ni manda correo**. La anulación queda `firmada` (pendiente de tramitar). Si alguien aprueba a
   mano una propuesta vieja de correo a Allianz: 409 «Allianz se tramita en el PUE, no por correo», y
   `retirarObsoletas` la caduca.
2. `GET /api/operador/anulaciones/pue` lista las pendientes con su ficha (`fichaPueAllianz`: referencia,
   nº de póliza, aplicación 0, operativa, fecha, motivo) y el PDF firmado si está archivado. Un dato ausente
   sale como «no consta, míralo en la ficha», nunca inventado.
3. Cada día laborable a las 07:50 el cron `correduria-bajas-pue` (plataforma) avisa por Telegram
   (`correduria.baja-pue`) si hay bajas pendientes. Un fallo de lectura pone el latido en rojo, nunca «0».
4. En `/correduria` → Hoy, el bloque «Bajas de Allianz para tramitar en el PUE»: ficha copiable dato a dato,
   enlace al PUE (pestaña nueva) y botón «Ya la he tramitado en el PUE».
5. Alberto la teclea en el PUE y pulsa el botón: `POST /api/operador/anulaciones/pue` pasa la anulación a
   `comunicada` (guarda de estado `firmada` y de compañía C0109) y anota «Baja tramitada en el PUE de Allianz
   por <actor>» en `historial_interno`.

## Por qué NO se automatiza el PUE con un robot (hoy)
- **Baja irreversible**: un clic mal dado da de baja una póliza viva.
- **Condiciones de uso** de la extranet de mediadores: no consta que permitan acceso automatizado.
- **Credenciales y MFA** de Alberto: un robot tendría que custodiarlas y saltarse o resolver el segundo factor.
- **Volumen bajo**: no compensa el riesgo. Medirlo: `GET /api/operador/anulaciones/pue` cuenta las pendientes;
  el historial guarda cada «Baja tramitada en el PUE».

## Qué haría falta si el volumen crece
1. **Preferente: preguntar a Allianz por un canal estructurado** (web service, TIREA/EIAC, o un buzón con
   formato fijo). Es lo que evita el problema de raíz y no depende de una pantalla.
2. **Solo si no existe y el volumen lo justifica:** RPA con Playwright bajo credenciales de Alberto, con modo
   «prepara y para antes del último clic» (rellena la operativa y deja la pantalla lista; el envío lo pulsa
   él). **Nunca envío ciego.**
