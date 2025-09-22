const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY.");
}

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentamos el límite para los datos de la carta

// --- **NUEVO ENDPOINT PARA GENERAR LA CARTA DE PATROCINIO** ---
app.post('/api/generar-carta', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "El servicio de IA no está disponible." });
    }

    const data = req.body;
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

    const prompt = `
        Sos la Dra. Camila Florencia Rodríguez García, una abogada redactando una carta de patrocinio formal.
        Tu tono debe ser profesional, preciso y legalmente adecuado.
        Utiliza los siguientes datos para completar la carta, siguiendo la estructura del modelo.
        No incluyas corchetes ni placeholders en el texto final. Reemplaza [FECHA ACTUAL] con la fecha de hoy.

        **Datos del Caso:**
        - Lugar y Fecha de Emisión: ${data.lugarEmision}, ${fechaActualFormateada}
        - Destinatario (Aseguradora del tercero): ${data.destinatario.toUpperCase()}
        - Domicilio del Destinatario: ${data.destinatarioDomicilio}
        
        - TU CLIENTE (Asegurado): ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}
        - Póliza de TU CLIENTE: N° ${data.polizaCliente}
        - Aseguradora de TU CLIENTE: ${data.aseguradoraCliente.toUpperCase()}
        
        - Fecha del Siniestro: ${data.fechaSiniestro}
        - Hora del Siniestro: ${data.horaSiniestro} hs.
        - Lugar del Siniestro: ${data.lugarSiniestro}
        - Vehículo de TU CLIENTE: ${data.vehiculoCliente.toUpperCase()}
        
        - TERCERO RESPONSABLE (Asegurado del destinatario): ${data.nombreTercero} ${data.dniTercero ? `(DNI ${data.dniTercero})` : ''}
        
        **Relato y Daños:**
        - Descripción de los hechos (reescribir formalmente): "${data.relato}"
        - Partes dañadas del vehículo de TU CLIENTE: ${data.partesDanadas}
        - Infracciones cometidas por el tercero: "${data.infracciones}"
        - Reclamo por Daños Materiales: $${data.siniestro.presupuesto}
        ${data.hayLesiones ? `- Hubo lesiones descriptas como: "${data.lesionesDesc}"` : ''}
        ${data.hayLesiones ? `- Reclamo adicional por Lesiones: $${data.montoLesiones}` : ''}
        - Monto Total Reclamado: $${data.montoTotal}

        **ESTRUCTURA DE LA CARTA (DEBES SEGUIR ESTE FORMATO):**
        1.  **Encabezado:** Lugar y fecha, Destinatario y Domicilio.
        2.  **I. OBJETO:** Presentación formal en tu carácter de abogada, mencionando a tu cliente y el motivo del reclamo.
        3.  **II. HECHOS:** Redacción formal del relato de los hechos, describiendo cómo, cuándo y dónde ocurrió el siniestro.
        4.  **III. RESPONSABILIDAD:** Explicación clara de por qué la responsabilidad recae en el asegurado del destinatario, basándote en las infracciones.
        5.  **IV. DAÑOS RECLAMADOS:** Detalle del monto total reclamado, especificando que es por los daños materiales (y por lesiones, si aplica).
        6.  **V. PETITORIO:** Enumeración de las solicitudes (tener por presentado el reclamo, solicitar el pago integral, etc.).
        7.  **Cierre:** Saludo final y tus datos completos como abogada.

        **Tus Datos (Firma):**
        Dra. Camila Florencia Rodríguez García
        T° XII F° 383 C.A.Q.
        CUIT 27-38843361-8
        Zapiola 662, Bernal – Quilmes
        garciayasociadosjus@gmail.com
    `;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ generatedLetter: text });
    } catch (error) {
        console.error("Error al generar la carta con la IA:", error);
        res.status(500).json({ error: "No se pudo generar la carta." });
    }
});

// --- Lógica para el portal de expedientes (SIN CAMBIOS) ---
app.get('/api/expediente/:dni', async (req, res) => {
    // ... este código no se toca ...
});

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando con múltiples archivos y generador de cartas!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
