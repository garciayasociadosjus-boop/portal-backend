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

// La función para obtener datos de Drive no cambia
async function getAllClientData() {
    // ... tu código existente está bien ...
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
    
    // --- INICIO: LÓGICA DEL CONDUCTOR Y PROMPT MEJORADO ---
    const conductorDelHecho = data.siniestro.conductorNombre || data.siniestro.cliente;
    const esConductorDiferente = data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase();

    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados". Tu tarea es redactar el cuerpo de una carta de patrocinio con un tono formal, profesional y preciso, siguiendo estrictamente el modelo y las instrucciones.

        INSTRUCCIONES CLAVE:
        1.  **Relato del Hecho:** No copies textualmente la descripción del siniestro. Debes crear un párrafo narrativo coherente y profesional que integre todos los datos proporcionados. Transforma los datos en un relato legal fluido.
        2.  **Lógica del Conductor:** Esta es la regla más importante. Te proporciono el nombre del cliente y el del conductor.
            - Si la descripción del siniestro menciona que el vehículo estaba "estacionado", redacta el hecho sin mencionar a ningún conductor (ej: "el vehículo de mi mandante se encontraba debidamente estacionado cuando...").
            - Si el conductor y el cliente SON LA MISMA PERSONA, redacta el hecho desde la perspectiva del cliente (ej: "mi representado/a circulaba a bordo de su vehículo..."). NO nombres al conductor.
            - Si el conductor y el cliente SON DIFERENTES PERSONAS (${esConductorDiferente ? 'en este caso lo son' : 'en este caso son el mismo'}), debes aclararlo explícitamente en el relato (ej: "...el vehículo de mi mandante, que en la ocasión era conducido por el/la Sr./Sra. ${conductorDelHecho}, fue embestido...").
        3.  **No repitas información:** El resto del documento ya establece quién es el titular. En la sección "HECHOS", solo enfócate en narrar el evento.

        **DATOS A UTILIZAR:**
        - Cliente (Titular): ${data.siniestro.cliente}
        - Conductor al momento del siniestro: ${conductorDelHecho}
        - Descripción del siniestro (para tu relato): "${data.relato}"
        - Fecha y hora: ${data.fechaSiniestro} a las ${data.horaSiniestro}
        - Lugar: ${data.lugarSiniestro}
        - Vehículo del cliente: ${data.vehiculoCliente}
        
        **SECCIÓN "II. HECHOS" A REDACTAR:**
        ---
        En fecha ${data.fechaSiniestro}, aproximadamente a las ${data.horaSiniestro}, [AQUÍ COMIENZA TU REDACCIÓN DEL RELATO, SIGUIENDO LAS INSTRUCCIONES 1 Y 2. DEBE SER UN PÁRRAFO FLUIDO].
        ---
        **INSTRUCCIONES FINALES:** Tu única respuesta debe ser el párrafo completo y redactado de la sección "II. HECHOS". No incluyas "II. HECHOS", ni los datos, ni ninguna otra sección. Solo el párrafo.
    `;
    // --- FIN: LÓGICA DEL CONDUCTOR Y PROMPT MEJORADO ---
    
    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{"role": "user", "content": promptText}]
    };

    const headers = {
      'Authorization': `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.post(url, requestBody, { headers });
    const relatoGenerado = response.data.choices[0].message.content.trim();

    // --- CONSTRUCCIÓN FINAL DE LA CARTA ---
    const cartaCompleta = `
Lugar y fecha: Bernal, ${fechaActualFormateada}

Destinatario: ${data.destinatario.toUpperCase()}
Domicilio: ${data.destinatarioDomicilio}
S/D

I. OBJETO
Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños materiales sufridos en el vehículo de su propiedad, asegurado bajo la póliza N° ${data.polizaCliente} de ${data.aseguradoraCliente.toUpperCase()}, como consecuencia del siniestro vial que se detalla a continuación.

II. HECHOS
${relatoGenerado}
Descripción del impacto: El impacto se produjo en las siguientes partes del vehículo de mi cliente: ${data.partesDanadas}.
Como consecuencia directa del referido evento, el vehículo de mi representado/a sufrió los daños materiales cuya reparación constituye el objeto del presente reclamo.

III. RESPONSABILIDAD
La responsabilidad del siniestro recae exclusivamente en el conductor del vehículo de su asegurado/a, quien:
- ${data.infracciones}
- Incumplió el deber de prudencia y diligencia en la conducción.
- Causó el daño por su conducta antirreglamentaria.

IV. DAÑOS RECLAMADOS
Se reclama el valor total de los daños materiales sufridos por el vehículo de mi mandante, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} (${montoEnNumeros}).

V. PRUEBA DOCUMENTAL
Se acompaña la siguiente documentación: Cédula del vehículo, DNI, Licencia de conducir, Presupuesto de reparación y Fotografías de los daños.

VI. PETITORIO
Por todo lo expuesto, y considerando que se encuentran acreditados tanto el hecho generador como la extensión de los daños sufridos, SOLICITO:
1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
2. Se proceda al pago integral de los daños reclamados en un plazo de diez (10) días.
3. Se mantenga comunicación fluida.

Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
____________________________________
Dra. Camila Florencia García
T° XII F° 383 C.A.Q. – T° 140 F° 85 C.P.A.C.F.
CUIT 27-38843361-8
Zapiola 662, Bernal – Quilmes
garciayasociadosjus@gmail.com
    `;

    return cartaCompleta.trim();
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

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor OpenAI (lógica conductor final) escuchando...`);
});
