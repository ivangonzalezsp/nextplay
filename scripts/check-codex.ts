import { askCodex, codexStatus } from '../server/codex.ts';
const status = await codexStatus();
console.log(status.codexMessage);
if (!status.codex) process.exit(1);
if (process.argv.includes('--live')) {
    const response = await askCodex(
        'Prueba de conexión de Next Play. Devuelve message="Conexión correcta", owned=[] y discoveries=[]. No uses herramientas.',
    );
    if ((response as { message?: string }).message !== 'Conexión correcta')
        throw new Error('La prueba no devolvió el resultado esperado.');
    console.log('Respuesta estructurada de Codex verificada.');
}
