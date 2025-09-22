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
    console.log("🔴 ADVERTENCIA: No se encontró la GEMINI_API_KEY.");
}

// --- **LA ÚNICA CORRECCIÓN CLAVE ESTÁ AQUÍ** ---
// Le decimos al servidor que confíe explícitamente en tu página de GitHub.
app.use(cors({
  origin: 'https://garciayasociadosjus-boop.github.io' 
}));
// -------------------------------------------------

app.use(express.json({ limit: '10mb' }));

async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => null));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => null));

    if (promesasDeDescarga.length === 0) {
        console.log("No hay URLs de Drive configuradas.");
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

async function generarCartaConIA(data) {
    if (!genAI) {
        throw new Error("El cliente de IA no está inicializado.");
    }
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

    const prompt = `
        Eres un asistente legal experto del estudio "García & Asociados". Redacta una carta de patrocinio formal para un siniestro vial en Argentina. Usa ESTRICTAMENTE la siguiente estructura y datos.
        **FECHA DE HOY PARA LA CARTA:** ${fechaActualFormateada}. Debes usar esta fecha exacta en el encabezado.
        **DATOS DEL CASO:**
        - Lugar de Emisión: ${data.lugarEmision}
        - Destinatario (Aseguradora del Tercero): ${data.destinatario.toUpperCase()}
        - Cliente del Estudio (Tu mandante): ${data.siniestro.cliente.toUpperCase()}
        - ... (resto de los datos del siniestro)
        **MODELO DE CARTA A SEGUIR:**
        ---
        Lugar y fecha: ${data.lugarEmision}, ${fechaActualFormateada}
        ... (resto del modelo de la carta) ...
        ---
        **INSTRUCCIONES FINALES:** Tu respuesta debe ser únicamente el texto completo y final de la carta.
    `;
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

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getAllClientData();
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());
        if (expedientesEncontrados.length > 0) {
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

app.get('/', (req, res) => {
  res.send('¡El servidor en Render está funcionando!');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
