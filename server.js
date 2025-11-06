require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

const openAiApiKey = process.env.OPENAI_API_KEY;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));


// --- SECCIÓN DE AUTENTICACIÓN CON GOOGLE ---
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// IDs de tus archivos en Google Drive
const driveFileIds = {
    familia: '1qzsiy-WM65zQgfYuIgufd8IBnNpgUSH9', // <-- ID Juridica
    siniestros: '11gK8-I6eXT2QEy5ZREebU30zB8c6nsN0'  // <-- ID Siniestros
};


// ===================================================================
// === INICIO DE LA FUNCIÓN CON DIAGNÓSTICO ===
// ===================================================================
async function buscarDniEnDrive(dni) {
    let todasLasNotasPublicas = [];
    console.log(`[DEBUG] Iniciando búsqueda para DNI: ${dni}`);

    for (const key in driveFileIds) {
        const fileId = driveFileIds[key];
        try {
            console.log(`[DEBUG] Leyendo archivo: ${key} (ID: ${fileId})`);
            
            // 1. Obtener el contenido del archivo
            const fileContent = await drive.files.get({ fileId: fileId, alt: 'media' });

            console.log(`[DEBUG] Tipo de dato recibido de Drive: ${typeof fileContent.data}`);

            // 2. Asegurarse de que el JSON esté parseado
            let jsonData;
            if (typeof fileContent.data === 'string') {
                console.log(`[DEBUG] El dato es un STRING. Intentando parsear...`);
                try {
                    jsonData = JSON.parse(fileContent.data);
                } catch (e) {
                    console.error(`[DEBUG] ERROR: El string no es un JSON válido. Archivo ${key}. Error: ${e.message}`);
                    continue; // Saltar al siguiente archivo
                }
            } else if (typeof fileContent.data === 'object' && fileContent.data !== null) {
                console.log(`[DEBUG] El dato es un OBJETO. Asignando directamente.`);
                // Imprimimos solo una parte para no saturar la consola
                console.log(`[DEBUG] Contenido (parcial): ${JSON.stringify(fileContent.data).substring(0, 400)}`);
                jsonData = fileContent.data;
            } else {
                console.error(`[DEBUG] Contenido inesperado del archivo ${key}: no es string ni objeto.`);
                continue; // Saltar
            }

            // 3. Lógica robusta para encontrar el array de expedientes
            let records = [];
            if (Array.isArray(jsonData)) {
                // El archivo JSON es un array en la raíz: [ {...}, {...} ]
                console.log(`[DEBUG] El JSON parseado ES un ARRAY. N° de registros: ${jsonData.length}`);
                records = jsonData;
            } else if (typeof jsonData === 'object') {
                // El archivo JSON es un objeto: { "algunaClave": [ {...}, {...} ] }
                console.log(`[DEBUG] El JSON parseado ES un OBJETO. Buscando un array dentro...`);
                const arrayKey = Object.keys(jsonData).find(k => Array.isArray(jsonData[k]));
                
                if (arrayKey) {
                    console.log(`[DEBUG] Array encontrado dentro del objeto, en la clave: "${arrayKey}"`);
                    records = jsonData[arrayKey];
                } else {
                    console.error(`[DEBUG] ERROR: El JSON es un objeto, pero NO se encontró un array dentro de él.`);
                }
            } else {
                    console.error(`[DEBUG] ERROR: El JSON parseado no es ni array ni objeto.`);
            }

            // 4. Filtrar los expedientes por DNI
            const expedientes = records.filter(item => 
                item.dni && item.dni.toString().trim() === dni.toString().trim()
            );
            
            console.log(`[DEBUG] Expedientes encontrados para DNI ${dni} en archivo ${key}: ${expedientes.length}`);

            // 5. Procesar los expedientes encontrados (código original)
            if (expedientes.length > 0) {
                 expedientes.forEach(exp => {
                    const titulo = `--- Expediente: ${exp.caratula || exp.numeroReclamo || 'General'} ---\n`;
                    
                    const notasFormateadas = (exp.observaciones || [])
                        .filter(obs => obs.texto && obs.texto.trim() !== '' && obs.fecha) 
                        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)) 
                        .map((obs, index) => { 
                            const fechaTrabajoLegible = new Date(obs.fecha + 'T00:00:00').toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
                            let textoDeActuacion = `Fecha: ${fechaTrabajoLegible}\nActuación: ${obs.texto}`;
                            
                            if (index === 0 && obs.proximaRevision) {
                                const proximaRevisionLegible = new Date(obs.proximaRevision + 'T00:00:00').toLocaleString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
                                textoDeActuacion += `\n(Próxima revisión programada para el ${proximaRevisionLegible})`;
                            }
                            return textoDeActuacion;
                        })
                        .join('\n\n');
                    
                    if(notasFormateadas) {
                        todasLasNotasPublicas.push(titulo + notasFormateadas);
                    }
                });
            }

        } catch (error) {
            console.error(`Error al leer o procesar el archivo ${key} (${fileId}) de Drive:`, error.message);
            if (error.response && error.response.data) {
                console.error("Detalle del error de API:", JSON.stringify(error.response.data, null, 2));
            }
        }
    }

    console.log(`[DEBUG] Búsqueda finalizada. Total de notas públicas: ${todasLasNotasPublicas.length}`);
    return todasLasNotasPublicas.join('\n\n');
}
// =================================================================
// === FIN DE LA FUNCIÓN CON DIAGNÓSTICO ===
// =================================================================


