require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Leemos la clave de API de OpenAI
const openAiApiKey = process.env.OPENAI_API_KEY;
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// La función getAllClientData no se modifica
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
    if (!openAiApiKey) {
        throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway.");
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = new Intl.NumberFormat('es-AR').format(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    
    // --- INICIO: LÓGICA REFINADA DEL CONDUCTOR ---
    let conductorInfoParaIA = "El vehículo era conducido por el/la titular.";
    if (data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase()) {
        conductorInfoParaIA = `El vehículo era conducido por el/la Sr./Sra. ${data.siniestro.conductorNombre}, quien no es el/la titular.`;
    }
    // --- FIN: LÓGICA REFINADA DEL CONDUCTOR ---

    // --- INICIO: LÓGICA PARA PRUEBA DOCUMENTAL ---
    let pruebaDocumental = `
V. PRUEBA DOCUMENTAL
Se acompaña en este acto la siguiente documentación respaldatoria:
A. Certificado de cobertura vigente
B. Cédula del vehículo
C. Documento de identidad del asegurado
D. Licencia de conducir del conductor
E. Registro fotográfico de los daños
F. Presupuesto de reparación`;

    if (data.hayLesiones) {
        pruebaDocumental += `
G. Certificados médicos`;
    }
    // --- FIN: LÓGICA PARA PRUEBA DOCUMENTAL ---

    // --- INICIO: PROMPT FINAL Y DETALLADO ---
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados". Tu tarea es redactar una carta de patrocinio con un tono formal, profesional y preciso, siguiendo estrictamente el modelo y las instrucciones.

        INSTRUCCIONES CLAVE:
        1.  **Relato del Hecho:** No copies la descripción del siniestro. Debes crear un párrafo narrativo coherente y profesional que integre la información del conductor y la descripción del hecho. Por ejemplo, si la descripción dice "estaba estacionado y me chocaron de atrás", el relato debe ser algo como "En dichas circunstancias, el vehículo de mi mandante se encontraba debidamente estacionado cuando fue embestido en su sector trasero por el rodado de su asegurado...". Sé inteligente al transformar los datos en un relato legal.
        2.  **Información del Conductor:** Te proporciono un dato clave: "${conductorInfoParaIA}". Debes integrar esta información de forma natural en el relato de los hechos (sección II), solo si el conductor no es el titular. Si es el titular, puedes omitir la mención explícita o integrarla si queda natural.
        3.  **Monto:** El monto reclamado debe tener el formato exacto: "PESOS [MONTO EN LETRAS] ($ [MONTO EN NÚMEROS])".
        4.  **Estructura:** La carta debe seguir la estructura de las secciones (I a VI) sin alterarla. Las secciones V y VI deben ser copiadas textualmente.

        **DATOS A UTILIZAR:**
        - Fecha de Hoy: ${fechaActualFormateada}
        - Datos del Cliente: ${data.siniestro.cliente}, DNI ${data.siniestro.dni}, Póliza N° ${data.polizaCliente} de ${data.aseguradoraCliente}.
        - Datos del Siniestro: Ocurrido el ${data.fechaSiniestro} a las ${data.horaSiniestro} en ${data.lugarSiniestro}.
        - Descripción del Siniestro (para tu relato): "${data.relato}"
        - Vehículo del Cliente: ${data.vehiculoCliente}.
        - Partes Dañadas: ${data.partesDanadas}.
        - Datos del Tercero: Conductor del vehículo asegurado por ${data.destinatario}.
        - Infracciones del Tercero: ${data.infracciones}.
        - Monto en Letras: ${montoEnLetras}
        - Monto en Números: ${montoEnNumeros}
        - Destinatario: ${data.destinatario}, con domicilio en ${data.destinatarioDomicilio}.

        **CARTA A GENERAR (sigue esta estructura):**
        ---
        Lugar y fecha: Bernal, ${fechaActualFormateada}

        Destinatario: ${data.destinatario.toUpperCase()}
        Domicilio: ${data.destinatarioDomicilio}
        S/D

        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños materiales sufridos en el vehículo de su propiedad, asegurado bajo la póliza N° ${data.polizaCliente} de ${data.aseguradoraCliente.toUpperCase()}, como consecuencia del siniestro vial que se detalla a continuación.

        II. HECHOS
        [AQUÍ CONSTRUYE EL RELATO COHERENTE COMO SE TE INDICÓ EN LAS INSTRUCCIONES 1 Y 2]
        El impacto se produjo en las siguientes partes del vehículo de mi cliente: ${data.partesDanadas}.
        Como consecuencia directa del referido evento, el vehículo de mi representado/a sufrió los daños materiales cuya reparación constituye el objeto del presente reclamo.

        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor del vehículo de su asegurado/a, quien incurrió en las siguientes faltas:
        - ${data.infracciones}
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta antirreglamentaria.

        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños materiales sufridos por el vehículo de mi mandante, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} (${montoEnNumeros}).

        ${pruebaDocumental}

        VI. PETITORIO
        Por todo lo expuesto, y considerando que se encuentran acreditados tanto el hecho generador como la extensión de los daños sufridos, SOLICITO:
        1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
        2. Se proceda al pago integral de los daños reclamados.
        3. Se establezca un plazo perentorio para la resolución del presente reclamo.
        4. Se mantenga comunicación fluida durante la tramitación del expediente.

        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
        ---
        **INSTRUCCIONES FINALES:** Tu única respuesta debe ser el texto completo y final de la carta. No incluyas los datos ni estas instrucciones. No agregues la firma.
    `;
    // --- FIN: PROMPT FINAL Y DETALLADO ---

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{"role": "user", "content": promptText}]
    };

    const headers = {
      'Authorization': `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.post(url, requestBody, { headers });
    
    const cartaSinFirma = response.data.choices[0].message.content.trim();
    const firma = `
____________________________________
Dra. Camila Florencia Rodríguez García
T° XII F° 383 C.A.Q.
CUIT 27-38843361-8
Zapiola 662, Bernal – Quilmes
garciayasociadosjus@gmail.com`;

    return cartaSinFirma + firma;
}


app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data.error : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : "Error desconocido" });
    }
});

// El resto de tus rutas no se modifica
app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor OpenAI (prompt final) escuchando...`);
});
