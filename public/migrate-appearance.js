async function migrateAppearance() {
    const status = document.getElementById('status');
    const retry = document.getElementById('retry');
    retry.hidden = true;
    try {
        const preferences = {};
        const language = localStorage.getItem('nextplay-language');
        const theme = localStorage.getItem('nextplay-theme');
        if (language !== null) preferences.language = language;
        if (theme !== null) preferences.theme = theme;
        const response = await fetch('/api/app/appearance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preferences),
        });
        if (!response.ok) throw new Error();
        status.textContent =
            language === 'en'
                ? 'Your preferences are ready in the desktop app. You can close this browser tab.'
                : 'Tus preferencias ya están disponibles en la app de escritorio. Puedes cerrar esta pestaña del navegador.';
    } catch {
        status.textContent =
            'No se han podido recuperar las preferencias. Puedes reintentar; tus datos se conservan. / Could not recover your preferences. Retry; your data is preserved.';
        retry.hidden = false;
    }
}
document.getElementById('retry').addEventListener('click', migrateAppearance);
void migrateAppearance();
