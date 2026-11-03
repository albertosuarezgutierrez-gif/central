// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
//  PENDIENTE DE REVISIÓN POR ALBERTO — redactado el 28/10/2026, aún no validado por el corredor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Base de conocimiento FIJA y VERSIONADA del «gabinete de siniestros» (IA del expediente). PURO.
// Va tal cual en el prompt del veredicto y de la redacción. Cada análisis anota `conocimientoVersion` en su `meta`
// (`metaGabinete()` de `siniestro-gabinete.ts`): si cambias el texto, SUBE la versión.
// Criterio: conciso y PRUDENTE. Nada de sentencias con número inventado; donde no hay certeza, se dice «(verificar)».

export const CONOCIMIENTO_SINIESTROS_VERSION = '2026-10-28.1'
export const CONOCIMIENTO_SINIESTROS_ESTADO = 'PENDIENTE DE REVISIÓN POR ALBERTO (28/10/2026)'

export const CONOCIMIENTO_SINIESTROS = `BASE DE CONOCIMIENTO DEL GABINETE DE SINIESTROS · versión ${CONOCIMIENTO_SINIESTROS_VERSION} · ${CONOCIMIENTO_SINIESTROS_ESTADO}
Resumen de trabajo, no texto legal literal. Si algo de aquí no encaja con el caso, dilo; no lo fuerces.

A. LEY 50/1980, DE CONTRATO DE SEGURO (LCS)
- Art. 1. El asegurador, a cambio de la prima, se obliga a indemnizar, DENTRO DE LOS LÍMITES PACTADOS, el daño del evento cuyo riesgo es objeto de cobertura (o a pagar el capital/renta convenido). Primera pregunta siempre: ¿el hecho cae dentro del riesgo descrito?
- Art. 3. Condiciones generales: nunca lesivas para el asegurado. Las cláusulas LIMITATIVAS de sus derechos deben estar DESTACADAS de modo especial y ser ESPECÍFICAMENTE ACEPTADAS POR ESCRITO; si no consta esa aceptación, no son oponibles al asegurado.
  · Delimitadoras vs limitativas (doctrina del Tribunal Supremo, Sala 1ª; referencia concreta: verificar antes de citarla): DELIMITADORA = define qué riesgo se cubre, en qué cuantía, plazo y ámbito (no exige firma específica). LIMITATIVA = restringe, condiciona o modifica el derecho del asegurado a la indemnización una vez producido un riesgo que sí está cubierto (exige el art. 3). Una exclusión que vacía de contenido la cobertura que razonablemente esperaba el asegurado se trata como limitativa (o incluso lesiva). El rótulo «exclusión» no decide: decide el efecto.
  · Pregunta práctica: ¿la compañía rehúsa con una cláusula de las condiciones generales o especiales? ¿Está destacada (negrita/recuadro) y firmada específicamente? Si no consta, pedir a la compañía la prueba de la aceptación.
- Art. 10. Declaración del riesgo: el tomador contesta el CUESTIONARIO que le presenta el asegurador. Lo no preguntado no le es imputable (si no hubo cuestionario, queda exonerado). Si hubo reserva o inexactitud: el asegurador puede rescindir en un mes desde que lo conoce; si el siniestro ocurre antes, la prestación se reduce en proporción a la prima que se cobró frente a la que correspondía; solo con dolo o culpa grave queda liberado. Ante un rehúse por «agravación/inexactitud»: pedir el cuestionario firmado.
- Art. 16. Comunicar el siniestro en 7 días desde que se conoce (salvo plazo mayor pactado). Si no se hace, el asegurador puede reclamar los daños y perjuicios por la falta de declaración, SALVO que lo conociera por otro medio: el retraso, por sí solo, no extingue el derecho a la indemnización. Deber de dar información sobre circunstancias y consecuencias.
- Art. 17. Deber de aminorar las consecuencias (salvamento); los gastos razonables de salvamento son a cargo del asegurador dentro de los límites del art. 17.
- Art. 18. El asegurador paga al término de las investigaciones y peritaciones necesarias y, EN TODO CASO, dentro de los 40 DÍAS desde la recepción de la declaración del siniestro debe pagar o consignar el IMPORTE MÍNIMO de lo que pueda deber según lo que ya conoce.
- Art. 19. No hay indemnización si el siniestro lo causó el asegurado de mala fe.
- Art. 20. Intereses de demora del asegurador: mora si no paga en 3 MESES desde el siniestro o no paga el importe mínimo en los 40 días del art. 18. Interés = interés legal del dinero incrementado en un 50 %; pasados 2 años desde el siniestro, no inferior al 20 % anual. No hay recargo si la falta de pago tiene causa justificada o no imputable al asegurador (se interpreta restrictivamente; verificar en cada caso). Útil como palanca en reclamaciones de pago retrasado.
- Art. 23. Prescripción de las acciones: 2 AÑOS en seguros de daños, 5 AÑOS en seguros de personas, desde que pudieron ejercitarse. Una reclamación extrajudicial fehaciente interrumpe la prescripción (art. 1973 CC): conviene dejarla por escrito y con acuse.
- Art. 38 (daños). Peritación: si no hay acuerdo sobre el importe y la forma de la indemnización en 40 días desde la declaración, cada parte designa un perito; si los peritos no se ponen de acuerdo, un tercero. El dictamen es impugnable judicialmente en plazos breves (asegurador 30 días, asegurado 180 días; verificar plazos antes de usarlos). Es la vía del CONTRAPERITAJE.
- Arts. 73 a 76 (responsabilidad civil).
  · Art. 73. Cubre el riesgo de que nazca a cargo del asegurado la obligación de indemnizar a un tercero por hechos previstos en el contrato. Las cláusulas que limitan la cobertura en el tiempo (ocurrencia vs reclamación, «claims made») solo valen en los términos del propio art. 73 y, en lo que limiten derechos, con el art. 3.
  · Art. 74. Salvo pacto, el asegurador asume la DIRECCIÓN JURÍDICA frente a la reclamación del perjudicado y los gastos de defensa son a su cargo; si hay conflicto de intereses, debe comunicarlo y el asegurado puede optar por su propia defensa.
  · Art. 75. RC obligatoria en las actividades que la ley determine.
  · Art. 76. ACCIÓN DIRECTA: el perjudicado puede reclamar directamente al asegurador, que no puede oponerle las excepciones que tendría contra el asegurado (sí la culpa exclusiva del perjudicado y las excepciones personales frente a él). El asegurador puede repetir contra el asegurado si el daño se debió a conducta dolosa. Consecuencia práctica: una cláusula que el asegurador opondría al asegurado no siempre la puede oponer al tercero perjudicado (verificar en el caso).

B. INTERPRETACIÓN
- Art. 1288 Código Civil (contra proferentem): la interpretación de las cláusulas oscuras no favorece a quien causó la oscuridad. La póliza la redacta el asegurador: ante dos lecturas razonables, la favorable al asegurado.
- Lo específico prevalece sobre lo general: condiciones particulares y especiales sobre generales.

C. RC: GARANTÍAS TÍPICAS Y SUS TRAMPAS
- RC de EXPLOTACIÓN: daños a terceros por la actividad descrita en la póliza. Trampa: actividad real distinta de la declarada; daños a bienes confiados, custodiados o sobre los que se trabaja (suelen excluirse o ir con sublímite); el coste de rehacer el propio trabajo defectuoso no es daño a tercero.
- RC PATRONAL: accidentes de trabajo de los propios empleados. Trampas: SUBLÍMITE POR VÍCTIMA muy inferior al general; a menudo exige que exista responsabilidad del empresario; los recargos de prestaciones de la Seguridad Social y las multas no son asegurables; revisar si cubre subcontratistas y autónomos.
- RC de PRODUCTOS: daños causados por productos ya entregados. Trampas: excluye el propio producto, su retirada (recall) y los gastos de reposición; ámbito territorial (exportación, EE. UU./Canadá).
- RC POST-TRABAJOS: daños aparecidos tras entregar la obra o el trabajo. Trampas: periodo de cobertura posterior limitado; delimitación temporal (cuándo «ocurre» el siniestro).
- RC CRUZADA: daños entre asegurados de la misma póliza (p. ej. contratista y subcontratista) como si fueran terceros. Trampa: sin la extensión expresa, los coasegurados NO son terceros entre sí.
- Comunes: franquicias por siniestro; serie de siniestros = un solo siniestro (un límite); daños patrimoniales puros no consecutivos (suelen excluirse); RC contractual asumida por pacto más allá de la legal; ocurrencia vs reclamación (art. 73).

D. VÍAS Y CUÁNDO DERIVAR
1. TRAMITADOR de la compañía: hechos, documentación, petición concreta con plazo; pedir por escrito el motivo del rehúse, la cláusula exacta y el informe pericial.
2. SERVICIO DE ATENCIÓN AL CLIENTE / defensor del asegurado de la entidad: reclamación escrita y formal. Plazo de respuesta según la normativa vigente (tradicionalmente 2 meses, Orden ECO/734/2004; verificar si ha cambiado). Es requisito previo para el supervisor.
3. SUPERVISOR: Servicio de Reclamaciones de la DGSFP, tras la respuesta del SAC o el vencimiento de su plazo. Su informe no es vinculante.
- DERIVAR A ABOGADO: reclamación judicial recibida o necesaria; rehúse firme tras SAC con cuantía relevante; lesiones o daños personales; prescripción cercana; conflicto de intereses en la dirección jurídica (art. 74); cuestión de oponibilidad de cláusulas compleja.
- DERIVAR A PERITO EXTERNO (contraperitaje): desacuerdo con la causa técnica o con la valoración del perito de la compañía; procedimiento del art. 38 en daños.
- El corredor ARGUMENTA y acompaña; la decisión de reclamar, derivar o aceptar es de Alberto con el cliente.`
