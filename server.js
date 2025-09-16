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
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La función de IA estará desactivada.");
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

async function traducirObservacionesConIA(observacionesArray) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return null;
    }

    try {
        const historialTexto = observacionesArray
            .sort((a, b) => (b.proximaRevision || '').localeCompare(a.proximaRevision || ''))
            .map(o => `- ${o.texto}`)
            .join('\n');

        // --- ESTE ES EL ÚNICO CAMBIO ---
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Usamos el modelo nuevo y rápido

        const prompt = `Sos un asistente legal escribiendo un resumen del estado de un caso para un cliente. Tu tono debe ser profesional, claro y empático, evitando la jerga legal compleja. Reescribí las siguientes anotaciones internas de un expediente judicial en un único párrafo coherente y fácil de entender para una persona sin conocimientos legales. Aquí están las notas:\n\n${historialTexto}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textoTraducido = response.text();

        return [{ 
            texto: textoTraducido, 
            proximaRevision: new Date().toISOString().split('T')[0] 
        }];
    } catch (error) {
        console.error("Error al contactar la IA:", error);
        return null;
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
                const observacionesTraducidas = await traducirObservacionesConIA(exp.observaciones);
                if (observacionesTraducidas) {
                    exp.observaciones = observacionesTraducidas;
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
  res.send('¡Servidor funcionando con IA v2 (modelo corregido)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
