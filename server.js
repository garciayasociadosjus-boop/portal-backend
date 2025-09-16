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

async function getDriveClient() {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
}

async function getClientDataFromDrive(drive) {
    const res = await drive.files.list({
        q: `name='${DATA_FILE_NAME}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    const files = res.data.files;
    if (files.length === 0) {
        throw new Error('No se encontró el archivo datos_planilla_juridica.json en Google Drive.');
    }

    const fileId = files[0].id;
    const fileRes = await drive.files.get({ fileId: fileId, alt: 'media' });

    // --- INICIO DEL CÓDIGO ESPÍA ---
    console.log('--- CONTENIDO RAW RECIBIDO DE DRIVE ---');
    console.log(fileRes.data);
    console.log('--- FIN DEL CONTENIDO RAW ---');
    // --- FIN DEL CÓDIGO ESPÍA ---

    return JSON.parse(fileRes.data);
}

app.get('/api/expediente/:dni', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const data = await getClientDataFromDrive(drive);
        const cliente = data.find(c => String(c.dni).trim() === String(req.params.dni).trim());

        if (cliente) {
            res.json(cliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        console.error('Ha ocurrido un error grave:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor.',
            detalle: error.toString() 
        });
    }
});

app.get('/', (req, res) => {
  res.send('Servidor de diagnóstico v3 funcionando.');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
