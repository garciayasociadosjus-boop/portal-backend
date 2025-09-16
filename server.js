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

// Esta función ahora devuelve un NUEVO ARRAY o NULL si falla
async function traducirObservacionesConIA(observacionesArray) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return null; // Si no hay IA o no hay nada que traducir, no hacemos nada
    }

    try {
        // 1. Formateamos las notas originales para que la IA las entienda
        const historialTexto = observacionesArray
            .sort((a, b) => (b.proximaRevision || '').localeCompare(a.proximaRevision || ''))
            .map(o => `- ${o.texto}`)
            .join('\n');

        // 2. Creamos el prompt (la orden) para la IA
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `Sos un asistente legal escribiendo un resumen del estado de un caso para un cliente. Tu tono debe ser profesional, claro y empático, evitando la jerga legal compleja. Reescribí las siguientes anotaciones internas de un expediente judicial en un único párrafo coherente y fácil de entender para una persona sin conocimientos legales. Aquí están las notas:\n\n${historialTexto}`;

        // 3. Generamos el nuevo texto
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textoTraducido = response.text();

        // 4. Devolvemos una nueva lista de observaciones con un solo item: el resumen.
        return [{ 
            texto: textoTraducido, 
            proximaRevision: new Date().toISOString().split('T')[0] 
        }];
    } catch (error) {
        console.error("Error al contactar la IA:", error);
        return null; // Si la IA falla, devolvemos null
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getClientDataFromUrl();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            // Hacemos una copia para no modificar los datos originales
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));

            for (const exp of expedientesParaCliente) {
                const observacionesTraducidas = await traducirObservacionesConIA(exp.observaciones);
                if (observacionesTraducidas) {
                    // Si la IA funcionó, reemplazamos las observaciones por la versión traducida
                    exp.observaciones = observacionesTraducidas;
                }
                // Si la IA falló (y devolvió null), no hacemos nada y se envían las originales
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
  res.send('¡Servidor funcionando con IA a prueba de fallos!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
