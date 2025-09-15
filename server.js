const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const CREDENTIALS_PATH = '/etc/secrets/google-credentials.json';
const DATA_FILE_NAME = 'datos_planilla_juridica.json';

// Middleware
app.use(cors());
app.use(express.json());

// Variable global para guardar los datos en memoria
let cachedClientData = null;
let lastFetchTime = 0;

// Función para autenticarse y crear un cliente de Google Drive
async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
}

// Función para buscar y descargar el archivo JSON de Drive
async function getClientDataFromDrive(drive) {
    try {
        const res = await drive.files.list({
            q: `name='${DATA_FILE_NAME}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        const files = res.data.files;
        if (files.length === 0) {
            console.log('No se encontró el archivo de datos.');
            throw new Error('Data file not found');
        }

        const fileId = files[0].id;
        const fileRes = await drive.files.get({ fileId: fileId, alt: 'media' });
        return JSON.parse(fileRes.data);

    } catch (error) {
        console.error('Error al obtener datos de Drive:', error);
        throw new Error('Could not retrieve data from Google Drive');
    }
}

// Ruta principal de la API para obtener un expediente por DNI
app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    const currentTime = Date.now();

    try {
        // Usar caché si los datos tienen menos de 5 minutos
        if (!cachedClientData || (currentTime - lastFetchTime > 300000)) {
            console.log('Cache expirada o vacía. Obteniendo datos frescos de Drive...');
            const drive = await getDriveClient();
            cachedClientData = await getClientDataFromDrive(drive);
            lastFetchTime = currentTime;
            console.log(`Datos cargados y cacheados. Total de clientes: ${cachedClientData.length}`);
        } else {
            console.log('Usando datos cacheados.');
        }

        const cliente = cachedClientData.find(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (cliente) {
            res.json(cliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.' });
    }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Servidor del portal de clientes funcionando con el código real!');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
