const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrl = process.env.DRIVE_FILE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
// **MEJORA CLAVE A PRUEBA DE FALLOS**
// Solo intentamos iniciar la IA si la clave existe.
if (geminiApiKey) {
    try {
        genAI = new GoogleGenerativeAI(geminiApiKey);
        console.log("Cliente de IA inicializado correctamente.");
    } catch (error) {
        console.error("Error al inicializar el cliente de IA. La IA estará desactivada.", error);
        genAI = null;
    }
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY en Render. La IA estará desactivada.");
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
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray; // Si no hay IA o no hay nada que traducir, devolvemos el original.
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const promesasDeTraduccion = observacionesArray.map(obs => {
            const prompt = `Para el expediente del cliente ${nombreCliente}, reescribí la siguiente anotación en un tono activo y de compromiso, manteniendo la precisión técnica pero con un lenguaje claro. Anotación original: "${obs.texto}"`;
            return model.generateContent(prompt).then(result => {
                return { ...obs, texto: result.response.text().trim() };
            }).catch(error => {
                console.error(`Error en una llamada individual a la IA para la nota: "${obs.texto}"`, error);
                return obs; // Si una falla, devolvemos la original.
            });
        });
        return await Promise.all(promesasDeTraduccion);
    } catch (error) {
        console.error("Error general al procesar con la IA:", error);
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getClientDataFromUrl();
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            for (const exp of expedientesParaCliente) {
                exp.observaciones = await traducirObservacionesConIA(exp.observaciones, exp.nombre);
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
  res.send('¡Servidor funcionando con IA v9 (A prueba de fallos)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
