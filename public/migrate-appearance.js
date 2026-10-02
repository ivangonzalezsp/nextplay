async function migrateAppearance(useDefaults = false) {
    const status = document.getElementById('status');
    const retry = document.getElementById('retry');
    retry.hidden = true;
    document.getElementById('defaults').hidden = true;
    const alternate = document.getElementById('alternate');
    alternate.hidden = true;
    try {
        const preferences = {};
        const language = localStorage.getItem('nextplay-language');
        const theme = localStorage.getItem('nextplay-theme');
        if (language === null && theme === null && !useDefaults) {
            status.textContent =
                'No hay preferencias guardadas en esta dirección. Prueba la otra dirección local en el navegador que usabas antes, o continúa con los valores predeterminados. / No saved preferences at this address. Try the other local address in your previous browser, or continue with defaults.';
            const other = new URL(location.href);
            other.hostname =
                location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
            alternate.href = other.href;
            alternate.hidden = false;
            document.getElementById('defaults').hidden = false;
            return;
        }
        if (language !== null)
            preferences.language = language === 'en' ? 'en' : 'es';
        if (theme !== null)
            preferences.theme = [
                'cinema',
                'cinema-ocean',
                'cinema-violet',
                'cinema-amber',
                'cinema-rose',
            ].includes(theme)
                ? theme
                : 'cinema';
        const response = await fetch('/api/app/appearance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preferences),
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || `HTTP ${response.status}`);
        }
        status.textContent =
            language === 'en'
                ? 'Your preferences are ready in the desktop app. You can close this browser tab.'
                : 'Tus preferencias ya están disponibles en la app de escritorio. Puedes cerrar esta pestaña del navegador.';
    } catch (error) {
        status.textContent =
            'No se han podido recuperar las preferencias. Puedes reintentar; tus datos se conservan. / Could not recover your preferences. Retry; your data is preserved. ' +
            error.message;
        retry.hidden = false;
    }
}
document
    .getElementById('retry')
    .addEventListener('click', () => void migrateAppearance());
document
    .getElementById('defaults')
    .addEventListener('click', () => void migrateAppearance(true));
void migrateAppearance();
