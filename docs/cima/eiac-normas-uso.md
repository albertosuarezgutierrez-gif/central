# EIAC V07.1 — Normas de uso (reglas de uso del estándar)

> Fuente: `209_IAC_ESP_DOC_NORMAS-USO-V07-1_V03-1.pdf` («Normas de uso EIAC V07.1», código 209_IAC_ESP_DOC, **versión 03, 05/08/2025**, 40 páginas, TIREA/CIMA).
> Texto del PDF (pdftotext -layout), sin cabeceras/pies de página ni portada; sin interpretar. Los esquemas gráficos del PDF (p. ej. flujo de información del siniestro, §6.1.4) son imágenes y no se transcriben.
> Contiene: nombre de fichero (§4.1), relación fichero-procesos (§4.2), identificación y periodicidad de procesos (§5), sincronización de situación/estados (§6.1), consistencia de datos (§6.2: id único, ramo-riesgo, suplementos, recibos, pagos), obligatoriedad (§6.3: campos obligatorios, opcionales, condicionados, LOPD), precisión (§6.4: redondeo, IBAN, fechas, capital ilimitado, valor NI), pólizas colectivas (§6.5), liquidación y cuenta de efectivo (§6.6).
> Los ejemplos XML de ese PDF son fragmentos de estructura (sin datos personales).
> Buscar: `grep -n 'Obligatoriedad condicionada' docs/cima/eiac-normas-uso.md`.

