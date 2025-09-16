const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrl = process.env.DRIVE_FILE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Inicializa el cliente de IA solo si tenemos la clave
let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
} else {
    console.log("Advertencia: No se encontró la GEMINI_API_KEY. La función de IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

async function getClientDataFromUrl() {
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');
    try {
        const response = await axios.get(driveFileUrl);
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data;
    } catch (error) {
        console.error('Error al descargar o parsear el archivo:', error.message);
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

async function traducirHistorialConIA(historial) {
    if (!genAI) return historial; // Si no hay IA, devolvemos el original

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `Sos un asistente legal escribiendo un resumen del estado de un caso para un cliente. Tu tono debe ser profesional, claro y empático, evitando la jerga legal compleja. Reescribí las siguientes anotaciones internas de un expediente judicial en un único párrafo coherente y fácil de entender para una persona sin conocimientos legales. Aquí están las notas, ordenadas por fecha:\n\n${historial}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Devolvemos el texto procesado en el mismo formato que el original
        return [{ texto: text, proximaRevision: new Date().toISOString().split('T')[0] }];
    } catch (error) {
        console.error("Error al contactar la IA:", error);
        return historial; // Si la IA falla, devolvemos el original
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getClientDataFromUrl();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            // Procesamos cada expediente encontrado con la IA
            for (const exp of expedientesEncontrados) {
                if (exp.observaciones && exp.observaciones.length > 0) {
                    const historialOriginal = exp.observaciones
                        .map(o => `El día ${o.proximaRevision || o.fecha}, la anotación fue: ${o.texto}`)
                        .join('\n');

                    exp.observaciones = await traducirHistorialConIA(historialOriginal);
                }
            }
            res.json(expedientesEncontrados);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.', detalle: error.toString() });
    }
});

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando con el método de enlace público v2 e IA!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
