const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Clave API insertada directamente ---
const geminiApiKey = "AIzaSyDk-brL7jGmrojXhNwbdv7uL4ZWZQwXNVo";

let genAI;
if (geminiApiKey && geminiApiKey !== "AQUÍ_PEGA_TU_CLAVE_API") {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("✅ Cliente de IA inicializado correctamente.");
} else {
    console.log("🔴 ADVERTENCIA: No se encontró la GEMINI_API_KEY. La IA estará desactivada.");
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- **LÓGICA RESTAURADA PARA BUSCAR EXPEDIENTES** ---
async function getAllClientData() {
    const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
    const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;
    const promesasDeDescarga = [];

    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => { console.error("Error al descargar archivo de Familia:", e.message); return null; }));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => { console.error("Error al descargar archivo de Siniestros:", e.message); return null; }));

    if (promesasDeDescarga.length === 0) {
        console.log("Usando datos de ejemplo porque no hay URLs de Drive configuradas.");
        return [
            { cliente: "Juan Perez (Ejemplo)", nombre: "Juan Perez (Ejemplo)", dni: "12345678", caratula: "Expediente de Familia", observaciones: [{fecha: "2024-01-01", texto: "Caso de ejemplo para búsqueda."}] },
            { cliente: "Maria Gomez (Ejemplo)", nombre: "Maria Gomez (Ejemplo)", dni: "87654321", caratula: "Siniestro c/ La Perseverancia", observaciones: [{fecha: "2024-01-02", texto: "Otro caso de ejemplo para búsqueda."}] }
        ];
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
    const numeroALetras = (num) => `PESOS ${new Intl.NumberFormat('es-AR').format(num)}`;
    const montoEnLetras = numeroALetras(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);

    // --- **NUEVA LÓGICA DE FECHA** ---
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

    const prompt = `
        Eres un asistente legal experto del estudio "García & Asociados", especializado en la redacción de cartas de patrocinio para reclamos de siniestros viales en Argentina. Tu tono debe ser formal, preciso y profesional.
        **FECHA DE HOY PARA LA CARTA:** ${fechaActualFormateada}. Debes usar esta fecha exacta en el encabezado.

        **DATOS DEL CASO:**
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
        - **Relato de los hechos (versión del cliente):** "${data.relato}"
        - **Infracciones cometidas por el tercero:** "${data.infracciones}"
        - **Daños materiales en vehículo del cliente:** "${data.partesDanadas}"
        - **¿Hubo Lesiones?:** ${data.hayLesiones ? 'Sí' : 'No'}
        ${data.hayLesiones ? `- Descripción de las lesiones: "${data.lesionesDesc}"` : ''}
        - **Monto Total Reclamado:** ${montoEnLetras} (${montoEnNumeros})

        **MODELO DE CARTA A SEGUIR (USA ESTA ESTRUCTURA):**
        ---
        Lugar y fecha: ${data.lugarEmision}, ${fechaActualFormateada}

        Destinatario: [COMPAÑÍA ASEGURADORA DEL TERCERO]
        Domicilio: [Domicilio de la compañía]
        S/D
        
        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. [NOMBRE Y APELLIDO DEL CLIENTE], DNI N° [DNI DEL CLIENTE], vengo a formular RECLAMO FORMAL por los daños y perjuicios sufridos como consecuencia del siniestro vial que se detalla a continuación.
        
        II. HECHOS
        En fecha [FECHA COMPLETA DEL SINIESTRO], aproximadamente a las [HORA] hs., mi representado/a circulaba a bordo de su vehículo [VEHÍCULO DEL CLIENTE], por [LUGAR DEL SINIESTRO], respetando las normas de tránsito. De manera imprevista, el rodado conducido por el/la Sr./Sra. ${data.nombreTercero} embistió el vehículo de mi mandante. [AQUÍ, REDACTA UN PÁRRAFO FORMAL BASADO EN EL "Relato de los hechos"]. El impacto se produjo en la parte ${data.partesDanadas} del vehículo de mi cliente. ${data.hayLesiones ? 'Como resultado, mi cliente sufrió: ' + data.lesionesDesc + '.' : ''}
        
        III. RESPONSABILIDAD
        La responsabilidad recae en su asegurado/a, quien incurrió en: - [USA LAS "Infracciones cometidas por el tercero" PARA LISTARLAS AQUÍ]. - Incumplió el deber de prudencia.
        
        IV. DAÑOS RECLAMADOS
        Se reclama la suma de ${montoEnLetras.toUpperCase()} (${montoEnNumeros}).
        
        V. PETITORIO
        SOLICITO: 1. Se tenga por presentado el reclamo. 2. Se proceda al pago integral en un plazo de diez (10) días hábiles. 3. Se mantenga comunicación fluida.
        
        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
        
        ____________________________________
        Dra. Camila Florencia Rodríguez García
        T° XII F° 383 C.A.Q.
        CUIT 27-38843361-8
        Zapiola 662, Bernal – Quilmes
        ---
        **INSTRUCCIONES FINALES:** Tu respuesta debe ser únicamente el texto completo y final de la carta. No agregues explicaciones.
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
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());
        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            for (const exp of expedientesParaCliente) {
                 if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const observacionesVisibles = exp.observaciones.filter(o => o.fecha && !o.texto.trim().startsWith('//'));
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
  res.send('¡Servidor funcionando!');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
