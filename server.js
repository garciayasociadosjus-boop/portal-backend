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
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La función de IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

// FUNCIÓN SIMPLIFICADA: Siempre busca los datos en Drive.
async function getClientDataFromUrl() {
    console.log("Obteniendo datos frescos de Drive (sin caché)...");
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');
    
    try {
        const response = await axios.get(driveFileUrl);
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        console.log(`Datos cargados desde Drive. Total de clientes: ${data.length}`);
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
        const promesasDeTraduccion = observacionesArray.map(obs => {
            const prompt = `El cliente se llama ${nombreCliente}. Reescribí la siguiente anotación de su expediente judicial para que sea clara, empática y profesional, sin usar jerga legal compleja. La anotación es: "${obs.texto}"`;
            return model.generateContent(prompt).then(result => {
                return { ...obs, texto: result.response.text() };
            }).catch(error => {
                console.error("Error en una llamada individual a la IA:", error);
                return obs;
            });
        });
        const observacionesTraducidas = await Promise.all(promesasDeTraduccion);
        return observacionesTraducidas;
    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        // Ahora llama a la función sin caché directamente.
        const clientsData = await getClientDataFromUrl();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

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
  res.send('¡Servidor funcionando con IA v3 (sin caché)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
