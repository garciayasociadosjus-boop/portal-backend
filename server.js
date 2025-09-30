require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

const geminiApiKey = process.env.GEMINI_API_KEY;
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

if (!geminiApiKey) {
    console.log("🔴 ADVERTENCIA: No se encontró la GEMINI_API_KEY en las variables de entorno.");
}

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '10mb' }));

// --- CÓDIGO NORMAL DE LA APLICACIÓN (SIN CAMBIOS) ---
async function getAllClientData() {
    // ... tu función existente
}
async function generarCartaConIA(data) {
    if (!geminiApiKey) {
        throw new Error("Falta la API Key.");
    }
    const modelName = 'text-bison-001';
    const url = `https://generativelanguage.googleapis.com/v1beta2/models/${modelName}:generateText?key=${geminiApiKey}`;
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = new Intl.NumberFormat('es-AR').format(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados", especializado en la redacción de cartas de patrocinio para reclamos de siniestros viales en Argentina. Tu tono debe ser formal, preciso y profesional.
        Usa la fecha de hoy que te proporciono para el encabezado.
        Redacta la carta completando el siguiente modelo con los datos proporcionados. Expande el relato de los hechos de forma profesional.

        **FECHA DE HOY PARA LA CARTA:** ${fechaActualFormateada}
        **DATOS DEL CASO A UTILIZAR:**
        - Lugar de Emisión: ${data.lugarEmision}
        - Destinatario (Aseguradora del Tercero): ${data.destinatario.toUpperCase()}
        - Domicilio del Destinatario: ${data.destinatarioDomicilio}
        - Cliente del Estudio (Tu mandante): ${data.siniestro.cliente.toUpperCase()}
        - DNI del Cliente: ${data.siniestro.dni}
        - N° de Póliza del Cliente: ${data.polizaCliente}
        - Aseguradora del Cliente: ${data.aseguradoraCliente.toUpperCase()}
        - Fecha del Siniestro: ${data.fechaSiniestro}
        - Hora del Siniestro: ${data.horaSiniestro}
        - Lugar del Siniestro: ${data.lugarSiniestro}
        - Vehículo del Cliente: ${data.vehiculoCliente.toUpperCase()}
        - Nombre del Tercero (conductor responsable): ${data.nombreTercero}
        - DNI del Tercero: ${data.dniTercero || 'No informado'}
        - Relato de los hechos (versión del cliente): "${data.relato}"
        - Infracciones cometidas por el tercero: "${data.infracciones}"
        - Daños materiales en vehículo del cliente: "${data.partesDanadas}"
        - ¿Hubo Lesiones?: ${data.hayLesiones ? 'Sí' : 'No'}
        - Descripción de las lesiones: "${data.hayLesiones ? data.lesionesDesc : 'No aplica'}"
        - Monto Total Reclamado: PESOS ${montoEnLetras} (${montoEnNumeros})

        **MODELO DE CARTA A COMPLETAR:**
        ---
        Lugar y fecha: ${data.lugarEmision}, ${fechaActualFormateada}

        Destinatario: ${data.destinatario.toUpperCase()}
        Domicilio: ${data.destinatarioDomicilio}
        S/D

        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños y perjuicios sufridos como consecuencia del siniestro vial que se detalla a continuación.

        II. HECHOS
        En fecha ${data.fechaSiniestro}, aproximadamente a las ${data.horaSiniestro} hs., mi representado/a circulaba a bordo de su vehículo ${data.vehiculoCliente.toUpperCase()}, por ${data.lugarSiniestro}, respetando las normas de tránsito vigentes. De manera imprevista y antirreglementaria, el rodado conducido por el/la Sr./Sra. ${data.nombreTercero} embistió el vehículo de mi mandante. [AQUÍ, REDACTA UN PÁRRAFO COHERENTE Y PROFESIONAL BASADO EN EL "Relato de los hechos" PROPORCIONADO POR EL CLIENTE]. El impacto se produjo en la parte ${data.partesDanadas} del vehículo de mi cliente. ${data.hayLesiones ? 'Como resultado del impacto, mi cliente sufrió las siguientes lesiones: ' + data.lesionesDesc + '.' : ''}

        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor de su asegurado/a, quien incurrió en graves faltas a la Ley de Tránsito, entre ellas:
        - ${data.infracciones}.
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta negligente y antirreglamentaria.

        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños y perjuicios sufridos por mi mandante, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} (${montoEnNumeros}), importe que comprende tanto los daños materiales del rodado ${data.hayLesiones ? 'como la reparación integral por las lesiones padecidas.' : '.'}

        V. PETITORIO
        Por todo lo expuesto, SOLICITO:
        1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
        2. Se proceda al pago integral de los daños reclamados en un plazo perentorio de diez (10) días hábiles.
        3. Se mantenga comunicación fluida durante la tramitación del expediente.

        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.


        ____________________________________
        Dra. Camila Florencia Rodríguez García
        T° XII F° 383 C.A.Q.
        CUIT 27-38843361-8
        Zapiola 662, Bernal – Quilmes
        
        ---

        **INSTRUCCIONES FINALES:** Tu respuesta debe ser únicamente el texto completo y final de la carta. No agregues explicaciones.
    `;
    const requestBody = { prompt: { text: promptText } };
    const response = await axios.post(url, requestBody);
    return response.data.candidates[0].output.trim();
}

app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : error.toString() });
    }
});

app.get('/api/expediente/:dni', async (req, res) => {
    // ... tu función existente
});

app.get('/', (req, res) => {
  res.send('¡El servidor está funcionando!');
});


// --- RUTA DE DIAGNÓSTICO TEMPORAL ---
app.get('/debug-vars', (req, res) => {
    const geminiKey = process.env.GEMINI_API_KEY || "NO ENCONTRADA";
    const driveUrl = process.env.DRIVE_FILE_URL || "NO ENCONTRADA";
    const siniestrosUrl = process.env.DRIVE_FILE_URL_SINIESTROS || "NO ENCONTRADA";

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
        `--- Verificación de Variables de Entorno ---\n\n` +
        `1. GEMINI_API_KEY:\n` +
        `   - ¿Existe?: ${process.env.GEMINI_API_KEY ? 'Sí' : 'No'}\n` +
        `   - Primeros 8 caracteres: ${geminiKey.substring(0, 8)}\n` +
        `   - Últimos 8 caracteres: ${geminiKey.substring(geminiKey.length - 8)}\n\n` +
        `2. DRIVE_FILE_URL:\n` +
        `   - Valor: ${driveUrl}\n\n` +
        `3. DRIVE_FILE_URL_SINIESTROS:\n` +
        `   - Valor: ${siniestrosUrl}\n`
    );
});
// --- FIN DE LA RUTA DE DIAGNÓSTICO ---

app.listen(PORT, () => {
  console.log(`✅✅✅ VERSIÓN PaLM - ${new Date().toLocaleString('es-AR')} - Servidor escuchando en el puerto ${PORT}`);
});
