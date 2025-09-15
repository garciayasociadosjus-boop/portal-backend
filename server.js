const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;
const CREDENTIALS_PATH = '/etc/secrets/google-credentials.json';
const DATA_FILE_NAME = 'datos_planilla_juridica.json';

app.use(cors());
app.use(express.json());

let cachedClientData = null;
let lastFetchTime = 0;

async function getDriveClient() {
    console.log('Iniciando getDriveClient...');
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    console.log('Credenciales leídas y parseadas correctamente.');

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const authClient = await auth.getClient();
    console.log('Cliente de autenticación de Google creado.');
    return google.drive({ version: 'v3', auth: authClient });
}

async function getClientDataFromDrive(drive) {
    console.log('Buscando archivo en Drive...');
    const res = await drive.files.list({
        q: `name='${DATA_FILE_NAME}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });
    console.log('Respuesta de la API de Drive recibida.');

    const files = res.data.files;
    if (files.length === 0) {
        throw new Error('No se encontró el archivo datos_planilla_juridica.json en Google Drive. Asegúrate de que exista y esté compartido con el email de la cuenta de servicio.');
    }

    const fileId = files[0].id;
    console.log(`Archivo encontrado con ID: ${fileId}. Descargando contenido...`);
    const fileRes = await drive.files.get({ fileId: fileId, alt: 'media' });
    console.log('Contenido del archivo descargado.');
    return JSON.parse(fileRes.data);
}

app.get('/api/expediente/:dni', async (req, res) => {
    try {
        console.log('Recibida solicitud para DNI:', req.params.dni);
        const drive = await getDriveClient();
        const data = await getClientDataFromDrive(drive);

        const cliente = data.find(c => String(c.dni).trim() === String(req.params.dni).trim());

        if (cliente) {
            res.json(cliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        // ESTA ES LA PARTE IMPORTANTE
        // Enviamos el error real y detallado para poder verlo
        console.error('Ha ocurrido un error grave:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor. Revisa los logs de Render.',
            detalle: error.toString() // El mensaje "soplón"
        });
    }
});

app.get('/', (req, res) => {
  res.send('¡Servidor del portal de clientes funcionando con el código de DIAGNÓSTICO FINAL!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
