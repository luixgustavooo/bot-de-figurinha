const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

/**
 * Gera um SVG nítido a partir da string do QR Code do WhatsApp
 * @param {string} qrText
 * @returns {string}
 */
function generateQrSvg(qrText) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.L);
    qr.addData(qrText);
    qr.make();
    const count = qr.getModuleCount();
    const margin = 3;
    const size = count + margin * 2;

    let paths = '';
    for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) {
                paths += `M${c + margin},${r + margin}h1v1h-1z`;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="260" height="260" shape-rendering="crispEdges">
        <rect width="100%" height="100%" fill="#ffffff" rx="2"/>
        <path d="${paths}" fill="#0b141a"/>
    </svg>`;
}

/**
 * Localiza um navegador Chromium/Edge/Chrome para abrir a janela em modo App Desktop
 */
function findAppBrowserExecutable(puppeteerExecPath) {
    const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        puppeteerExecPath,
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        } catch {}
    }
    return null;
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Figurinha Bot - WhatsApp Desktop</title>
<style>
    :root {
        --bg-main: #0b141a;
        --bg-panel: #111b21;
        --bg-card: #202c33;
        --bg-hover: #2a3942;
        --border: #2f3b43;
        --accent: #00a884;
        --accent-hover: #06cf9c;
        --danger: #ef4444;
        --warning: #f59e0b;
        --text-primary: #e9edef;
        --text-secondary: #8696a0;
    }
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        user-select: none;
    }
    body {
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        background-color: var(--bg-main);
        color: var(--text-primary);
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    header {
        background-color: var(--bg-panel);
        border-bottom: 1px solid var(--border);
        padding: 14px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .brand {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .brand-icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: linear-gradient(135deg, #00a884, #02735e);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        box-shadow: 0 2px 8px rgba(0, 168, 132, 0.3);
    }
    .brand-title h1 {
        font-size: 16px;
        font-weight: 600;
    }
    .brand-title p {
        font-size: 12px;
        color: var(--text-secondary);
    }
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        background-color: var(--bg-card);
        border: 1px solid var(--border);
    }
    .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background-color: var(--warning);
        box-shadow: 0 0 8px var(--warning);
    }
    .status-badge.ready .status-dot {
        background-color: var(--accent);
        box-shadow: 0 0 8px var(--accent);
    }
    .status-badge.error .status-dot,
    .status-badge.disconnected .status-dot {
        background-color: var(--danger);
        box-shadow: 0 0 8px var(--danger);
    }
    main {
        flex: 1;
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 18px;
        padding: 18px 22px;
        overflow: hidden;
    }
    .card {
        background-color: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .card-header {
        padding: 13px 16px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .left-content {
        flex: 1;
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 14px;
    }
    .qr-wrapper {
        background: #ffffff;
        padding: 12px;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid var(--bg-card);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .connected-icon {
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: rgba(0, 168, 132, 0.15);
        border: 2px solid var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
    }
    .info-title {
        font-size: 17px;
        font-weight: 600;
    }
    .info-desc {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.45;
    }
    .command-pill {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 12.5px;
        color: var(--text-primary);
    }
    .command-pill code {
        color: var(--accent-hover);
        font-weight: 700;
        background: rgba(0, 168, 132, 0.15);
        padding: 2px 6px;
        border-radius: 4px;
    }
    .stats-grid {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 4px;
    }
    .stat-box {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
    }
    .stat-num {
        font-size: 22px;
        font-weight: 700;
        color: var(--accent-hover);
    }
    .stat-label {
        font-size: 11px;
        color: var(--text-secondary);
        margin-top: 2px;
    }
    .actions-bar {
        padding: 12px 16px;
        border-top: 1px solid var(--border);
        display: flex;
        gap: 8px;
        background: rgba(0, 0, 0, 0.15);
    }
    button {
        flex: 1;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg-card);
        color: var(--text-primary);
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    button:hover {
        background: var(--bg-hover);
    }
    button.btn-danger {
        border-color: rgba(239, 68, 68, 0.4);
        color: #fca5a5;
    }
    button.btn-danger:hover {
        background: rgba(239, 68, 68, 0.2);
    }
    button.btn-small {
        flex: none;
        padding: 4px 10px;
        font-size: 11px;
    }
    .logs-container {
        flex: 1;
        padding: 12px 14px;
        overflow-y: auto;
        font-family: 'Cascadia Code', 'Consolas', monospace;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        user-select: text;
    }
    .log-item {
        padding: 6px 10px;
        border-radius: 6px;
        background: rgba(32, 44, 51, 0.6);
        border-left: 3px solid var(--accent);
        line-height: 1.4;
        word-break: break-word;
    }
    .log-item.warn {
        border-left-color: var(--warning);
    }
    .log-item.error {
        border-left-color: var(--danger);
        background: rgba(239, 68, 68, 0.1);
    }
    .log-time {
        color: var(--text-secondary);
        margin-right: 6px;
    }
</style>
</head>
<body>
    <header>
        <div class="brand">
            <div class="brand-icon">🤖</div>
            <div class="brand-title">
                <h1>Figurinha Bot</h1>
                <p>Gerador Automático de Figurinhas (!s)</p>
            </div>
        </div>
        <div id="statusBadge" class="status-badge">
            <span class="status-dot"></span>
            <span id="statusText">Iniciando...</span>
        </div>
    </header>

    <main>
        <section class="card">
            <div class="card-header">
                <span>Conexão do WhatsApp</span>
                <span id="accountLabel"></span>
            </div>
            <div id="leftContent" class="left-content">
                <div class="spinner"></div>
                <div class="info-title">Iniciando o Bot...</div>
                <div class="info-desc">Carregando o WhatsApp Web em segundo plano. Aguarde alguns segundos.</div>
            </div>
            <div class="actions-bar">
                <button onclick="apiAction('/api/restart')">🔄 Reiniciar</button>
                <button onclick="apiAction('/api/logout')">🔓 Trocar Conta</button>
                <button class="btn-danger" onclick="shutdownApp()">🛑 Fechar</button>
            </div>
        </section>

        <section class="card">
            <div class="card-header">
                <span>Logs de Atividade em Tempo Real</span>
                <button class="btn-small" onclick="clearLogs()">Limpar</button>
            </div>
            <div id="logsContainer" class="logs-container"></div>
        </section>
    </main>

    <script>
        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const accountLabel = document.getElementById('accountLabel');
        const leftContent = document.getElementById('leftContent');
        const logsContainer = document.getElementById('logsContainer');

        function renderState(state) {
            statusBadge.className = 'status-badge ' + (state.status || '');
            statusText.textContent = state.statusText || 'Iniciando...';
            accountLabel.textContent = state.userInfo?.number ? ('+' + state.userInfo.number) : '';

            if (state.status === 'qr' && state.qrSvg) {
                leftContent.innerHTML = \`
                    <div class="qr-wrapper">\${state.qrSvg}</div>
                    <div class="info-title">Escaneie o QR Code</div>
                    <div class="info-desc">
                        No WhatsApp do celular, toque em <b>Dispositivos conectados</b> &gt; <b>Conectar dispositivo</b>.
                    </div>
                \`;
            } else if (state.status === 'ready') {
                const userTitle = state.userInfo?.name
                    ? \`Conectado como \${state.userInfo.name}\`
                    : 'Bot Conectado e Ativo!';
                leftContent.innerHTML = \`
                    <div class="connected-icon">✅</div>
                    <div class="info-title">\${userTitle}</div>
                    <div class="command-pill">
                        Envie ou responda uma foto/vídeo com <code>!s</code>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-num">\${state.stats?.staticStickers || 0}</div>
                            <div class="stat-label">Figurinhas Estáticas</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-num">\${state.stats?.animatedStickers || 0}</div>
                            <div class="stat-label">Figurinhas Animadas</div>
                        </div>
                    </div>
                \`;
            } else if (state.status === 'authenticated') {
                leftContent.innerHTML = \`
                    <div class="spinner"></div>
                    <div class="info-title">Autenticado!</div>
                    <div class="info-desc">Sincronizando mensagens do WhatsApp...</div>
                \`;
            } else {
                leftContent.innerHTML = \`
                    <div class="spinner"></div>
                    <div class="info-title">\${state.statusText || 'Carregando...'}</div>
                    <div class="info-desc">Aguardando comunicação com o WhatsApp Web...</div>
                \`;
            }

            if (Array.isArray(state.logs)) {
                logsContainer.innerHTML = state.logs.map(l => \`
                    <div class="log-item \${l.level || 'info'}">
                        <span class="log-time">[\${l.time}]</span>
                        <span>\${escapeHtml(l.message)}</span>
                    </div>
                \`).join('');
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        }

        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function clearLogs() {
            logsContainer.innerHTML = '';
            fetch('/api/clear-logs', { method: 'POST' }).catch(() => {});
        }

        async function apiAction(url) {
            try {
                await fetch(url, { method: 'POST' });
            } catch {}
        }

        async function shutdownApp() {
            try {
                await fetch('/api/shutdown', { method: 'POST' });
            } catch {}
            window.close();
        }

        const es = new EventSource('/api/events');
        es.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                renderState(data);
            } catch {}
        };
    </script>
</body>
</html>`;

function createGuiServer({ onRestart, onLogout, onShutdown }) {
    const clients = new Set();
    let closeTimer = null;
    let hasOpenedClient = false;

    const state = {
        status: 'starting',
        statusText: 'Iniciando WhatsApp Web...',
        qrSvg: null,
        userInfo: null,
        stats: {
            staticStickers: 0,
            animatedStickers: 0,
        },
        logs: [],
    };

    function broadcast() {
        const payload = `data: ${JSON.stringify(state)}\n\n`;
        for (const res of clients) {
            try {
                res.write(payload);
            } catch {}
        }
    }

    function addLog(level, message) {
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        state.logs.push({ time, level, message });
        if (state.logs.length > 150) {
            state.logs.shift();
        }
        broadcast();
    }

    function setStatus(status, statusText, extra = {}) {
        state.status = status;
        if (statusText) state.statusText = statusText;
        if (status !== 'qr') state.qrSvg = null;
        if (extra.userInfo !== undefined) state.userInfo = extra.userInfo;
        broadcast();
    }

    function setQr(qrString) {
        try {
            state.qrSvg = generateQrSvg(qrString);
            state.status = 'qr';
            state.statusText = 'Aguardando leitura do QR Code';
            broadcast();
        } catch (err) {
            addLog('error', `Erro ao renderizar QR Code: ${err.message}`);
        }
    }

    function incrementStat(kind) {
        if (kind === 'static') state.stats.staticStickers++;
        if (kind === 'animated') state.stats.animatedStickers++;
        broadcast();
    }

    const server = http.createServer(async (req, res) => {
        if (req.url === '/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(HTML_PAGE);
            return;
        }

        if (req.url === '/api/events' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            clients.add(res);
            hasOpenedClient = true;
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            res.write(`data: ${JSON.stringify(state)}\n\n`);

            req.on('close', () => {
                clients.delete(res);
                if (hasOpenedClient && clients.size === 0) {
                    closeTimer = setTimeout(() => {
                        if (clients.size === 0 && onShutdown) {
                            onShutdown();
                        }
                    }, 3000);
                }
            });
            return;
        }

        if (req.url === '/api/clear-logs' && req.method === 'POST') {
            state.logs = [];
            broadcast();
            res.writeHead(200);
            res.end('ok');
            return;
        }

        if (req.url === '/api/restart' && req.method === 'POST') {
            res.writeHead(200);
            res.end('ok');
            if (onRestart) onRestart();
            return;
        }

        if (req.url === '/api/logout' && req.method === 'POST') {
            res.writeHead(200);
            res.end('ok');
            if (onLogout) onLogout();
            return;
        }

        if (req.url === '/api/shutdown' && req.method === 'POST') {
            res.writeHead(200);
            res.end('ok');
            if (onShutdown) onShutdown();
            return;
        }

        res.writeHead(404);
        res.end();
    });

    function startServer(preferredPort = 3847) {
        return new Promise((resolve) => {
            server.once('error', () => {
                server.listen(0, '127.0.0.1', () => {
                    resolve(server.address().port);
                });
            });
            server.listen(preferredPort, '127.0.0.1', () => {
                resolve(server.address().port);
            });
        });
    }

    function openWindow(port, puppeteerExecPath) {
        const url = `http://127.0.0.1:${port}`;
        const browserExe = findAppBrowserExecutable(puppeteerExecPath);
        if (browserExe) {
            const uiProfileDir = path.join(
                __dirname,
                '..',
                '.wwebjs_cache',
                'desktop_ui_profile',
            );
            fs.mkdirSync(uiProfileDir, { recursive: true });
            const uiProc = spawn(
                browserExe,
                [
                    `--app=${url}`,
                    `--user-data-dir=${uiProfileDir}`,
                    '--window-size=960,640',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-extensions',
                ],
                {
                    detached: false,
                    stdio: 'ignore',
                },
            );
            uiProc.on('exit', () => {
                setTimeout(() => {
                    if (hasOpenedClient && clients.size === 0 && onShutdown) {
                        onShutdown();
                    }
                }, 1500);
            });
            return uiProc;
        } else {
            spawn('cmd.exe', ['/c', 'start', '', url], { stdio: 'ignore' });
            return null;
        }
    }

    return {
        startServer,
        openWindow,
        setStatus,
        setQr,
        addLog,
        incrementStat,
    };
}

module.exports = { createGuiServer };
