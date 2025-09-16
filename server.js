const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrl = process.env.DRIVE_FILE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

async function getClientDataFromUrl() {
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');
    try {
        const response = await axios.get(driveFileUrl, { responseType: 'json' });
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data;
    } catch (error) {
        console.error('Error al descargar o parsear el archivo:', error.message);
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const historialParaIA = observacionesArray.map(obs => {
            return `FECHA: "${obs.fecha}"\nANOTACION ORIGINAL: "${obs.texto}"`;
        }).join('\n---\n');

        const prompt = `
            Sos un asistente legal para el estudio García & Asociados. El cliente se llama ${nombreCliente}.
            A continuación, te proporciono una lista de anotaciones internas de su expediente.
            Tu tarea es reescribir CADA anotación para que sea clara, empática y profesional, en un tono activo y de compromiso, sin usar jerga legal compleja pero manteniendo la precisión técnica.
            Debes devolver tu respuesta EXCLUSIVAMENTE como un array de objetos JSON válido. Cada objeto debe tener dos claves: "fecha" y "texto". Mantené la fecha original de cada anotación.
            No agregues comentarios, explicaciones, ni texto introductorio. Solo el array JSON.

            Aquí están las anotaciones:
            ---
            ${historialParaIA}
            ---
        `;

        const result = await model.generateContent(prompt);
        const textoRespuesta = result.response.text().trim();

        const textoJsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '');
        const observacionesTraducidas = JSON.parse(textoJsonLimpio);

        if(Array.isArray(observacionesTraducidas)) {
            return observacionesTraducidas;
        } else {
            return observacionesArray;
        }

    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getClientDataFromUrl();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));

            for (const exp of expedientesParaCliente) {
                 if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const observacionesVisibles = exp.observaciones.filter(o => o.fecha);
                    exp.observaciones = await traducirObservacionesConIA(observacionesVisibles, exp.nombre);
                }
            }
            res.json(expedientesParaCliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.', detalle: error.toString() });
    }
});

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando con IA v11 (Final y Optimizado)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
