require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const geminiApiKey = process.env.GEMINI_API_KEY;
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("✅ Cliente de IA inicializado correctamente.");
} else {
    console.log("🔴 ADVERTENCIA: No se encontró la GEMINI_API_KEY en las variables de entorno.");
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => null));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => null));

    if (promesasDeDescarga.length === 0) {
        console.log("No hay URLs de Drive configuradas en las variables de entorno.");
        return [];
    }
    try {
        const respuestas = await Promise.all(promesasDeDescarga);
        let datosCombinados = [];
        respuestas.filter(Boolean).forEach(response => {
            let data = response.data;
            if (typeof data === 'string') data = JSON.parse(data);
            const datosNormalizados = data.map(item => {
                if (item.cliente && !item.nombre) item.nombre = item.cliente;
                if (item.contra && !item.caratula) item.caratula = `Siniestro c/ ${item.contra}`;
                return item;
            });
            datosCombinados = [...datosCombinados, ...datosNormalizados];
        });
        return datosCombinados;
    } catch (error) {
        throw new Error('No se pudo procesar uno de los archivos de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const historialParaIA = observacionesArray.map(obs => `FECHA: "${obs.fecha}"\nANOTACION ORIGINAL: "${obs.texto}"`).join('\n---\n');
        const prompt = `Sos un asistente legal para el estudio García & Asociados. El cliente se llama ${nombreCliente}. Reescribe CADA anotación para que sea clara y profesional. Glosario: SCBA (Suprema Corte), MEV (Mesa Virtual), A despacho (Juez trabajando). Devuelve solo un array JSON con claves "fecha" y "texto".\n---\n${historialParaIA}`;
        const result = await model.generateContent(prompt);
        const textoRespuesta = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const observacionesTraducidas = JSON.parse(textoRespuesta);
        return (Array.isArray(observacionesTraducidas) && observacionesTraducidas.length === observacionesArray.length) ? observacionesTraducidas : observacionesArray;
    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray;
    }
}

async function generarCartaConIA(data) {
    if (!genAI) {
        throw new Error("El cliente de IA no está inicializado.");
    }
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const prompt = `Eres un asistente legal experto... (El prompt de la carta sigue igual)`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
}

app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.toString() });
    }
});

// --- **SECCIÓN CORREGIDA PARA LOS EXPEDIENTES** ---
app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getAllClientData();
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            // Este bloque de código faltaba: ahora sí pasa las observaciones por la IA
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            for (const exp of expedientesParaCliente) {
                if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const observacionesVisibles = exp.observaciones.filter(o => o.fecha && o.texto && !o.texto.trim().startsWith('//'));
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
// --- **FIN DE LA SECCIÓN CORREGIDA** ---

app.get('/', (req, res) => {
  res.send('¡El servidor en Render está funcionando!');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