// --- RUTA PARA LA CONSULTA DE EXPEDIENTES ---
app.post('/api/consulta-expediente', async (req, res) => {
    const { dni } = req.body;
    if (!dni) {
        return res.status(400).json({ error: 'El DNI es requerido.' });
    }

    try {
        const notasPublicas = await buscarDniEnDrive(dni);

        if (!notasPublicas || notasPublicas.trim() === '') {
            return res.send("No se encontró información pública para el DNI proporcionado o no hay actuaciones para mostrar. Si cree que es un error, por favor póngase en contacto con el estudio.");
        }

        // === PROMPT AJUSTADO (código original) ===
        const prompt = `
            Eres un asistente legal del estudio "García & Asociados".
            Tu tarea es tomar las siguientes notas internas y presentarlas de forma clara y estructurada para que el cliente final lo entienda.
            INSTRUCCIONES CLAVE:
            1.  **Formato de Salida:** Debes generar un único texto. Comienza con un saludo cordial ("Estimado/a cliente, a continuación le presentamos un resumen actualizado sobre el estado de sus expedientes.") y finaliza con "Atentamente, Estudio García & Asociados.".
            2.  **Estructura:** Para cada expediente (delimitado por "--- Expediente: ... ---"), crea un título usando Markdown (ej: ### **Expediente: CARATULA DEL EXPEDIENTE**).
            3.  **Actuaciones:** Debajo de cada título, crea una lista de viñetas (usando un asterisco *). Cada viñeta debe representar una actuación.
            4.  **Contenido de la Viñeta:** Cada viñeta debe comenzar con la fecha de la actuación en negrita (ej: **18 de octubre de 2025:**), seguido de la descripción de la actuación reescrita en un tono claro y profesional.
            5.  **Próxima Revisión (IMPORTANTE):** Si una actuación incluye una nota entre paréntesis sobre una "próxima revisión", debes integrar esa información de forma natural al final de ESA MISMA viñeta. Por ejemplo: "Se presentó el escrito de demanda. **El próximo seguimiento del expediente está programado para el 25 de octubre de 2025.**"
            6.  **Orden:** Las notas ya vienen ordenadas de la más reciente a la más antigua. RESPETA ESE ORDEN.
            7.  **No Inventar:** Basa tu respuesta únicamente en las notas proporcionadas.
            Notas internas a procesar:
            ${notasPublicas}
        `;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4-turbo",
            messages: [{"role": "user", "content": prompt}],
            temperature: 0.3,
        }, {
            headers: { 'Authorization': `Bearer ${openAiApiKey}` }
        });

        res.send(response.data.choices[0].message.content);

    } catch (error) {
        console.error("Error en /api/consulta-expediente:", error);
        res.status(500).json({ error: 'Ocurrió un error al procesar su solicitud.' });
    }
});


// --- CÓDIGO ORIGINAL PARA GENERAR CARTAS (INTACTO) ---
function numeroALetras(num) {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];

    function convertir(n) {
        if (n < 10) return unidades[n];
        if (n < 20) return especiales[n - 10];
        if (n < 100) {
            const u = n % 10;
            const d = Math.floor(n / 10);
            return decenas[d] + (u > 0 ? ' y ' + unidades[u] : '');
        }
        if (n < 1000) {
            const c = Math.floor(n / 100);
            const resto = n % 100;
            if (n === 100) return 'cien';
            return centenas[c] + (resto > 0 ? ' ' + convertir(resto) : '');
        }
        if (n < 1000000) {
            const miles = Math.floor(n / 1000);
            const resto = n % 1000;
            const milesTexto = miles === 1 ? 'mil' : convertir(miles) + ' mil';
            return milesTexto + (resto > 0 ? ' ' + convertir(resto) : '');
        }
        if (n < 1000000000) {
            const millones = Math.floor(n / 1000000);
            const resto = n % 1000000;
            const millonesTexto = millones === 1 ? 'un millón' : convertir(millones) + ' millones';
            return millonesTexto + (resto > 0 ? ' ' + convertir(resto) : '');
        }
        return 'número demasiado grande';
    }
    const parteEntera = Math.floor(num);
    return convertir(parteEntera);
}

