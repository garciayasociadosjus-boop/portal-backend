<!DOCTYPE html>
<html lang="es-AR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Consulta de Expediente</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #0A0E1A; --secondary: #151B2D; --accent: #374151; --light: #F9FAFB; --white: #FFFFFF; --silver: #E5E7EB; }
        body { font-family: 'Source Sans Pro', sans-serif; background-color: var(--light); color: var(--primary); margin: 0; padding: 2rem; }
        .container { background-color: var(--white); border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); max-width: 800px; width: 100%; margin: 2rem auto; }
        .header { background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: var(--white); padding: 2rem; text-align: center; border-radius: 15px 15px 0 0; }
        .header h1 { font-family: 'Crimson Text', serif; margin: 0; }
        .content { padding: 2rem; }
        #status { text-align: center; font-size: 1.2rem; font-weight: 600; padding: 3rem; }
        .expediente-block { margin-bottom: 3rem; border: 1px solid var(--silver); border-radius: 10px; overflow: hidden; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; border-bottom: 1px solid var(--silver); padding: 1.5rem; background-color: #fdfdfd;}
        .info-item h3 { font-size: 0.9rem; color: #666; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px; }
        .info-item p { margin: 0; font-size: 1.1rem; font-weight: 600; }
        .history-section { padding: 1.5rem; }
        .history-section h2 { font-family: 'Crimson Text', serif; margin-bottom: 1.5rem; border-bottom: 2px solid var(--primary); padding-bottom: 0.5rem; }
        .history-item { background-color: var(--light); border-left: 4px solid var(--secondary); padding: 1rem; margin-bottom: 1rem; border-radius: 5px; }
        .history-item-date { font-weight: 700; color: var(--primary); margin-bottom: 0.5rem; }
        .history-item-text { line-height: 1.6; }
        .error { color: #e74c3c; }
    </style>
</head>
<body>
    <div id="main-container">
        <div class="header">
            <h1>Seguimiento de Expediente(s)</h1>
        </div>
        <div class="content">
            <div id="status">Cargando información del expediente...</div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            const statusDiv = document.getElementById('status');
            const contentDiv = document.querySelector('.content');

            try {
                const params = new URLSearchParams(window.location.search);
                const dni = params.get('dni');

                if (!dni) {
                    throw new Error('No se proporcionó un DNI para la consulta.');
                }

                const apiUrl = `https://portal-backend-v2.onrender.com/api/expediente/${dni}`;
                const response = await fetch(apiUrl);

                if (response.status === 404) {
                    throw new Error('No se encontró ningún expediente asociado a ese DNI. Por favor, verifique el número e intente nuevamente.');
                }
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detalle || 'Hubo un problema al conectar con el servidor.');
                }

                const data = await response.json();

                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error('No se encontraron expedientes para el DNI proporcionado.');
                }

                contentDiv.innerHTML = '';

                data.forEach(expediente => {
                    const expedienteContainer = document.createElement('div');
                    expedienteContainer.className = 'expediente-block';

                    let historialHtml = '<p>No hay actuaciones para mostrar.</p>';
                    if (expediente.observaciones && expediente.observaciones.length > 0) {
                        // **CORRECCIÓN: Ordenamos por 'fecha' de más nueva a más vieja**
                        const sortedObservaciones = expediente.observaciones.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

                        historialHtml = sortedObservaciones.map(obs => {
                            // **CORRECCIÓN: Usamos 'fecha' para mostrar la fecha de la actuación**
                            const fecha = new Date(obs.fecha + 'T00:00:00');
                            const fechaFormateada = fecha.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
                            return `<div class="history-item"><div class="history-item-date">${fechaFormateada}</div><div class="history-item-text">${obs.texto}</div></div>`;
                        }).join('');
                    }

                    expedienteContainer.innerHTML = `
                        <div class="info-grid">
                            <div class="info-item"><h3>Cliente</h3><p>${expediente.nombre || 'No disponible'}</p></div>
                            <div class="info-item"><h3>Carátula</h3><p>${expediente.caratula || 'No disponible'}</p></div>
                            <div class="info-item"><h3>N° Expediente</h3><p>${expediente.expediente || 'No disponible'}</p></div>
                            <div class="info-item"><h3>Estado</h3><p>${expediente.estado || 'No disponible'}</p></div>
                        </div>
                        <div class="history-section">
                            <h2>Historial de Actuaciones</h2>
                            <div>${historialHtml}</div>
                        </div>
                    `;
                    contentDiv.appendChild(expedienteContainer);
                });

            } catch (error) {
                statusDiv.textContent = error.message;
                statusDiv.classList.add('error');
                contentDiv.innerHTML = ''; // Limpiamos por si queda algo
                contentDiv.appendChild(statusDiv);
            }
        });
    </script>
</body>
</html>
