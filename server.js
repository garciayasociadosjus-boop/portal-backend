require('dotenv').config();
const express = require('express'); // <-- LÍNEA CORREGIDA
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

const openAiApiKey = process.env.OPENAI_API_KEY;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));


// --- INICIO: NUEVO ENDPOINT PARA ASISTENTE JUSTINA IA ("PISO 3") ---
app.post('/api/asistente-justina', async (req, res) => {
    const { conversation, allCases } = req.body;

    const systemPrompt = `
        Eres Justina, la asistente virtual y socia digital proactiva del Estudio Jurídico García & Asociados. Tu usuaria es la Dra. Camila García. Tu tono es profesional, eficiente y servicial.

        Tus capacidades son:
        1.  **Análisis Proactivo de Datos:** Al recibir una lista de casos ("allCases"), tu primera tarea es analizarlos y generar un "Informe de Inteligencia Diario". Debes identificar:
            - Tareas o vencimientos con fecha de hoy.
            - Tareas o vencimientos VENCIDOS.
            - Alertas de plazos críticos (ej: vencimientos importantes en los próximos 7 días).
            - Casos sin actividad reciente (ej: sin tareas nuevas en los últimos 30 días) y sugerir una acción.
            - Patrones o sugerencias estratégicas si detectas algo relevante.
        2.  **Respuesta Conversacional:** Responde a las preguntas de la Dra. García basándote en la conversación previa ("conversation") y el contexto de todos los casos ("allCases").
        3.  **Redacción de Borradores:** Si se te pide "prepara un borrador de escrito para...", genera un texto legal simple y formal basado en la petición.
        4.  **Generación de Resúmenes:** Si se te pide "resume el caso X", extrae las últimas actuaciones y puntos clave de ese caso.
        
        INSTRUCCIONES CLAVE:
        - Sé concisa y ve al grano. Usa listas (bullets) para ser más clara.
        - Si el usuario simplemente saluda o pide el resumen, genera el "Informe de Inteligencia Diario".
        - Basa TODAS tus respuestas exclusivamente en los datos de "allCases" que te proporciona el usuario. No inventes información.
        - Siempre dirígete a la usuaria como "Dra. García".
    `;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `Contexto de casos (clientsData): ${JSON.stringify(allCases)}` },
        ...conversation
    ];

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4-turbo",
            messages: messages,
            temperature: 0.5,
        }, {
            headers: { 'Authorization': `Bearer ${openAiApiKey}` }
        });

        res.json(response.data.choices[0].message);
    } catch (error) {
        console.error("Error en /api/asistente-justina:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocurrió un error al contactar a la IA.' });
    }
});
// --- FIN: NUEVO ENDPOINT PARA ASISTENTE JUSTINA IA ---


// --- SECCIÓN DE AUTENTICACIÓN CON GOOGLE ---
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const driveFileIds = {
    familia: '1qzsiy-WM65zQgfYuIgufd8IBnNpgUSH9',
    siniestros: '11gK8-I6eXT2QEy5ZREebU30zB8c6nsN0'
};


// --- FUNCIÓN PARA BUSCAR DATOS EN DRIVE ---
async function buscarDniEnDrive(dni) {
    let todasLasNotasPublicas = [];
    for (const key in driveFileIds) {
        const fileId = driveFileIds[key];
        try {
            const fileContent = await drive.files.get({ fileId: fileId, alt: 'media' });
            const data = fileContent.data;
            let expedientes = [];
            if (key === 'familia' && Array.isArray(data)) { expedientes = data.filter(cliente => cliente.dni && cliente.dni.toString().trim() === dni.toString().trim()); }
            else if (key === 'siniestros' && Array.isArray(data)) { expedientes = data.filter(siniestro => siniestro.dni && siniestro.dni.toString().trim() === dni.toString().trim()); }
            if (expedientes.length > 0) { expedientes.forEach(exp => { const titulo = `--- Expediente: ${exp.caratula || exp.numeroReclamo || 'General'} ---\n`; const notas = (exp.observaciones || []).filter(obs => obs.texto && obs.texto.trim() !== '').map(obs => `- (Fecha de revisión: ${obs.proximaRevision || 'N/A'}): ${obs.texto}`).join('\n'); if (notas) { todasLasNotasPublicas.push(titulo + notas); } }); }
        } catch (error) { console.error(`Error al leer el archivo ${key} (${fileId}) de Drive:`, error.message); }
    }
    return todasLasNotasPublicas.join('\n\n');
}