// ===================================================================
// === INICIO DE LA FUNCIÓN DE CARTA MODIFICADA ===
// ===================================================================
async function generarCartaConIA(data) {
    if (!openAiApiKey) {
        throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway.");
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    
    const hoy = new Date();
    const fechaActualFormateada = new Date(hoy.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

    const montoEnLetras = numeroALetras(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    
    // --- INICIO DE MODIFICACIONES ---

    // 1. Definir variables de Género para el CLIENTE (Resuelve Puntos 1 y 4)
    // Usamos el dato 'generoCliente' que envía el HTML
    const trato = (data.generoCliente === 'Femenino') ? 'Sra.' : 'Sr.';
    const articulo = (data.generoCliente === 'Femenino') ? 'la' : 'el';
    const asegurado = (data.generoCliente === 'Femenino') ? 'asegurada' : 'asegurado';
    const representado = (data.generoCliente === 'Femenino') ? 'representada' : 'representado';

    // 2. Mantener la lógica original del conductor (no tenemos su género)
    let conductorInfoParaIA = "El vehículo era conducido por el/la titular.";
    if (data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase()) {
        conductorInfoParaIA = `El vehículo era conducido por el/la Sr./Sra. ${data.siniestro.conductorNombre}`;
        if (data.siniestro.conductorDni) {
            conductorInfoParaIA += `, DNI N° ${data.siniestro.conductorDni}`;
        }
        conductorInfoParaIA += ".";
    }
    
    let pruebaDocumental = `
V. PRUEBA DOCUMENTAL
Se acompaña en este acto la siguiente documentación respaldatoria:
A. Certificado de cobertura vigente
B. Cédula del vehículo
C. Documento de identidad del asegurado
D. Licencia de conducir del conductor
E. Registro fotográfico de los daños
F. Presupuesto de reparación`;

    if (data.hayLesiones) {
        pruebaDocumental += `
G. Certificados médicos`;
    }

    // 4. Modificar el PROMPT
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados". Tu tarea es redactar una carta de patrocinio formal y precisa, siguiendo estrictamente las instrucciones.
        
        INSTRUCCIONES CLAVE:
        1.  **Género del Cliente (¡MUY IMPORTANTE!):**
            -   Trato del cliente: ${trato} (Usar 'Sr.' o 'Sra.')
            -   Artículo del cliente: ${articulo} (Usar 'el' o 'la')
            -   Calidad del cliente: ${asegurado} (Usar 'asegurado' o 'asegurada')
            -   Representación: ${representado} (Usar 'representado' o 'representada')
            -   Debes usar estas variables en TODA la carta para asegurar la concordancia de género del cliente.

        2.  **Relato del Hecho (¡MUY IMPORTANTE!):**
            -   **Fecha y Hora (Resuelve Punto 2):** El relato en la sección "II. HECHOS" DEBE comenzar obligatoriamente con la fecha y hora del siniestro.
            -   **Datos del Tercero (Resuelve Punto 3):** El relato DEBE incluir la descripción del vehículo N°2 (el tercero), mencionando su titular/conductor, el vehículo y su aseguradora.
            -   **Lógica del Conductor:** Te doy un dato clave: "${conductorInfoParaIA}". Debes integrar esta información de forma natural en el relato SI el vehículo estaba en movimiento. Si estaba estacionado, NO menciones al conductor.
            -   **Lesiones:** Si hay lesiones (${data.hayLesiones ? 'Sí' : 'No'}), debes mencionarlo en el relato (ej: "...sufrió lesiones, consistentes en ${data.lesionesDesc}").

        3.  **Responsabilidad:** Te doy una pista sobre la infracción: "${data.infracciones}". No la copies textualmente. Úsala para redactar la primera línea de la sección de responsabilidad (ej: si la pista es "maniobra imprudente", redacta "Realizó una maniobra intempestiva...").
        
        4.  **Estructura y Formato:** Sigue la estructura de las secciones sin alterarla. Las secciones V y VI deben ser copiadas textualmente como se proporcionan en el modelo.

        **DATOS PRINCIPALES (para tu referencia):**
        - Fecha de Hoy: ${fechaActualFormateada}
        - Datos del Cliente: ${trato} ${data.siniestro.cliente.toUpperCase()}, DNI ${data.siniestro.dni}
        - Vehículo del Cliente: ${data.vehiculoCliente}
        - Partes Dañadas: ${data.partesDanadas}
        - Fecha/Hora Siniestro: ${data.fechaSiniestro} a las ${data.horaSiniestro}
        - Relato Base: "${data.relato}"
        - Datos del Tercero (Vehículo N°2):
            - Titular/Conductor: ${data.nombreTercero}
            - Vehículo: ${data.vehiculoTercero}
            - Aseguradora: ${data.destinatario}
        - Pista Infracción: ${data.infracciones}
        - Monto Total: ${montoEnLetras} (${montoEnNumeros})
        - Destinatario: ${data.destinatario}, con domicilio en ${data.destinatarioDomicilio}

        **CARTA A GENERAR (sigue esta estructura):**
        ---
        Lugar y fecha: Bernal, ${fechaActualFormateada}
        Destinatario: ${data.destinatario.toUpperCase()}
        Domicilio: ${data.destinatarioDomicilio}
        S/D

        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal de ${articulo} ${trato} ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños materiales ${data.hayLesiones ? 'y lesiones físicas' : ''} sufridos como consecuencia del siniestro vial que se detalla a continuación.

        II. HECHOS
        El día ${data.fechaSiniestro}, siendo aproximadamente las ${data.horaSiniestro} horas, ${articulo} ${asegurado} de mi estudio circulaba al mando de su vehículo ${data.vehiculoCliente}.
        [AQUÍ CONSTRUYE EL RELATO: Integra "${data.relato}", la lógica de "${conductorInfoParaIA}", y OBLIGATORIAMENTE describe al otro vehículo (el tercero) usando los datos: "${data.nombreTercero}", "${data.vehiculoTercero}", y su aseguradora "${data.destinatario}"].
        
        El impacto se produjo en las siguientes partes del vehículo de mi cliente: ${data.partesDanadas}.
        Como consecuencia directa del referido evento, el vehículo de mi ${representado} sufrió los daños materiales cuya reparación constituye el objeto del presente reclamo.
        ${data.hayLesiones ? `Asimismo, como producto del impacto, ${articulo} ${trato} ${data.siniestro.cliente} sufrió lesiones, consistentes en ${data.lesionesDesc}.` : ''}

        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor del vehículo de su ${asegurado}, quien incurrió en las siguientes faltas:
        [AQUÍ REDACTA LA PRIMERA INFRACCIÓN BASÁNDOTE EN LA PISTA "${data.infracciones}", COMO SE INDICÓ EN LA INSTRUCCIÓN 3]
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta antirreglamentaria.

        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños sufridos por mi ${representado}, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} (${montoEnNumeros})${data.hayLesiones ? ', importe que comprende tanto los daños materiales como la reparación por las lesiones padecidas.' : ''}

        ${pruebaDocumental}

        VI. PETITORIO
        Por todo lo expuesto, y considerando que se encuentran acreditados tanto el hecho generador como la extensión de los daños sufridos, SOLICITO:
        1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
        2. Se proceda al pago integral de los daños reclamados.
        3. Se establezca un plazo perentorio para la resolución del presente reclamo.
        4. Se mantenga comunicación fluida durante la tramitación del expediente.
        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
        ---
        **INSTRUCCIONES FINALES:** Tu única respuesta debe ser el texto completo y final de la carta. No incluyas los datos ni estas instrucciones. No agregues la firma.
    `;

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{"role": "user", "content": promptText}]
    };
    const headers = { 'Authorization': `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' };
    const response = await axios.post(url, requestBody, { headers });
    
    const cartaSinFirma = response.data.choices[0].message.content.trim();
    
    // 3. Actualizar la firma con tus datos guardados
    const firma = `
____________________________________
Dra. Camila Florencia Rodríguez García
T° XII F° 383 C.A.Q.
CUIT 27-38843361-8
Zapiola 662, Bernal – Quilmes
garciayasociadosjus@gmail.com`;
    // --- FIN DE MODIFICACIONES ---

    return cartaSinFirma + firma;
}
// ===================================================================
// === FIN DE LA FUNCIÓN DE CARTA MODIFICADA ===
// ===================================================================

app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data.error : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : "Error desconocido" });
    }
});
// --- FIN DE TU CÓDIGO ORIGINAL ---

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor escuchando con la nueva funcionalidad de consulta de expedientes...`);
});
