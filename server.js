require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const path = require('path');

// --- INICIO: CONFIGURACIÓN DEFINITIVA CON ARCHIVO TEMPORAL ---
let vertex_ai;
let generativeModel;

try {
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
        throw new Error("La variable de entorno GOOGLE_CREDENTIALS_JSON no fue encontrada.");
    }
    
    // Paso 1: Crear un archivo temporal con las credenciales
    const credentialsContent = process.env.GOOGLE_CREDENTIALS_JSON;
    const tempCredentialsPath = path.join(__dirname, 'temp-credentials.json');
    fs.writeFileSync(tempCredentialsPath, credentialsContent);

    // Paso 2: Apuntar la variable de entorno estándar a ese archivo
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredentialsPath;
    
    // Paso 3: Inicializar VertexAI (ahora encontrará las credenciales automáticamente)
    const credentials = JSON.parse(credentialsContent);
    vertex_ai = new VertexAI({
        project: credentials.project_id,
        location: 'us-central1',
    });

    // Instancia del modelo Gemini
    generativeModel = vertex_ai.preview.getGenerativeModel({
        // LÍNEA CORREGIDA:
        model: 'gemini-pro', 
    });

    console.log("✅ Cliente de Vertex AI (Gemini) inicializado correctamente.");

} catch (error) {
    console.error("🔴 ERROR: No se pudo inicializar el cliente de Vertex AI.", error);
}
// --- FIN: CONFIGURACIÓN DEFINITIVA ---

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '10mb' }));

async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => null));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => null));
    if (promesasDeDescarga.length === 0) return [];
    try {
        const respuestas = await Promise.all(promesasDeDescarga);
        let datosCombinados = [];
        respuestas.filter(Boolean).forEach(response => {
            let data = response.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
            if (!Array.isArray(data)) return;
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
    if (!generativeModel) {
        throw new Error("El cliente de IA no está configurado. Revisa las credenciales de la cuenta de servicio.");
    }

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
        garciayasociadosjus@gmail.com
        ---
        **INSTRUCCIONES FINALES:** Tu respuesta debe ser únicamente el texto completo y final de la carta. No agregues explicaciones.
    `;
    
    const request = {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
    };
    
    const result = await generativeModel.generateContent(request);
    const text = result.response.candidates[0].content.parts[0].text;
    return text.trim();
}


app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error);
        res.status(500).json({ 
            error: 'Error interno del servidor al generar la carta.', 
            detalle: error.message || error.toString() 
        });
    }
});

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getAllClientData();
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());
        if (expedientesEncontrados.length > 0) {
            res.json(expedientesEncontrados);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.', detalle: error.toString() });
    }
});

app.get('/', (req, res) => {
  res.send('El servidor está funcionando!');
});

app.listen(PORT, () => {
  console.log(`✅✅✅ VERSIÓN VERTEX AI - ${new Date().toLocaleString('es-AR')} - Servidor escuchando en el puerto ${PORT}`);
});