// --- RUTA PARA LA CONSULTA DE EXPEDIENTES ---
app.post('/api/consulta-expediente', async (req, res) => {
    const { dni } = req.body;
    if (!dni) { return res.status(400).json({ error: 'El DNI es requerido.' }); }
    try {
        const notasPublicas = await buscarDniEnDrive(dni);
        if (!notasPublicas || notasPublicas.trim() === '') { return res.send("No se encontró información pública para el DNI proporcionado o no hay actuaciones para mostrar. Si cree que es un error, por favor póngase en contacto con el estudio."); }
        const prompt = `
            Eres un asistente legal del estudio "García & Asociados".
            Tu tarea es tomar las siguientes notas internas de un expediente y reescribirlas en un único texto coherente para que el cliente final lo entienda.
            Usa un tono profesional, empático y claro. Evita la jerga legal. Estructura el texto con títulos si hay más de un expediente.
            No inventes información, básate únicamente en las notas proporcionadas.
            Comienza el texto con un saludo cordial como "Estimado/a cliente," y finaliza con "Atentamente, Estudio García & Asociados.".

            Notas internas a procesar:
            ${notasPublicas}
        `;
        const response = await axios.post('https://api.openai.com/v1/chat/completions', { model: "gpt-3.5-turbo", messages: [{"role": "user", "content": prompt}], temperature: 0.5, }, { headers: { 'Authorization': `Bearer ${openAiApiKey}` } });
        res.send(response.data.choices[0].message.content);
    } catch (error) { console.error("Error en /api/consulta-expediente:", error); res.status(500).json({ error: 'Ocurrió un error al procesar su solicitud.' }); }
});


// --- CÓDIGO ORIGINAL PARA GENERAR CARTAS ---
function numeroALetras(num) {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];

    function convertir(n) {
        if (n < 10) return unidades[n];
        if (n < 20) return especiales[n - 10];
        if (n < 100) { const u = n % 10; const d = Math.floor(n / 10); return decenas[d] + (u > 0 ? ' y ' + unidades[u] : ''); }
        if (n < 1000) { const c = Math.floor(n / 100); const resto = n % 100; if (n === 100) return 'cien'; return centenas[c] + (resto > 0 ? ' ' + convertir(resto) : ''); }
        if (n < 1000000) { const miles = Math.floor(n / 1000); const resto = n % 1000; const milesTexto = miles === 1 ? 'mil' : convertir(miles) + ' mil'; return milesTexto + (resto > 0 ? ' ' + convertir(resto) : ''); }
        if (n < 1000000000) { const millones = Math.floor(n / 1000000); const resto = n % 1000000; const millonesTexto = millones === 1 ? 'un millón' : convertir(millones) + ' millones'; return millonesTexto + (resto > 0 ? ' ' + convertir(resto) : ''); }
        return 'número demasiado grande';
    }
    const parteEntera = Math.floor(num);
    return convertir(parteEntera);
}

async function generarCartaConIA(data) {
    if (!openAiApiKey) { throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway."); }
    const url = 'https://api.openai.com/v1/chat/completions';
    const hoy = new Date();
    const fechaActualFormateada = new Date(hoy.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = numeroALetras(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    let conductorInfoParaIA = "El vehículo era conducido por el/la titular.";
    if (data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase()) { conductorInfoParaIA = `El vehículo era conducido por el/la Sr./Sra. ${data.siniestro.conductorNombre}`; if (data.siniestro.conductorDni) { conductorInfoParaIA += `, DNI N° ${data.siniestro.conductorDni}`; } conductorInfoParaIA += "."; }
    let pruebaDocumental = `
V. PRUEBA DOCUMENTAL
Se acompaña en este acto la siguiente documentación respaldatoria:
A. Certificado de cobertura vigente
B. Cédula del vehículo
C. Documento de identidad del asegurado
D. Licencia de conducir del conductor
E. Registro fotográfico de los daños
F. Presupuesto de reparación`;
    if (data.hayLesiones) { pruebaDocumental += `
G. Certificados médicos`; }
    const promptText = `
        Eres un asistente legal experto...`; // Acortado para brevedad
    const requestBody = { model: "gpt-3.5-turbo", messages: [{"role": "user", "content": promptText}] };
    const headers = { 'Authorization': `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' };
    const response = await axios.post(url, requestBody, { headers });
    const cartaSinFirma = response.data.choices[0].message.content.trim();
    const firma = `
____________________________________
Dra. Camila Florencia García
T° XII F° 383 C.A.Q.
CUIT 27-38843361-8
Zapiola 662, Bernal – Quilmes
garciayasociadosjus@gmail.com`;
    return cartaSinFirma + firma;
}

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


app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor escuchando con el nuevo asistente Justina IA...`);
});