```text
      1. Historia de Versiones

                                       HISTÓRICO DE VERSIONES
          VERSIÓN      RESPONSABLE             FECHA               CAMBIOS INTRODUCIDOS
            01             GS                17-9-2024
                                                          Correcciones:
                                                          6.3.4. Obligatoriedad condicionada.
                                                          Modalidad Ramo Asistencia sanitaria
             02            GS                10-3-2025    en lugar de Enfermedad.
                                                          5.3.1. Proceso Objeto Póliza. 199 AN.
                                                          Datos anulación: Sí.
                                                          Correcciones:
             03            GS                 5-8-2025    5.4. Descripción detallada 269, 299.
                                                          Intercambiada descripción.

      2. Índice
      1. HISTORIA DE VERSIONES _____________________________________ 2

      2. ÍNDICE ____________________________________________________ 3

      3. OBJETO____________________________________________________ 5

      4. FICHEROS__________________________________________________ 6

      4.1. NOMBRE                                                                   6
      4.2. RELACIÓN FICHERO - PROCESOS                                              6

      5. PROCESOS _________________________________________________ 8

      5.1. IDENTIFICACIÓN                                                           8
      5.2. PERIODICIDAD                                                             9
      5.3. RELACIÓN PROCESOS – OBJETOS                                            10
      5.3.1. PÓLIZA                                                               10
      5.3.2. RECIBO                                                               10
      5.3.3. SINIESTRO                                                            11
      5.4. DESCRIPCIÓN DETALLADA                                                  11

      6. OBJETOS__________________________________________________ 16

      6.1. SINCRONIZACIÓN DE SITUACIÓN Y ESTADOS                                  16
      6.1.1. PROCESO                                                              16
      6.1.2. FECHA DE SITUACIÓN                                                   16
      6.1.3. HISTÓRICO DE MOVIMIENTOS                                             16
      6.1.4. SINIESTRO: ACCIONES Y MENSAJES                                       16
      6.2. CONSISTENCIA EN LOS DATOS                                              18
      6.2.1. IDENTIFICADOR ÚNICO (PÓLIZA, RECIBO, SINIESTRO)                      18
      6.2.2. RAMO – RIESGO                                                        18
      6.2.3. NÚMERO DE SUPLEMENTO: PÓLIZA, RECIBO                                 19
      6.2.4. FECHAS: PÓLIZA VS SUPLEMENTO                                         19
      6.2.5. SUPLEMENTO: PROPUESTA (PENDIENTE DE FORMALIZAR)                      20
      6.2.6. RECIBO: MOVIMIENTOS                                                  21
      6.2.7. RECIBO: MODIFICABLE VS NO MODIFICABLE                                22
      6.2.8. RECIBO: PRIMA NETA Y PRIMA TOTAL                                     23
      6.2.9. RECIBO: CLASE EXTORNO. SIGNO                                         23
      6.2.10. SINIESTRO: PAGOS                                                    23
      6.3. OBLIGATORIEDAD                                                         24

      6.3.1. CRITERIO DE MÁXIMA INFORMACIÓN                                   24
      6.3.2. CAMPOS OBLIGATORIOS                                              24
      6.3.3. CAMPOS OPCIONALES                                                24
      6.3.4. OBLIGATORIEDAD CONDICIONADA                                      25
      6.3.5. CAMPOS PROTEGIDOS POR LOPD                                       26
      6.4. PRECISIÓN EN LOS DATOS                                             26
      6.4.1. IMPORTES: REDONDEAR                                              27
      6.4.2. CUENTA BANCARIA (IBAN)                                           27
      6.4.3. FECHAS                                                           27
      6.4.4. CAPITAL ILIMITADO                                                28
      6.4.5. CLAVES: VALOR NI- NINGUNO DE LOS ANTERIORES                      28
      6.4.6. DATOS DE RECHAZO                                                 28
      6.5. PÓLIZAS COLECTIVAS                                                 28
      6.5.1. ESTRUCTURA BÁSICA                                                29
      6.5.2. ID RIESGO VS ID APLICACIÓN                                       29
      6.5.3. INFORMACIÓN ESPECÍFICA DE PÓLIZA COLECTIVA                       29
      6.5.4. AGRUPACIÓN O GRUPO                                               29
      6.5.5. TIPOLOGÍA DE PÓLIZAS                                             30
      6.5.6. DISTRIBUCIÓN DEL PAGO                                            30
      6.5.7. CENTROS DE FACTURACIÓN                                           31
      6.5.8. PARTICIPACIÓN EN BENEFICIOS                                      31
      6.5.9. ID EMPLEADO                                                      32
      6.5.10. PROCESOS                                                        32
      6.6. LIQUIDACIÓN Y CUENTA DE EFECTIVO                                   32
      6.6.1. CONCEPTOS Y CONTABILIZACIÓN                                      32
      6.6.2. EJEMPLO                                                          35
      6.6.3. CASOS DE USO                                                     35

      7. CONTROL DE CAMBIOS ______________________________________ 40

      3. Objeto
      Este documento recoge varias reglas con carácter de recomendación para la implementación del
      uso de los formatos en diferentes aspectos.

      De forma complementaria a este documento, se dispone de:

           •   Esquemas XSD de los formatos estándar
           •   Ejemplos XML de fichero
           •   Documento del Modelo de datos
           •   Diccionario de datos

      En la Web del proyecto está publicada esta documentación.

      https://www.cimaseg.es/

      4. Ficheros

          4.1. Nombre

      Se considera conveniente utilizar una nomenclatura común que facilite la gestión e identificación de
      ficheros. Se asume no obstante que los diferentes emisores pueden introducir variaciones por
      necesidades de sus procesos o sistemas.

      La tabla contigua contiene la nomenclatura a utilizar. Se compone de los campos indicados en la
      tabla separados por guion ‘-‘, más la extensión.

        Campo                          Valor/ Descripción
        Servicio                       EIAC
        Tipo de fichero                ENV: Enviado
        Código emisor                  Código de Entidad/Correduría emisor (Código DGSFP preferentemente)
        Código receptor                Código de Entidad/Correduría receptor (Código DGSFP preferentemente)
        Fecha                          Fecha de generación del fichero: Formato AAAAMMDDhhmmss
        IdLote                         Id lote en fichero enviado
        Extensión                      XML

        Campo                          Valor/ Descripción
        Servicio                       EIAC
        Tipo de fichero                REC: Recibido; ERR: Error
        Tipo de objeto (sólo en tipo   GEN: Genérico; POL: Póliza; REC: Recibo; SIN: Siniestro; LIQ: Liquidación;
        fichero REC)                   MEN: Mensaje.
        Código emisor                  Código de Entidad/Correduría emisor (Código DGSFP preferentemente)
        Código receptor                Código de Entidad/Correduría receptor (Código DGSFP preferentemente)
        Fecha                          Fecha de generación del fichero: Formato AAAAMMDDhhmmss
        IdLote                         Id lote en fichero recibido
        Extensión                      XML

      Ejemplos:
      (Emisor: C0001; Receptor: J0001)

      EIAC-ENV-C0001-J0001-20140512122745-1.XML
      EIAC-REC-POL-C0001-J0001-20140512122745-1.XML
      EIAC-ERR-C0001-J0001-20140512122745-1.XML

          4.2. Relación Fichero - Procesos

      La cabecera de fichero EIAC admite alternativamente un Código de proceso o múltiples Detalles de
      proceso.

      Si la identificación del proceso es por Código, la correspondencia es 1 fichero = 1 proceso.

      Bajo este sistema, se recomienda generar un fichero por proceso y periodo, aunque no haya
      movimientos para enviar, con el objeto de homogeneizar el número de ficheros generados.

      La identificación de proceso por Detalle de proceso permite incluir varios procesos en un fichero,
      por tanto, en 1 fichero se pueden incluir 1 o más procesos.

      Independientemente del sistema de identificación, el proceso o procesos informados en cabecera
      han de ser consistentes con los objetos (Póliza, Recibo, Siniestro, Liquidación. Cuenta de efectivo,
      Mensaje) incluidos en el fichero.

                5. Procesos

                     5.1. Identificación

                Los procesos definidos pueden identificarse por Código o por Detalle de proceso, a través de Clase
                y Transacción. Existe una correspondencia entre ambos métodos de identificación.

Clave        Objeto              Origen        Destino      Denominación                           Clase            Transacción
                                                            Información de Pólizas de Nueva
        131 Póliza               Entidad       Mediador     Producción                             NP               OR
        132 Póliza               Entidad       Mediador     Información de Pólizas de Cartera      CA               OR
        133 Póliza               Entidad       Mediador     Información de Suplementos de Póliza SU                 OR
        134 Póliza               Entidad       Mediador     Precartera de pólizas colectivas       PC               OR
        151 Póliza               Entidad       Mediador     Información de Anulaciones de Póliza   AN               OR
                                                            Carga Masiva de Pólizas, Suplementos y NP, CA, SU,
        199 Póliza               Entidad       Mediador     Anulaciones                            AN               CM
        211 Recibo               Entidad       Mediador     Emisión de Recibos Nueva Producción NP                  OR
        212 Recibo               Entidad       Mediador     Emisión de Recibos Cartera             CA               OR
        213 Recibo               Entidad       Mediador     Emisión de Recibos de Suplemento       SU               OR
        214 Recibo               Entidad       Mediador     Precartera de recibos                  PC               OR
        251 Recibo               Entidad       Mediador     Emisión de Recibos Extornos            EX               OR
        261 Recibo               Entidad       Mediador     Movimientos de Recibo                  MO               OR
                                                            Carga Masiva de Movimientos de
        269 Recibo               Entidad       Mediador     Recibo                                 MO               CM
        299 Recibo               Entidad       Mediador     Carga Masiva de Recibos                NP, CA, SU, EX   CM
        271 Recibo               Entidad       Mediador     Rechazo movimientos de Recibo          MO               RE
                                                            Rechazo de Emisión de Recibos Nueva
        771 Recibo               Mediador      Entidad      Producción                             NP               RE
        772 Recibo               Mediador      Entidad      Rechazo de Emisión de Recibos Cartera CA                RE
                                                            Rechazo de Emisión de Recibos de
        773 Recibo               Mediador      Entidad      Suplemento                             SU               RE
                                                            Rechazo de Emisión de Recibos
        774 Recibo               Mediador      Entidad      Extornos de anulación de póliza        EX               RE
        761 Recibo               Mediador      Entidad      Movimientos de Recibo                  MO               OR
        775 Recibo               Mediador      Entidad      Rechazo movimientos de Recibo          MO               RE
        311 Siniestro            Entidad       Mediador     Declaración de nuevos siniestros       DE               OR
        361 Siniestro            Entidad       Mediador     Movimientos y pagos de siniestro       MO               OR
        399 Siniestro            Entidad       Mediador     Carga masiva de siniestros             CA               CM
        371 Siniestro            Entidad       Mediador     Rechazo de alta nuevos siniestros      DE               RE
                                                            Rechazo movimientos y pagos de
        372 Siniestro            Entidad       Mediador     siniestro                              MO               RE
        841 Siniestro            Mediador      Entidad      Solicitud alta nuevos siniestros       DE               SO
        861 Siniestro            Mediador      Entidad      Movimientos y pagos de siniestro       MO               OR
        500 Liquidación          Entidad       Mediador     Liquidación de cuenta de efectivo      LI               OR
        501 Liquidación          Mediador      Entidad      Liquidación de cuenta de efectivo      LI               OR

          Cuenta
      502 efectivo             Entidad        Mediador     Emisión de cuenta de efectivo              CE            OR
      601 Mensaje              Entidad        Mediador     Envío de mensaje                           MS            OR

              El código de proceso es un número de 3 cifras, cada una correspondiente a un componente del
              código.

               Componente de clave
               Componente 1                              Componente 2            Componente 3 (donde aplica)
               1 Pólizas                                         1 Emisión               1 Nueva Producción
               2 Recibos                                         2 Confirmación          2 Cartera
               3 Siniestros                                      3 Actualización         3 Suplementos
               5 Liquidación                                     4 Solicitud             4 Pre-cartera
               6 Mensaje                                         5 Anulación
               7 Recibos Mediador                                6 Movimiento
               8 Siniestros Mediador                             7 Rechazo
                                                                 9 Carga masiva
                                                                 0 Otros

                  5.2. Periodicidad

              Se ha establecido una periodicidad de ejecución para los procesos más importantes.

Periodicidad de Procesos
Código Objeto          Origen            Destino     Denominación                                                  Periodicidad
     131 Póliza        Entidad           Mediador    Información de Pólizas de Nueva Producción                    Diario
     132 Póliza        Entidad           Mediador    Información de Pólizas de Cartera                             Mensual
     133 Póliza        Entidad           Mediador    Información de Suplementos de Póliza                          Diario
     134 Póliza        Entidad           Mediador    Precartera de Pólizas Colectivas                              A petición
     151 Póliza        Entidad           Mediador    Información de Anulaciones de Póliza                          Diario
     199 Póliza        Entidad           Mediador    Carga Masiva de Pólizas, Suplementos y Anulaciones            A petición
     211 Recibo        Entidad           Mediador    Emisión de Recibos Nueva Producción                           Diario
     212 Recibo        Entidad           Mediador    Emisión de Recibos Cartera                                    Mensual
     213 Recibo        Entidad           Mediador    Emisión de Recibos de Suplemento                              Diario
     251 Recibo        Entidad           Mediador    Emisión de Recibos Extornos                                   Diario
     261 Recibo        Entidad           Mediador    Movimientos de Recibo                                         Diario
     269 Recibo        Entidad           Mediador    Carga Masiva de Movimientos de Recibo                         A petición
     299 Recibo        Entidad           Mediador    Carga Masiva de Recibos                                       A petición
     311 Siniestro     Entidad           Mediador    Declaración de nuevos siniestros                              Diaria
     361 Siniestro     Entidad           Mediador    Movimientos y pagos de siniestro                              Diaria
     399 Siniestro     Entidad           Mediador    Carga masiva de siniestros                                    A petición
     502 Cuenta        Entidad           Mediador    Cuenta de efectivo                                            Mensual

                   5.3. Relación procesos – objetos

                Con el objeto de delimitar el contenido de los procesos, la tabla contigua recoge los estados de
                situación y clases de objeto, junto con los bloques de datos opcionales que deberían ser incluidos
                en cada proceso.

                      5.3.1. Póliza

                                Bloques de datos
       Situación      Clase                                      Datos                                        Datos Póliza
Código Póliza         Póliza    Datos Anulación      Suplementos Regularización      Datos Suspensiones       Reemplazada
                                                                                     Sí, si situación En
                                                   Opcional, si                      Suspenso o
                                Opcional, si fecha existen                           Reactivación de          Sí, si existe póliza
        EV/ES/PR      NP
  131                           efecto posterior suplementos.                        suspensión.              reemplazada.
                                                                                     Sí, si situación En
                                                   Opcional, si                      Suspenso o
                                Opcional, si fecha existen                           Reactivación de          Sí, si existe póliza
  132 EV/ES           CA        efecto posterior suplementos.                        suspensión.              reemplazada.
                                                                                     Sí, si situación En
                                                                    Sí, si clase     Suspenso o
                                Opcional, si fecha                  suplemento       Reactivación de          Sí, si existe póliza
  133 EV/ES           SU        efecto posterior Sí                 Regularización   suspensión.              reemplazada.
                                                                                     Sí, si situación En
                                                     Opcional, si                    Suspenso o
                                                     existen                         Reactivación de          Sí, si existe póliza
  134 EV/ES           PC        No                   suplementos.                    suspensión.              reemplazada.
                                                     Opcional, si
                                                     existen
  151 AN/EX           AN        Sí                   suplementos.                    No                       No
                                                                                     Sí, si situación En
                                                                                     Suspenso o
                                Opcional, si fecha                                   Reactivación de          Sí, si existe póliza
  199 EV/ES/PR        NP/CA     efecto posterior No                                  suspensión.              reemplazada.
                                                                                     Sí, si situación En
                                                                                     Suspenso o
                                Opcional, si fecha                                   Reactivación de          Sí, si existe póliza
        EV/ES         SU        efecto posterior Sí                                  suspensión.              reemplazada.
        AN/EX         AN        Sí                 No                                No                       No

                      5.3.2. Recibo

                                                            Bloques de datos
  Código Situación Recibo            Clase Recibo           Movimientos Recibo                  Error Devolución
    211 PE                           NP/PA/PB/AE/TR/AP      EM                                  No
    212 PE                           CA                     EM                                  No

213 PE                     SU                       EM                                  No
214 PE                     PC                       EM                                  No
251 PE                     EX                       EM                                  No
261 CO/DE/AN/LI            Todos excepto PC         Todos                               No
269 CO/DE/AN/LI            Todos excepto PC         Todos                               No
299 Todos                  Todos excepto PC         Todos                               No
761 CO/DE/AN/LI            Todos excepto PC         Todos                               No
271 CO/DE/AN/LI            Todos excepto PC         Todos                               Sí
771 PE                     NP/PA/PB/AE/TR/AP        EM                                  Sí
772 PE                     CA                       EM                                  Sí
773 PE                     SU                       EM                                  Sí
774 PE                     EX                       EM                                  Sí
775 CO/DE/AN/LI            Todos excepto PC         Todos                               Sí

                5.3.3. Siniestro

                                           Bloque de datos
            Código Situación Siniestro     Error Devolución
              311 AP                       No
              361 Todos                    No
              399 Todos                    No
              371 RC                       Sí
              372 RC                       Sí
              841 AP                       No
              861 Todos                    No

             5.4. Descripción detallada

         Con objeto de especificar con mayor precisión el contenido de determinados procesos, se ha
         realizado una descripción detallada de los mismos.

         134: Precartera de pólizas colectivas

         Es un proceso previo a la facturación. Ha de recoger tanto datos de pólizas y asegurados como de
         importes correspondientes al tipo de movimiento en cuestión: renovación, suplemento, etc.

          Ha de ser un proceso único para su rápido análisis.

         Es “A petición”, de acuerdo con los criterios que se determinen.

         214: Precartera de recibos

         Se informan a través del proceso 214 recibos de precartera que tienen carácter informativo y donde
         se avanzan los importes de primas y comisiones resultantes de las condiciones de renovación
         aplicadas a las pólizas de cartera. Estos importes pueden ser modificados con posterioridad en la
         emisión de recibo.

      Los recibos de precartera se han de identificar en clase de recibo con el valor de “PC- Precartera”,
      nuevo valor introducido en las claves de recibo.

      Es un proceso opcional: no implementado por todas las entidades.

      269: Carga masiva de movimientos de recibo

      Se han de incluir los recibos emitidos en los últimos 2 años. En movimientos de recibo, informar
      todos los movimientos producidos.

      299: Carga masiva de recibos

      Se han de incluir los recibos emitidos en los últimos 2 años. En movimientos de recibo, solo informar
      el último movimiento.

      311: Declaración de nuevos siniestros

      Nuevos siniestros en pólizas de la cartera del mediador, con el detalle de los expedientes abiertos.

      361: Movimientos y pagos de siniestros
      Este proceso recoge las acciones y movimientos económicos realizados en la tramitación del siniestro
      y/o cada uno de sus expedientes desde su fecha de apertura del siniestro.

      Puede haber nuevos expedientes abiertos de un siniestro previamente comunicado en el proceso
      311. El siniestro se deja de informar en este fichero a partir del momento del cierre del siniestro (y
      de todos sus expedientes). Puede informar también de la reapertura de un siniestro previamente
      cerrado.

      399: Carga masiva de siniestros
      Todos los siniestros abiertos más los cerrados en los últimos 12 meses, salvo acuerdo Compañía –
      Corredor.

      500 – 501: Liquidación y 502: Cuenta de efectivo

      La liquidación de los recibos con gestión de cobro Mediador se puede realizar mediante dos modelos:

           1. Autoliquidación Entidad Aseguradora

           •   Los recibos cobrados por el mediador son incluidos junto con los cobrados por la entidad
               aseguradora en la liquidación emitida por esta. Todos los recibos cobrados en el periodo se
               incluyen en la liquidación y el importe resultado de esta se salda mediante transferencia de
               fondos. La información de los recibos que se liquidan se transmite mediante el proceso 500.

           2. Liquidación Mediador

           •   Los recibos cobrados por el mediador son liquidados por este. La información de los recibos
               que se liquidan se transmite mediante el proceso 501.
           •   Los recibos cobrados por la entidad aseguradora son liquidados por esta. La información de
               los recibos que se liquidan se transmite mediante el proceso 500.

      La entidad aseguradora emite un estado contable denominado “Cuenta de efectivo”. La información
      de esta cuenta se transmite mediante el proceso 502.

      Los procesos 500 y 501 son opcionales. El proceso 502 es obligatorio.

      Esquema general de gestión de recibo focalizado en la liquidación

      601: Envío de mensaje

      Alcance en v07:

           •   Proceso sentido Entidad Aseguradora -> Mediador.
           •   Mensajes referentes a siniestros.
           •   Con referencia a documentos. Sin archivos adjuntos integrados en el mensaje.

      6. Objetos

          6.1. Sincronización de situación y estados

             6.1.1. Proceso

      La información ha de ser enviada en el momento en que se haya producido y sea conocida por el
      emisor, de acuerdo con la periodicidad del proceso.

      Si sobre un objeto se han producido varios cambios de situación en un periodo, se ha de incluir sólo
      en el proceso correspondiente a la última situación, e informar en los datos del objeto los
      movimientos que han dado lugar a los estados anteriores no vigentes.

             6.1.2. Fecha de situación

      Se define la “Fecha de situación” como la fecha de registro en el sistema del emisor del fichero de
      la transacción que determina la situación informada del objeto, acción o movimiento.

      Según esta definición, su identidad sería diferente a la fecha de generación del fichero, y por tanto
      su valor no sería siempre igual al valor de esta, sino que estaría comprendido en el intervalo de
      tiempo transcurrido entre dos ejecuciones consecutivas de un proceso con periodicidad establecida.

      Fecha de proceso i-1 <= Fecha de situación < Fecha de proceso i.

             6.1.3. Histórico de movimientos

      En los bloques que recogen un histórico de movimientos sobre un objeto, se ha de enviar sólo la
      nueva información producida en el periodo de extracción; no el histórico completo de movimientos.
      Sería el caso por ejemplo de: Suplementos de póliza, Movimientos de recibo, Situaciones de
      siniestro.

             6.1.4. Siniestro: acciones y mensajes

      Acciones Siniestro

      El objeto siniestro dispone del elemento “Acciones Siniestro”, donde se puede informar de la clase,
      descripción y estado de las diferentes acciones que se ejecutan en la tramitación del siniestro y de
      los profesionales involucrados en su realización.

      Ejemplos:

       NumeroOrden                                                  1
       AccionSiniestro     Documentación / información de cliente
       FechaAccion                                       01/01/2020
       DescripcionAccion   Solicitado atestado policial.
       SituacionAccion     En curso
       ClaseIdAccion       Número de atestado
       IdAccion            2019-010101

       FigurasAccion       Tramitador
       NumeroOrden                                                 2
       AccionSiniestro     Judicial
       FechaAccion                                         02/01/2020
       DescripcionAccion   Fijada fecha primera vista
       SituacionAccion     Pendiente
       ClaseIdAccion       Expediente judicial
       IdAccion            2019-25/01/2019

       NumeroOrden                                                 3
       AccionSiniestro     Peritación
       FechaAccion                                         03/01/2020
       DescripcionAccion   Entregado informe
       SituacionAccion     Finalizado
       ClaseIdAccion       Número de encargo
       IdAccion                                             20190101
       FigurasAccion       Perito
       NumeroOrden                                                 4
       AccionSiniestro     Reparación
       FechaAccion                                         04/01/2020
       DescripcionAccion   Confirmado inicio de trabajo.
       SituacionAccion     En curso
       ClaseIdAccion       Número de encargo
       IdAccion            RE-2401002
       FigurasAccion       Reparador
       NumeroOrden                                                 5
       AccionSiniestro     Indemnización / Liquidación
       FechaAccion                                         05/01/2020
       DescripcionAccion   Propuesta enviada.
       SituacionAccion     En curso
       ClaseIdAccion       Expediente de entidad
       IdAccion            AB-01-ZZ
       FigurasAccion       Tramitador

      Mensajes: Información de tramitación

      A través del proceso de envío de mensajes, la entidad aseguradora puede enviar al mediador
      información sobre tramitación de siniestros, habitualmente recogida en las denominadas “notas de
      tramitación”. Sus objetivos son los siguientes:

           •   Integrar la guía de tramitación de siniestros en el sistema de la correduría.
           •   Gestión automatizada. Centrar actividad solo en procesos que requieren intervención de la
               correduría.

                   •    Análisis de movimientos. Detectar incidencias o anomalías de gestión.

              Esquema: Flujo de información del siniestro

                Documentación - Información - Reclamación
                                                 Valoración - Reparación - Recobro
                Situación: Reclamado,
                Aceptado, Rehusado.                                              Judicial - Indemnización
                                                 Situación: Asignado, Citado,
                Reclamación: Convenio,
                                                 Pospuesto, Finalizado.
                Posición.                                                        Situación: Propuesta. Pago.
                                                 Figuras: Perito, Reparador,
                Figuras: Asegurado, Contrario,                                   Figuras: Tramitador, Abogado.
                                                 Taller.
                Tramitador, Asistencia.
                                                 Documentación: Presupuesto,     Documentación: Judicial,
                Documentación: Atestado,                                         Factura, Justificante.
                                                 Informe, Fotografía, Factura.
                Parte, Declaración,
                Identificación.

                  6.2. Consistencia en los datos

                       6.2.1. Identificador único (póliza, recibo, siniestro)

              En los casos en que el número de póliza, recibo o sinestro informado en su correspondiente campo
              de identificador (Id Póliza, Id Recibo, Id Siniestro) no sea clave única en el ámbito de la entidad
              aseguradora y, por tanto, no permita identificar el elemento de forma unívoca, se ha de informar
              obligatoriamente el correspondiente campo de identificador único (Id póliza único, Id Recibo único,
              Id Siniestro único) con un dato que sí sea clave única de póliza, recibo o siniestro.

              Sería de aplicación, por ejemplo, si puede existir coincidencia en número de póliza entre pólizas de
              diferentes ramos.

                       6.2.2. Ramo – Riesgo

              Existe una correspondencia entre Ramo y tipo de Riesgo para el envío de los datos de riesgo de la
              póliza. Esta correspondencia ha de respetarse y utilizar el tipo de riesgo adecuado al Ramo de la
              póliza. En casos excepcionales, puede admitirse utilizar un tipo de riesgo diferente o el tipo Otros
              Riesgos por motivo justificado.

Ramos                                                              Riesgos
Clave        Descripción                                           Elemento                      Tipo
         111 Vida individual                                       RiesgoVida                    tipo_riesgovida
         121 Vida colectivo                                        RiesgoVida                    tipo_riesgovida

 211 Accidentes                                        RiesgoAccidentes               tipo_riesgoaccidentes
 221 Enfermedad                                        RiesgoSalud                    tipo_riesgosalud
 231 Asistencia sanitaria                              RiesgoAsistenciaSanitaria      tipo_riesgoasistenciasanitaria
 241 Autos                                             RiesgoAutos                    tipo_riesgoautos
 251 Transportes                                       RiesgoTransportes              tipo_riesgotransportes
 261 Incendios y elementos naturales                   RiesgoIncendios                tipo_riesgoincendios
     Otros daños a los bienes: seguros agrarios
 271 combinados                                        OtrosDanos                     tipo_otrosdanos
 272 Otros daños a los bienes: robo u otros            OtrosDanos                     tipo_otrosdanos
 273 Otros daños a los bienes: total otros daños       OtrosDanos                     tipo_otrosdanos
     Responsabilidad civil en general: riesgos
 281 nucleares                                         RiesgoRC                       tipo_riesgoRC
     Responsabilidad civil en general: otros
 282 riesgos                                           RiesgoRC                       tipo_riesgoRC
 291 Crédito                                           RiesgoCredito                  tipo_riesgocredito
2101 Caución                                           RiesgoCaucion                  tipo_riesgocaucion
2111 Pérdidas diversas                                 RiesgoPerdidasDiversas         tipo_riesgoperdidasdiversas
2121 Defensa jurídica                                  RiesgoDefensaJuridica          tipo_riesgodefensajuridica
2131 Asistencia                                        RiesgoAsistenciaViaje          tipo_riesgoasistenciaviaje
2141 Decesos                                           RiesgoDecesos                  tipo_riesgodecesos
2151 Multirriesgo hogar                                RiesgoHogar                    tipo_riesgohogar
2161 Multirriesgo comunidades                          RiesgoComunidades              tipo_riesgocomunidades
2171 Multirriesgo comercios                            RiesgoComercios                tipo_riesgocomercios
2181 Multirriesgo industriales                         RiesgoIndustriales             tipo_riesgoindustriales
2191 Otros multirriesgos                               OtrosMultirriesgos             tipo_otrosmultirriesgos
     Todo Riesgo Construcción, Decenal y RC
     Construcción                                      RiesgoConstruccion             tipo_riesgoconstruccion
     Utilizar en casos excepcionales                   OtrosRiesgos                   tipo_otrosriesgos

             6.2.3. Número de suplemento: Póliza, Recibo

      En los recibos emitidos sobre un suplemento de póliza, se ha de informar el número de suplemento
      que identifica a este en la póliza. Es el dato que el mediador ha de utilizar para asociar el recibo al
      suplemento correspondiente.

             6.2.4. Fechas: Póliza vs Suplemento

      Las fechas del elemento “Póliza > Fechas” son fechas referidas a la póliza. No se han de actualizar
      por emisión de suplemento excepto en los casos en que el suplemento implique modificación sobre
      estas.

      Las fechas propias del suplemento se han de informar en “Póliza > Suplemento > Fechas”.

                      6.2.5. Suplemento: Propuesta (pendiente de formalizar)

               Se ha de Incluir en todas las pólizas con Suplemento emitido en el periodo de selección la lista de
               estos suplementos. En “Datos póliza > Número suplemento” se ha de informar el último suplemento
               formalizado. En caso de existir propuestas de suplemento pendientes de formalizar, pueden
               incluirse en Suplementos.

               Ejemplo: Póliza con propuesta de suplemento pendiente de formalizar.

Ejemplo: Póliza con suplemento pendiente
Datos Póliza ->            Id Póliza
                           Numero Suplemento         S01
                           Datos Mediador
                           Código Entidad
                           Datos Ramo
Situación Póliza           EV: En vigor
Clase Póliza               NP: Nueva producción
Datos Anulación            -
Datos Suspensiones         -
Datos Póliza Reemplazada -
Suplementos ->             Suplemento ->             Numero Orden                               1
                                                     Id Suplemento          S01
                                                     Detalle
                                                     Fechas ->              Fecha Situación         2019-01-03T00:00:00
                                                                            Fecha Efecto Inicial    2019-01-01T00:00:00
                                                                            Fecha Efecto Actual     2019-01-02T00:00:00
                                                                            Fecha Vencimiento       2019-12-31T00:00:00
                                                                            Fecha Fin Seguro        -
                                                                            Fecha Solicitud         -
                                                                            Fecha Emisión           2019-01-02T00:00:00
                                                     Situación              AC: Aceptado
                                                     Clase Suplemento
                                                     Descripción Clase Suplemento
                            Suplemento ->            Numero Orden                               2
                                                     Id Suplemento          S02
                                                     Detalle
                                                     Fechas ->              Fecha Situación       2019-06-01T00:00:00
                                                                            Fecha Efecto Inicial 2019-01-01T00:00:00
                                                                            Fecha Efecto Actual 2019-06-01T00:00:00
                                                                            Fecha Vencimiento 2019-12-31T00:00:00
                                                                            Fecha Fin Seguro
                                                                            Fecha Solicitud
                                                                            Fecha Emisión         2019-06-01T00:00:00
                                                     Situación              PE: Pendiente
                                                     Clase Suplemento

                                                          Descripción Clase Suplemento
Fechas ->                      Fecha Situación            2019-01-01T00:00:00
                               Fecha Efecto Inicial       2019-01-01T00:00:00
                               Fecha Efecto Actual        2019-01-01T00:00:00
                               Fecha Vencimiento          2019-12-31T00:00:00
                               Fecha Fin Seguro
                               Fecha Solicitud
                               Fecha Emisión              2019-01-01T00:00:00

                         6.2.6. Recibo: Movimientos

                  El movimiento que corresponde a la situación actual del recibo, y que por tanto produce su inclusión
                  en el proceso, se ha de incluir en los movimientos de recibo. Debe coincidir con la situación actual
                  del recibo y su fecha.

                  La ordenación cronológica de movimientos se ha de indicar mediante el campo “Número de orden”,
                  debiendo seguirse una secuencia ascendente de más antiguo a más reciente. La fecha y hora de
                  movimiento pudiera ser coincidente o no disponerse de hora en algún tipo de movimiento, por lo
                  que de utilizar este campo la ordenación de movimiento pudiera no ser correcta.

                  Ejemplo con indicación de secuencia por en Número de orden.

Ejemplo 1: Recibo cobrado
Datos
Recibo -> Id Recibo                0000001
            Situación Recibo       CO: Cobrado
            Clase Recibo           NP
            Fechas ->              Fecha Situación        2018-01-02T00:00:00
                                   Fecha Efecto Inicial   2018-01-01T00:00:00
                                   Fecha Efecto Actual    2018-01-01T00:00:00
                                   Fecha Vencimiento      2018-12-31T00:00:00
                                   Fecha Fin Seguro
                                   Fecha Solicitud
                                   Fecha Emisión          2018-01-01T00:00:00
                                   Fecha Primer
                                   Vencimiento
              GestionCobro
              Datos Importes
              Datos Comisiones
              Movimientos                                                                                 <- Secuencia
              Recibo ->            Movimiento ->          Numero Orden                                  1 ascendente
                                                          Clase Movimiento         EM: Emisión
                                                                                                       <- Orden
                                                          Fecha Movimiento         2018-01-01T00:00:00 cronológico
                                                          Anulación

                                                                                                 <- Secuencia
                        Movimiento ->         Numero Orden                                     2 ascendente
                                                                                                 <- Situación
                                              Clase Movimiento              CO: Cobro            actual del recibo
                                                                                                 <- Orden
                                              Fecha Movimiento              2018-01-02T00:00:00 cronológico
                                              Anulación

               6.2.7. Recibo: modificable vs no modificable

      Recibo modificable

      Si un recibo es modificable se ha de indicar utilizando el campo “Modificable” con valor “True”
      (verdadero).

      El paso de un recibo modificable a no modificable se ha de informar de la siguiente forma:

           •    Proceso 261: Movimientos de recibo.
           •    Clase de movimiento NM: Recibo es no modificable.
           •    Modificable: False.

      El estado de no modificable es final. Un recibo no modificable no puede pasar a modificable.

      Recibo no modificable

      Un recibo no modificable no puede ser variado en importes ni fechas. En caso de requerir una
      corrección, existen dos posibilidades:

           •    Anular el recibo inicialmente emitido y emitir uno nuevo.
           •    Emitir un recibo complementario.

      Recibos relacionados

      En caso de existir relación entre recibos, la clase de esta relación viene determinada por el estado
      del recibo origen:

           •    Recibo origen Anulado -> Sustitución
           •    Recibo origen no Anulado -> Complementario.

      En el supuesto de que el nuevo recibo se emita con anterioridad a la anulación del primero, la
      relación inicialmente de complementariedad mutaría a sustitución.

      Recibo de Precartera

      Los recibos de precartera tienen carácter informativo. A través de ellos se avanzan los importes de
      primas y comisiones resultantes de las condiciones de renovación aplicadas a las pólizas de cartera.
      Estos importes pueden ser modificados con posterioridad en la emisión de recibo.

      Los recibos de precartera se han de identificar en Clase de recibo con su valor correspondiente (PC:
      Precartera)

Ejemplo: Pre-
cartera
Datos Recibo ->      Id Recibo                0000001
                     Situación Recibo         PE: Pendiente
                     Clase Recibo             PC: Pre-cartera             <- Nueva clase de recibo
                     Fechas ->                Fecha Situación             2019-07-01T00:00:00
                                              Fecha Efecto Inicial        2019-07-01T00:00:00
                                              Fecha Efecto Actual         2019-07-01T00:00:00
                                              Fecha Vencimiento           2019-12-31T00:00:00
                                              Fecha Fin Seguro
                                              Fecha Solicitud
                                                                                                     <- Fecha futura de
                                              Fecha Emisión            2019-07-01T00:00:00           emisión
                                              Fecha Primer Vencimiento
                     Gestión Cobro
                     Datos Importes
                     Datos Comisiones
                     Movimientos Recibo ->    Movimiento ->               Numero Orden                                      1
                                                                          Clase Movimiento           EM: Emisión
                                                                          Fecha Movimiento           2019-07-01T00:00:00
                                                                          Anulación

                     6.2.8. Recibo: Prima Neta y Prima Total

              En Recibo los datos de prima neta y prima total han de ser informados y se ha de cumplir la
              igualdad: Prima Total = Prima Neta + Cargos.

              Quedan exceptuados de esta regla las clases específicas de recibo donde puede no existir prima
              neta como son las aportaciones de seguro de ahorro.

                     6.2.9. Recibo: Clase Extorno. Signo

              En los recibos de clase Extorno, los importes se han de informar con signo negativo.

                     6.2.10. Siniestro: Pagos

              El importe total de pagos ha de ser igual a la suma de los importes de los pagos del siniestro.

              Datos Siniestro. Total Pagos = Suma(Pagos Siniestro. Importe Pago)

              El importe de indemnización ha de ser igual a la suma de los importes de los pagos de siniestro de
              tipo indemnización.

              Datos Siniestro. Importe indemnización = Suma(Pagos Siniestro. Importe Pago (Indemnización))

          6.3. Obligatoriedad

               6.3.1. Criterio de máxima información

      La regla de aplicación general es que se han de enviar la máxima información posible y por tanto
      cumplimentar todos los campos de cuyo dato se disponga no solo limitarse a informar los
      obligatorios.

               6.3.2. Campos obligatorios

      Los campos deben rellenarse con datos coherentes, no con cualquier texto o número que pueda
      generar confusión al receptor del dato, ya sea el mediador o el cliente final. Debe evitarse rellenar
      etiquetas obligatorias con valores del tipo 0, “-“, o con textos parecidos a “Sin información” o “No
      Disponible”.

      Ejemplos de utilización a evitar:

      <Etiqueta>-<Etiqueta>

      <Etiqueta>0<Etiqueta>

      <Etiqueta>No disponible<Etiqueta>

      <NIF>00000000-T</NIF>

      Cuando no se disponga de datos para informar un campo de carácter obligatorio, se ha de informar
      con el valor que se indica a continuación, en función del tipo de dato.

           •    Tipo alfanumérico: Se ha de informar el literal “SINDATO”.
           •    Tipo numérico: Se ha de informar el valor “-9999”.

      En ambos casos, el receptor de la información ha de interpretar estos valores como indicador de
      que el emisor no dispone del dato correspondiente.

               6.3.3. Campos opcionales

      En el caso de no poder obtener el valor de un campo opcional, no debe incluirse tal etiqueta y,
      sobre todo, no rellenar con un valor neutro como 0 o parecido.

      Por ejemplo, si se informa la etiqueta Comisión Bruta con valor 0, se entiende que la póliza no tiene
      comisión, no que la aseguradora no está informando de su valor. Al llegar la etiqueta opcional se
      actualizan los datos del mediador con el valor del fichero y en ocasiones se pierde información.

      Ejemplos de utilización a evitar:

      <Etiqueta/>

      <Etiqueta></Etiqueta>

      <Etiqueta>0</Etiqueta>

                 <Etiqueta>Sin valor</Etiqueta>

                 Esto se hace extensivo a los bloques de datos donde todos los campos son opcionales. Si no se
                 informa ninguno de los campos se debe omitir el bloque completo.

                 Ejemplos de utilización a evitar:

                 <Bloque/>

                 <Bloque>
                        <Etiqueta1/>
                        <Etiqueta2><Etiqueta2>
                 </Bloque>

                         6.3.4. Obligatoriedad condicionada

                 Sobre los elementos recogidos en la tabla siguiente se ha fijado una obligatoriedad condicionada
                 que se ha de cumplir según se indica en Descripción.

Num     Tipo de dato                Elemento                       Descripción
                                                                   Detalle de proceso. Obligatorio informar si en cabecera de
8.1.    tipo_poliza                 DetalleProceso                 fichero el proceso se identificar por detalle de proceso.
                                                                   Datos de la póliza reemplazada. (Obligatorio si existe póliza
8.1.    tipo_poliza                 DatosPolizaReemplazada         reemplazada)
                                                                   Identificador único de póliza. Obligatorio informar si Id
8.2.    tipo_datospoliza            IdPolizaUnico                  Póliza no es clave única de póliza en entidad aseguradora.
                                                                   Detalle de proceso. Obligatorio informar si en cabecera de
9.1.    tipo_recibo                 DetalleProceso                 fichero el proceso se identificar por detalle de proceso.
                                                                   Identificador único de recibo. Obligatorio informar si Id
9.2     tipo_datosrecibo            IdReciboUnico                  Recibo no es clave única de recibo en entidad aseguradora.
                                                                   Indicador de si los datos del recibo son modificables.
                                                                   Obligatorio informar si el recibo es o ha sido modificable.
                                                                   Utilizar movimiento de recibo con valor NM: No
9.2     tipo_datosrecibo            Modificable                    modificable para informar de cambio en esta condición.
                                                                   Detalle de proceso. Obligatorio informar si en cabecera de
10.1    tipo_siniestro              DetalleProceso                 fichero el proceso se identificar por detalle de proceso.
                                                                   Número o identificador de siniestro asignado por la
                                                                   compañía. Obligatorio excepto en proceso 841- Solicitud
10.2.   tipo_datossiniestro         IdSiniestroEntidad             de alta de nuevos siniestros.
                                                                   Identificador único de siniestro. Obligatorio informar si Id
                                                                   Siniestro Entidad no es clave única de siniestro en entidad
10.2.   tipo_datossiniestro         IdSiniestroUnico               aseguradora.
                                                                   Datos de los expedientes del siniestro. Obligatorio
                                                                   informar si el indicador "Por expediente" se informa con
10.2.   tipo_datossiniestro         Expedientes                    valor verdadero (True)
                                                                   Detalle de proceso. Obligatorio informar si en cabecera de
11.1    tipo_liquidacion            DetalleProceso                 fichero el proceso se identificar por detalle de proceso.

                                                               Detalle de proceso. Obligatorio informar si en cabecera de
11.3    tipo_cuentaefectivo      DetalleProceso                fichero el proceso se identificar por detalle de proceso.
                                                               Detalle de proceso. Obligatorio informar si en cabecera de
12.2    tipo_datosmensaje        DetalleProceso                fichero el proceso se identificar por detalle de proceso.
                                                               Comisiones vinculadas a la cobertura. Obligatorio informar
13.7    tipo_cobertura           DatosComisiones               en recibos que no cubren todas las coberturas de la póliza.
                                                               Importe bruto de la comisión. Obligatorio si no informado
13.9.   tipo_comision            ComisionBruta                 el campo Comisión líquida.
                                                               Importe líquido de la comisión. Obligatorio si no informado
13.9.   tipo_comision            ComisionLiquida               el campo Comisión bruta.
                                                               Datos de la cuenta bancaria. Obligatorio cuando la forma
13.15. tipo_formapago            DatosCuentaCorriente          de pago sea por cuenta bancaria.
                                                               Datos de la forma de pago. Obligatorio informar si Clase de
13.17. tipo_gestioncobro         DatosFormaPago                gestión es CO: Compañía.
13.18. tipo_importes             PrimaNeta                     Prima neta (sin cargos). Obligatorio en Recibo.
                                                               Datos de anulación del recibo. Obligatorio informar si Clase
                                                               movimiento es Anulación de recibo o Anulación de
13.26. tipo_movimientorecibo     Anulacion                     extorno.
                                                               Descripción de clase de centro contratación. Obligatorio si
13.27. tipo_origencontratacion   DescripcionClase              Clase de Contratación es Otros.
                                                               Datos del domicilio de la persona. Obligatorio si la persona
13.32 tipo_personafisica         Domicilio                     es el Tomador de la póliza.
                                                               Datos del domicilio de la persona. Obligatorio si la persona
13.33. tipo_personajuridica      Domicilio                     es el Tomador de la póliza.
                                                               Código de modalidad. Obligatorio si póliza no colectiva y
13.36. tipo_ramo                 ModalidadRamo                 ramo es Autos, Hogar, Comunidades o Asistencia sanitaria.
                                                               Descripción de modalidad. Obligatorio si se informa el
13.36. tipo_ramo                 DescripcionModalidad          campo Modalidad Ramo.
                                                               Descripción de la clase de suplemento. Obligatorio
                                                               informar si clase de suplemento es NI: Ninguno de los
13.44. tipo_suplementopoliza     DescripcionClaseSuplemento    anteriores.
                                                               Fecha de reactivación de la póliza. Obligatorio informar si
13.45. tipo_suspensionpoliza     FechaReactivacion             póliza reactivada.
                                                               Coberturas incluidas en recibo o afectadas en siniestro.
13.85 tipo_riesgorecsin          DatosCoberturas               Obligatorio en siniestro.
                                                               Descripción del capital asegurado. Obligatorio en caso de
13.99. tipo_capital              Descripcion                   que Bien sea Otros.

                         6.3.5. Campos protegidos por LOPD

                Los campos que no puedan ser informados con sus datos correspondientes en aplicación de la Ley
                Orgánica de Protección de Datos, han ser cumplimentados con el literal “LOPD”.

                      6.4. Precisión en los datos

             6.4.1. Importes: redondear

      En los datos de tipo importe, la función que se ha de aplicar para la reducción del número de
      decimales a dos es redondear.

             6.4.2. Cuenta bancaria (IBAN)

      El número de cuenta bancaria se han de proporcionar con todos sus dígitos reales, sin utilizar
      caracteres del tipo “X” o “*” para ocultar estos, como se hace en determinados documentos por
      motivos de seguridad.

             6.4.3. Fechas

      Hora

      Los campos fecha se han definido de tipo fecha – hora (dateTime) con objeto de poder informar la
      hora de forma precisa.

      Se ha de tener especial cuidado en dar la hora correcta cuando este dato es muy relevante o
      significativo. Es el caso por ejemplo de las fechas de efecto y vencimiento, para delimitar el periodo
      de vigencia de póliza o recibo.

      Póliza: Fecha de anulación

      En “Datos póliza > Datos anulación > Fecha de anulación” se ha de informar la fecha de efecto de
      la anulación, en el caso de póliza anulada. En Fecha de situación se ha informar la fecha en que ha
      sido registrada la anulación, de acuerdo con lo recogido en el punto 6.1.2.- Fecha de situación.

       Ejemplo: Póliza anulada
       Datos Póliza ->             Id Póliza
                                   Numero Suplemento
                                   Datos Mediador
                                   Código Entidad
                                   Datos Ramo
       Situación Póliza            AN: Anulada
       Clase Póliza                NP: Nueva producción
       Datos Anulación ->          Fecha Anulación               20180102T00:00:00
                                   Motivo Anulación              AC: Acuerdo anulación
                                   Detalle Anulación
       Fechas ->                   Fecha Situación               20180103T00:00:00
                                   Fecha Efecto Inicial          20180101T00:00:00
                                   Fecha Efecto Actual           20180101T00:00:00
                                   Fecha Vencimiento             20180131T00:00:00
                                   Fecha Fin Seguro
                                   Fecha Solicitud
                                   Fecha Emisión                 20180101T00:00:00
                                   Fecha Primer Vencimiento

      Fecha de vencimiento

      En los casos en que no exista fecha de vencimiento, se ha de informar valor “9999-12-
      31T00:00:00”. Por ejemplo, es el caso de pólizas vitalicias o recibos de prima única en el ramo de
      Vida.

      Ejemplo:

      <Fechas>
             <FechaSituacion>2013-01-01T00:00:00</FechaSituacion>
             <FechaEfectoInicial>2013-01-01T00:00:00</FechaEfectoInicial>
             <FechaEfectoActual>2013-01-01T00:00:00</FechaEfectoActual>
             <FechaVencimiento>9999-12-31T00:00:00</FechaVencimiento>
             <FechaEmision>2013-01-01T00:00:00</FechaEmision>
      </Fechas>

             6.4.4. Capital ilimitado

      Cuando el capital asegurado contratado sea ilimitado se ha de informar valor “INF”. Es el valor
      correspondiente a Infinito en el tipo de dato predefinido “double”.

      Ejemplo:

      <DatosCoberturas>
            <Cobertura>
                   <NumeroOrden>1</NumeroOrden>
                   <IdCobertura>C01</IdCobertura>
                   <DescripcionCobertura>Descripción de la cobertura</DescripcionCobertura>
                   <FechaInicio>2018-01-01T00:00:00</FechaInicio>
                   <FechaFin>2019-01-01T00:00:00</FechaFin>
                   <CapitalAsegurado>INF</CapitalAsegurado>
                   (…)
            <Cobertura>
      <DatosCoberturas>

             6.4.5. Claves: Valor NI- Ninguno de los anteriores

      En aquellos campos cuyo dato admitido está delimitado por una lista de valores entre los que se
      encuentra el valor “NI: Otro, ninguno de los anteriores”, se ha evitar en la medida de lo posible la
      utilización de este, con objeto de no ofrecer información imprecisa, salvo cuando no exista otra
      opción disponible.

             6.4.6. Datos de rechazo

      En los rechazos, además de indicar el motivo, cuando proceda se ha de informar el dato correcto
      en Error Devolución; en el campo específico de importe o fecha.

      Los datos originales recibidos que sean incorrectos no se han de actualizar en el proceso de rechazo.

          6.5. Pólizas colectivas

               6.5.1. Estructura básica

      El modelo de datos actual admite la posibilidad de informar la póliza colectiva de dos formas:

           •    Mediante un único objeto póliza y “n” riesgos, donde cada riesgo corresponde a un elemento
                del colectivo. Cada uno de estos elementos se identifica mediante un id riesgo o id
                aplicación.

           •    Mediante “n” objetos póliza, uno por riesgo, donde se utiliza el id aplicación de la cabecera
                del objeto para identificar cada uno de los elementos del colectivo.

      Puesto que la utilización de uno u otro modelo depende fundamentalmente de como se recoge la
      póliza colectiva en el sistema informático de la entidad aseguradora, se considera conveniente poder
      seguir utilizando cualquiera de ellos en el formato EIAC y no restringir la utilización de uno u otro a
      las modalidades de póliza colectiva que se puedan establecer en función de una serie de categorías.

               6.5.2. Id riesgo vs Id aplicación

      El id riesgo es un campo que no figura en cabecera de póliza y que es común a todos los tipos de
      riesgo. En su descripción no se indica utilización específica para pólizas colectivas. Es decir, una
      póliza con “n” riesgos podría ser colectiva o no.

      En el caso del ramo de vida, existe un ramo específico para Vida colectivos, que indicaría que se
      trata de una póliza colectiva. No es así para el resto de los ramos.

      Es por tanto que se considera que este campo no debería ser utilizado preferentemente para la
      identificación de los diferentes elementos que componen el colectivo asegurado, sino que se ha de
      utilizar para ello el campo Id aplicación

      El campo id aplicación en cambio es específico para póliza colectiva. Figura en cabecera de póliza y
      entre los datos específicos del riesgo. Con objeto de que pueda ser de uso generalizado, se ha
      acordado añadir el campo id aplicación en aquellos tipos de riesgo que no disponen del mismo.

      Con el fin de normalizar y clarificar el uso del campo id de aplicación, se ha de observar lo siguiente
      en su utilización:

           •    Es un campo de utilización exclusivo para pólizas colectivas.
           •    Informado en cabecera si el objeto póliza hace referencia solo a un elemento del colectivo.
                Su valor no ha de formar parte del Id póliza.
           •    Informado en cada Riesgo si el objeto póliza hacer referencia a la póliza colectiva en su
                conjunto. En este caso el campo id aplicación de cabecera de póliza no se ha de informar.

               6.5.3. Información específica de póliza colectiva

      Existe información propia de póliza colectiva que no es extensible al resto de pólizas.

      Para recoger sus datos se ha dispuesto del elemento Datos Póliza Colectiva. En los siguientes
      apartados se abordan los diferentes elementos o bloques de datos que lo componen.

               6.5.4. Agrupación o grupo

      El elemento “Id Agrupación” entre póliza y riesgos permite agrupar riesgos con características
      comunes: Producto/modalidad,Coberturas, Tipología de grupo, Pagador, Requisitos de adhesión.

      Las características de la agrupación se han de informar en uno o “n” elementos independientes y
      referenciar el grupo mediante el campo en riesgo. Por consiguiente:

           •    Definir grupo en elemento “Póliza > Datos Póliza Colectiva > Agrupaciones”
           •    Referenciar a grupo en “Póliza > Datos Riesgos > Riesgo> Id Agrupación”.
           •    Referenciar a grupo en “Recibo > Datos Recibo> Riesgos Recibo > Recibo > Id Agrupación”.

               6.5.5. Tipología de pólizas

      En cuanto a la tipología de pólizas colectivas, se ha definido una doble clasificación en función de
      dos características diferenciadas.

      Tipo de póliza por adhesión:

           •    Abierto: Admite adhesiones voluntarias
           •    Cerrado: No admite adhesiones voluntarias.
           •    Semicerrado: El colectivo es abierto con ciertas restricciones. Puede producirse adhesiones
                si se cumplen ciertas condiciones. Por ejemplo: una póliza colectiva de accidentes
                individuales del personal de una empresa, en la que automáticamente se están produciendo
                altas y bajas del personal a su servicio.

      Tipo de póliza por identificación de asegurados:

           •    Nominada: Los asegurados están identificados de forma individual. Cada asegurado puede
                tener diferentes prestaciones y capitales asegurados.
           •    Innominada: Los asegurados no están identificados de forma individual. Mismas
                prestaciones y capitales a todos los asegurados.
           •    Mixta: Se combinan grupos donde cada asegurado está identificado con otros cuyos
                asegurados están sin identificar.

      Esta tipología es de aplicación también a los diferentes grupos de asegurados que pueden existir
      en la póliza, presentando no obstante los valores dentro de cada una, diferencias respecto los
      anteriores, por lo que se hace necesario categorizarlos a parte.

      Tipo de grupo por adhesión:

           •    Abierto: Admite adhesiones voluntarias
           •    Cerrado: No admite adhesiones voluntarias.

      Tipo de grupo por identificación de asegurados:

           •    Nominada: Los asegurados están identificados de forma individual. Cada asegurado puede
                tener diferentes prestaciones y capitales asegurados.
           •    Innominada: Los asegurados no están identificados de forma individual. Mismas
                prestaciones y capitales a todos los asegurados.

      En el modelo de datos se ha implementado como sigue:

           •    Elemento “Póliza > Datos póliza colectiva > Condiciones Colectivo > Tipologías”
           •    Elemento “Póliza > Datos póliza colectiva > Agrupaciones > Tipologías”

               6.5.6. Distribución del pago

      Se ha considerado necesario disponer de información sobre como de distribuye el pago de la prima
      de la póliza colectiva. La casuística es bastante compleja; se ha establecido la siguiente clasificación:

           •    100% Tomador.
           •    100% Tercero ajeno a la póliza.
           •    Centros de facturación.

           •    Cada asegurado, sus riesgos.
           •    Cada riesgo asegurado.
           •    Cuadros de financiación: Son combinaciones en porcentaje o cantidades fijas (podría ser
                por coberturas) entre Tomador, Tercero y Asegurado.

      En el modelo de datos, se ha materializado en la introducción de un nuevo elemento Distribución
      Pago localizado en las siguientes rutas:

           •    Póliza > Datos póliza colectiva > Condiciones Colectivo > Distribución pago

           •    Póliza > Datos póliza colectiva > Centros facturación > Distribución pago

               6.5.7. Centros de facturación

      El concepto de Centros de Facturación en las pólizas colectivas se refiere a la posibilidad de agrupar
      los riesgos asegurados para hacer un recibo conjunto, si el centro tiene poder liberatorio, o en su
      defecto, proporcionar información económica agrupada de estos riesgos.

      Si el centro de facturación tiene poder liberatorio requiere registrar, entre otros datos, datos de
      pagador y medio de pago.

      Por lo general, la definición de centros de facturación es una exigencia del tomador de la póliza que
      desea repartir el coste total de la misma en distintos centros. Un ejemplo claro sería una cadena de
      supermercados con distintos centros.

      El concepto de centro de facturación es independiente del de agrupación, Se han definido en póliza
      e identificado en cada asegurado a qué centro pertenece.

      En el modelo de datos, se ha implementado mediante un nuevo elemento “Centros Facturacion”
      localizado en la siguiente ruta:

           •    Póliza > Datos Póliza colectiva > Centros Facturación

      Referencia a centro de facturación en:

           •    Póliza > Datos Riesgos > Riesgo > Id centro facturación

           •    Recibo > Datos Recibo > Id centro facturación

               6.5.8. Participación en beneficios

      La participación en beneficios es un concepto de recibo asociado a riesgo, resultado de aplicar
      condiciones de la póliza referentes a siniestralidad que tienen efecto en el importe a pagar. Es más
      frecuente en pólizas colectivas, pero también se puede dar en el resto de las pólizas.

      En póliza no es un importe, sino que se establece mediante unas condiciones o reglas que se acaban
      traduciendo en una fórmula para su cálculo.

      El importe trasladado al recibo puede hacerse en forma de diferentes conceptos al ser necesario
      informar su ejercicio de devengo y la retención aplicada. Se han identificado los siguientes:

           •    Devengada en ejercicio anterior
           •    Anticipo ejercicio actual

           •    Recuperación sobre anticipo de ejercicio actual
           •    Retención IRPF

      En el modelo de datos, se ha implementado mediante la introducción de un nuevo elemento
      denominado Participación en beneficios directamente en Póliza.

      En cuanto a los importes en Recibo, se han añadido nuevos valores para los conceptos mencionados
      en Otro importe.

               6.5.9. Id empleado

      El id de empleado o número de matrícula de empleado es un dato muy frecuentemente utilizado
      para la identificación de los asegurados en pólizas colectivas de empresa.

      Con objeto de poder informar este dato, se ha decidido añadir el campo adicional Id empleado en
      los riesgos recogidos en la tabla siguiente.

       Riesgos
       Elemento                      Tipo                             Id Empleado
       Riesgo Vida                   tipo_riesgovida                  Sí
       Riesgo Accidentes             tipo_riesgoaccidentes            Sí
       Riesgo Salud                  tipo_riesgosalud                 Sí
       Riesgo Asistencia Sanitaria   tipo_riesgoasistenciasanitaria   Sí
       Riesgo Autos                  tipo_riesgoautos                 Sí
       Riesgo Asistencia Viaje       tipo_riesgoasistenciaviaje       Sí
       Riesgo Decesos                tipo_riesgodecesos               Sí

               6.5.10. Procesos

      Proceso de Precartera de Pólizas colectivas

      Se ha dispuesto este proceso con el fin de que la entidad aseguradora podrá informar al mediador
      con anterioridad a la renovación de la situación del colectivo y de la imputación de primas.

      Periodicidad proceso Pólizas de cartera

      El proceso 131: Información de Pólizas de Cartera ha de tener en pólizas de cartera periodicidad
      diaria en lugar de mensual, tal como se encuentra recogido de forma genérica para este proceso.

          6.6. Liquidación y Cuenta de efectivo

               6.6.1. Conceptos y contabilización

      Liquidación.

      Movimiento Liquidación. Importe movimiento

      Importe contabilizado en el movimiento de liquidación.

           •   Clase Importe:

                       o   Bruto: Importe bruto. En el caso de recibos cobro mediador, se liquida en un
                           movimiento el importe de recibo y en otro la comisión.
                       o   Liquido: Importe líquido. Se realiza la liquidación en un único movimiento.
                       o   Pago: Importe a pagar o abonar por siniestro.

           •   Importe. Criterio de signo:

                       o   (+): Mediador es acreedor.
                       o   (-): Entidad es acreedora.

      Importe Remesa

      Importe total de la liquidación. Suma del importe de liquidación de cada movimiento que forma
      parte de la liquidación.

      (+) Suma(Movimiento Liquidación. Importe Movimiento. Importe)

      Cuenta de efectivo. Conceptos

      Recibos Cobrados

      Suma del importe Prima total de los recibos cobrados por el Mediador en el periodo.

      (+) Suma(Liquidación. Importe Movimiento (Recibo). Importe Liquidación. Importe (Prima total))

      Comisiones Recibos

      Suma del importe de la comisión bruta de los recibos cobrados por mediador o entidad en el periodo.
      Las comisiones de extorno suman con signo negativo.

           •   Por Bruto: (+) Suma(Liquidación. Importe Movimiento (Recibo). Importe Liquidación.
               Importe (Comisión Brutal))
           •   Por Líquido: (+) Suma(Liquidación. Importe Movimiento (Recibo). Importe Liquidación.
               Importe (Comisión Liquida))

      Retención Comisiones

      Suma del importe de la retención IRPF sobre las comisiones brutas de los recibos cobrados por
      mediador o entidad en el periodo.

           •   Por Bruto: (+) Suma(Liquidación. Importe Movimiento (Recibo). Importe Liquidación.
               Importe (Retención IRPF))
           •   Por Líquido: 0.

      Siniestros Pagados

      Suma del importe de los pagos de siniestro realizados por el mediador en el periodo.

      (+) Suma(Liquidación. Importe Movimiento (Siniestro). Importe Liquidación. Importe)

      Otros Conceptos

      Suma del importe de otros conceptos contabilizados en el saldo de la cuenta de efectivo. En el
      objeto liquidación se informa con Movimiento contable.

      (+) Suma(Liquidación. Importe Movimiento (Contable). Importe Liquidación. Importe (Importe
      Bruto))

      Detención Otros

      Suma del importe de la retención IRPF sobre el importe bruto de los Movimientos contables por
      otros conceptos distintos de comisiones.

      (+) Suma(Liquidación. Importe Movimiento (Contable). Importe Liquidación. Importe (Retención
      IRPF))

      Remesas

      Suma de importe de las liquidaciones realizadas por mediador o entidad en el periodo. Son las
      transferencias económicas reales.

      (-) Suma(Liquidación. Importe Remesa(Estado LI))

      Cuenta de efectivo. Saldos

      Saldo Inicial

      Saldo inicial del periodo.

      Saldo Final

      Saldo final = Saldo inicial + Recibos cobrados + Comisiones recibos + Retención comisiones +
      Siniestros pagados + Otros conceptos + Retención otros + Remesas.

                          6.6.2. Ejemplo

Ejemplo de Liquidación y Cuenta de efectivo

Cuenta de efectivo                                   Criterio de signos en Cta efectivo y Liquidación
Saldo inicial                        0               (+)       Mediador es acreedor
Recibos Cobrados                  -400               (-)       Mediador es deudor
Comisiones Recibos                  20
Retencion Comisiones                -4
Siniestros Pagados                1000
Otros Conceptos                     10
Retencion Otros                     -2
Remesas                           -624 = (-) Importe Remesa.
Saldo final                          0

Movimientos de recibo                                                              Liquidación
                                         Gestion    Prima Comisión Comisión
Num recibo              Clase recibo     Cobro      total     Bruta     Líquida    Clase importe        Importe
R01                     Cartera          Entidad        1000         20         16 Líquido                       16
R02                     Extorno          Entidad        -500        -10         -8 Líquido                       -8
R03                     Cartera          Mediador         400        10          8 Líquido                     -392 = (-) Prima Total - Comisión Líquida

Movimientos siniestro (Pago por mediador)
Num siniestro          Num pago                     Importe                         Clase importe       Importe
S001                   P01                             1000                         Pago                       1000

Movimientos contables
                                                              Importe Importe
Concepto                Clase concepto                        bruto    líquido   Clase importe Importe
Rappel tramo 1          Rappel                                      10         8 Líquido                 8
                                                                                 Importe remesa        624

                          6.6.3. Casos de uso

                 Datos de Recibos

       Recibo                                                                   Recibo
       Id Recibo                  Recibo 1                                      Id Recibo           Recibo 2
       Id Recibo Único                                                          Id Recibo Único
       Situación Recibo           LI-Liquidado                                  Situación Recibo    LI-Liquidado
       Clase Recibo               CA-Cartera                                    Clase Recibo        CA-Cartera
       Fecha Situación            2024-01-31T23:59:00                           Fecha Situación     2024-01-31T23:59:00
                                  Prima Total                         100                           Prima Total                                    200
       Comisión 1                                                               Comisión 1
                                  Importe Bruto                         10                          Importe Bruto                                  20
                                  Importe Liquido                        8                          Importe Liquido                                16
                                  % Retención                           20                          % Retención                                    20
       Comisión 2                                                               Comisión 2
                                  Importe Bruto                         4                           Importe Bruto                                    8
                                  Importe Liquido                     3,2                           Importe Liquido                                6,4
                                  % Retención                          20                           % Retención                                     20

      Caso 1: Cobro por mediador. Liquidación por Clase importe = Bruto

      En la liquidación de recibo cobro mediador por clase de importe bruto, se liquida de forma separada
      la prima de las comisiones.

       Liquidación
       Id Liquidación Mediador   Liq 1
       Estado Liquidación        LI- Liquidada
       Fecha Liquidación         2024-01-31T23:59:00
       Importe Remesa                            -300
       Movimiento Liquidación
                                 Importe Movimiento
                                                        Clase Importe   BR- Bruto
                                                        Importe                              -100 = Prima Total
                                 Movimiento Recibo
                                                        Id Recibo        Recibo 1
                                                        Id Recibo Único
                                                        Situación Recibo LI-Liquidado
                                                        Fecha Situación 2024-01-31T23:59:00
       Movimiento Liquidación
                                 Importe Movimiento
                                                        Clase Importe   BR- Bruto
                                                        Importe                              -200 = Prima Total
                                 Movimiento Recibo
                                                        Id Recibo        Recibo 2
                                                        Id Recibo Único
                                                        Situación Recibo LI-Liquidado
                                                        Fecha Situación 2024-01-31T23:59:00

       Liquidación
       Id Liquidación Mediador Liq 2
       Estado Liquidación      LI- Liquidada
       Fecha Liquidación       2024-01-31T23:59:00
       Importe Remesa                           33,6
       Movimiento Liquidación
                               Importe Movimiento
                                                       Clase Importe   BR- Bruto
                                                       Importe                          11,2 = Comisiones
                                Movimiento Recibo
                                                       Id Recibo        Recibo 1
                                                       Id Recibo Único
                                                       Situación Recibo LI-Liquidado
                                                       Fecha Situación 2024-01-31T23:59:00
       Movimiento Liquidación
                                Importe Movimiento
                                                       Clase Importe   BR- Bruto
                                                       Importe                          22,4 = Comisiones
                                Movimiento Recibo
                                                       Id Recibo        Recibo 2
                                                       Id Recibo Único
                                                       Situación Recibo LI-Liquidado
                                                       Fecha Situación 2024-01-31T23:59:00

       Cuenta Efectivo
       Saldo Inicial                     0
       Recibos Cobrados              -300
       Comisiones Recibos              42
       Retención Comisiones           -8,4
       Siniestros Pagados                0
       Otros Conceptos                   0
       Retención Otros                   0
       Remesas                      266,4
       Saldo final                       0

      Caso 2: Cobro por mediador. Liquidación por Clase Importe = Líquido.

      En la liquidación de recibo cobro mediador por clase de importe líquido, se liquida de forma conjunta
      en un único movimiento de liquidación prima y comisiones.

       Liquidación
       Id Liquidación Mediador    Liq 3
       Estado Liquidación         LI- Liquidada
       Fecha Liquidación
       Importe Remesa                             -266,4
       Movimiento Liquidación
                                  Importe Movimiento
                                                           Clase Importe   LI- Líquido
                                                           Importe                        -88,8 = - Prima Total + Comisiones
                                  Movimiento Recibo
                                                           Id Recibo        Recibo 1
                                                           Id Recibo Único
                                                           Situación Recibo LI-Liquidado
                                                           Fecha Situación 2024-01-31T23:59:00
       Movimiento Liquidación
                                  Importe Movimiento
                                                           Clase Importe   LI- Líquido
                                                           Importe                       -177,6 = - Prima Total + Comisiones
                                  Movimiento Recibo
                                                           Id Recibo        Recibo 2
                                                           Id Recibo Único
                                                           Situación Recibo LI-Liquidado
                                                           Fecha Situación 2024-01-31T23:59:00

       Cuenta Efectivo
       Saldo Inicial                            0
       Recibos Cobrados                     -300
       Comisiones Recibos                     42
       Retención Comisiones                  -8,4
       Siniestros Pagados                       0
       Otros Conceptos                          0
       Retención Otros                          0
       Remesas                             266,4
       Saldo final                              0

      Caso 3: Cobro por Entidad aseguradora.

      En liquidación de recibo cobro entidad aseguradora. la clase de importe es siempre líquido pues
      solo aplica la liquidación de comisiones.

       Liquidación
       Id Liquidación Entidad   Liq 4
       Estado Liquidación       LI- Liquidada
       Fecha Liquidación
       Importe Remesa                               33,6
       Movimiento Liquidación
                                Importe Movimiento
                                                           Clase Importe   LI- Líquido
                                                           Importe                            11,2 = Comisiones
                                Movimiento Recibo
                                                           Id Recibo        Recibo 1
                                                           Id Recibo Único
                                                           Situación Recibo LI-Liquidado
                                                           Fecha Situación 2024-01-31T23:59:00
       Movimiento Liquidación
                                Importe Movimiento
                                                           Clase Importe   LI- Líquido
                                                           Importe                            22,4 = Comisiones
                                Movimiento Recibo
                                                           Id Recibo        Recibo 2
                                                           Id Recibo Único
                                                           Situación Recibo LI-Liquidado
                                                           Fecha Situación 2024-01-31T23:59:00

       Cuenta Efectivo
       Saldo Inicial                     0
       Recibos Cobrados                  0
       Comisiones Recibos              42
       Retención Comisiones           -8,4
       Siniestros Pagados                0
       Otros Conceptos                   0
       Retención Otros                   0
       Remesa                        -33,6
       Saldo final                       0

      7. Control de cambios
      Cambios introducidos en V07 sobre normas de uso V06.

      4.1. Nombre

           •   Proceso Confirmación. Eliminado.

      5.3. Relación proceso – objeto.

           •   Procesos 721-724 Confirmación. Eliminados.
           •   Proceso 601 Envío Mensaje. Añadido.
           •   Datos suspensiones. Actualizado.
           •   Clase recibo: AE, TR, AP. Añadido.
           •   841: AP. Corrige error.

      5.4. Descripción detallada

           •   269, 299, 502, 601. Añadidos.

      6.1.4. Siniestro: acciones y mensajes

           •   Mensajes. Añadido.

      6.2. Consistencia en los datos.

           •   6.2.1. Identificador único. Añadido.
           •   6.2.3. Número de suplemento. Añadido.
           •   6.2.4. Fechas: Póliza vs Suplemento. Añadido.
           •   6.2.7. Recibo. Modificable vs no modificable. Actualizado.
           •   6.2.9. Recibo. Clase Extorno. Signo. Añadido.
           •   6.2.10. Siniestro. Pagos. Añadido.

      6.3. Obligatoriedad

           •   6.3.2. Campos opcionales. Actualizado.
           •   6.3.4. Obligatoriedad condicionada. Actualizado.
           •   6.3.5. Campos protegidos por LOPD. Añadido.

      6.4.3. Fechas. Actualizado.

      6.6. Liquidación y cuenta de efectivo. Añadido.

```
