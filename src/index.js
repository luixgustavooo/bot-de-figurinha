const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Garante que o diretório de trabalho seja sempre a raiz do projeto
const ROOT_DIR = path.join(__dirname, '..');
process.chdir(ROOT_DIR);

require('../scripts/apply-patches');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const puppeteer = require('puppeteer');
const { createGuiServer } = require('./gui');

// Configurações de metadados das figurinhas
const STICKER_CONFIG = {
    name: 'Figurinha Bot 🤖',
    author: 'Criado automaticamente',
    maxVideoSizeBytes: 15 * 1024 * 1024, // Limite de segurança (~15MB em buffer)
};

// Comando aceito para ativação
const VALID_COMMANDS = new Set(['!s']);

let client = null;
let isShuttingDown = false;

/**
 * Converte um Buffer de imagem para WebP 512x512 com fundo transparente
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>}
 */
async function processStaticImage(imageBuffer) {
    return sharp(imageBuffer)
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();
}

/**
 * Encerra o processo do navegador do Puppeteer com segurança no Windows
 */
async function destroyClientInstance() {
    if (!client) return;
    const pid = client.pupBrowser?.process()?.pid;
    try {
        await client.destroy();
    } catch {}
    if (pid) {
        try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        } catch {}
    }
    client = null;
}

const gui = createGuiServer({
    onRestart: async () => {
        logInfo('🔄 Reiniciando o Bot de Figurinhas...');
        gui.setStatus('starting', 'Reiniciando o Bot...');
        await destroyClientInstance();
        startBotClient();
    },
    onLogout: async () => {
        logInfo('🔓 Desconectando conta atual e limpando sessão...');
        gui.setStatus('starting', 'Limpando sessão para novo QR Code...');
        await destroyClientInstance();
        try {
            fs.rmSync(path.join(ROOT_DIR, '.wwebjs_auth', 'session'), {
                recursive: true,
                force: true,
            });
        } catch {}
        startBotClient();
    },
    onShutdown: async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log('🛑 Encerrando o Bot de Figurinhas...');
        await destroyClientInstance();
        process.exit(0);
    },
});

function logInfo(msg) {
    console.log(msg);
    gui.addLog('info', msg);
}

function logWarn(msg) {
    console.warn(msg);
    gui.addLog('warn', msg);
}

function logError(msg, err) {
    const detail = err ? `${msg} ${err.message || err}` : msg;
    console.error(detail);
    gui.addLog('error', detail);
}

function startBotClient() {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(ROOT_DIR, '.wwebjs_auth') }),
        ffmpegPath: ffmpegPath,
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    // Progresso de carregamento
    client.on('loading_screen', (percent, message) => {
        const text = `⏳ Carregando WhatsApp Web: ${percent}% (${message})`;
        logInfo(text);
        gui.setStatus('loading', `Carregando WhatsApp (${percent}%)...`);
    });

    // Exibe o QR Code no terminal e na interface gráfica
    client.on('qr', (qr) => {
        console.log('\n=========================================');
        console.log('Escaneie o QR Code abaixo no seu WhatsApp:');
        console.log('=========================================\n');
        qrcode.generate(qr, { small: true });
        gui.setQr(qr);
        gui.addLog('info', '📱 Novo QR Code gerado. Escaneie com seu WhatsApp.');
    });

    // Confirmação de autenticação
    client.on('authenticated', () => {
        logInfo('🔐 Autenticado com sucesso! Sincronizando sessão...');
        gui.setStatus('authenticated', 'Autenticado! Sincronizando...');
    });

    // Confirmação de conexão pronta
    client.on('ready', () => {
        const userInfo = {
            name: client.info?.pushname || 'WhatsApp',
            number: client.info?.wid?.user || '',
        };
        logInfo('✅ Bot de Figurinhas conectado e pronto para uso!');
        gui.setStatus('ready', 'Conectado e pronto!', { userInfo });
    });

    // Log de falha de autenticação
    client.on('auth_failure', (msg) => {
        logError('❌ Falha na autenticação:', msg);
        gui.setStatus('error', 'Falha na autenticação');
    });

    // Desconexão
    client.on('disconnected', (reason) => {
        logWarn(`⚠️ Cliente desconectado: ${reason}`);
        gui.setStatus('disconnected', `Desconectado (${reason})`);
    });

    /**
     * Escuta todas as mensagens criadas (inclusive enviadas pelo próprio número do bot)
     */
    client.on('message_create', async (msg) => {
        try {
            const chatId = msg.fromMe ? msg.to : msg.from;

            // 1. Ignora atualizações de Status, Listas de Transmissão e Canais
            if (
                !chatId ||
                msg.isStatus ||
                chatId === 'status@broadcast' ||
                chatId.endsWith('@broadcast') ||
                chatId.endsWith('@newsletter')
            ) {
                return;
            }

            // 2. Filtro de segurança contra loops infinitos: ignora figurinhas
            if (msg.type === 'sticker') {
                return;
            }

            const rawText = (msg.body || msg._data?.caption || '').trim().toLowerCase();
            const isCommand = VALID_COMMANDS.has(rawText) || rawText.startsWith('!s ');

            // 3. Só processa se a mensagem tiver o comando !s (como legenda ou respondendo/marcando outra mensagem)
            if (!isCommand) {
                return;
            }

            let targetMessage = null;

            // 4. Regra de Gatilho de Ativação (apenas com !s):
            // Caso A: A própria mídia foi enviada com a legenda !s
            if (msg.hasMedia) {
                targetMessage = msg;
            }
            // Caso B: Alguém marcou/respondeu a uma foto ou vídeo com !s
            else if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg && quotedMsg.hasMedia && quotedMsg.type !== 'sticker') {
                    targetMessage = quotedMsg;
                }
            }

            if (!targetMessage) {
                return;
            }

            const mediaType = targetMessage.type;

            // Filtra apenas tipos de mídia suportados para figurinhas
            if (mediaType !== 'image' && mediaType !== 'video' && mediaType !== 'gif') {
                return;
            }

            logInfo(`📩 Processando mídia do tipo [${mediaType}] no chat [${chatId}]...`);

            // Faz o download da mídia
            const media = await targetMessage.downloadMedia();
            if (!media || !media.data) {
                logWarn('⚠️ Não foi possível baixar a mídia da mensagem.');
                return;
            }

            const mediaBuffer = Buffer.from(media.data, 'base64');
            const quotedMessageId = msg.id?._serialized || msg.id?.$1;

            // 5. Processamento de Imagens Estáticas
            if (mediaType === 'image') {
                const webpBuffer = await processStaticImage(mediaBuffer);
                const stickerMedia = new MessageMedia(
                    'image/webp',
                    webpBuffer.toString('base64'),
                    'sticker.webp'
                );

                await client.sendMessage(chatId, stickerMedia, {
                    sendMediaAsSticker: true,
                    stickerName: STICKER_CONFIG.name,
                    stickerAuthor: STICKER_CONFIG.author,
                    quotedMessageId,
                    ignoreQuoteErrors: true,
                    sendSeen: false
                });

                gui.incrementStat('static');
                logInfo('✨ Figurinha estática enviada com sucesso!');
            }
            // 6. Processamento de Vídeos e GIFs
            else if (mediaType === 'video' || mediaType === 'gif') {
                const duration = Number(targetMessage.duration || 0);

                // Verifica se o vídeo não é excessivamente longo (> 10s) ou pesado (> 15MB)
                if (duration > 10 || mediaBuffer.length > STICKER_CONFIG.maxVideoSizeBytes) {
                    await client.sendMessage(
                        chatId,
                        '⚠️ Esse vídeo é muito longo ou pesado! Por favor, envie um vídeo de até 6 segundos.',
                        { quotedMessageId, ignoreQuoteErrors: true, sendSeen: false }
                    );
                    return;
                }

                try {
                    await client.sendMessage(chatId, media, {
                        sendMediaAsSticker: true,
                        stickerName: STICKER_CONFIG.name,
                        stickerAuthor: STICKER_CONFIG.author,
                        quotedMessageId,
                        ignoreQuoteErrors: true,
                        sendSeen: false
                    });

                    gui.incrementStat('animated');
                    logInfo('🎬 Figurinha animada enviada com sucesso!');
                } catch (videoErr) {
                    logError('❌ Erro ao converter vídeo/GIF em figurinha:', videoErr);
                    await client.sendMessage(
                        chatId,
                        '❌ Não foi possível converter este vídeo em figurinha. Por favor, envie um vídeo mais curto (de até 6 segundos).',
                        { quotedMessageId, ignoreQuoteErrors: true, sendSeen: false }
                    );
                }
            }
        } catch (error) {
            logError('❌ Erro inesperado no processamento da mensagem:', error);
        }
    });

    logInfo('🚀 Iniciando o Bot de Figurinhas... Aguarde a conexão com o WhatsApp Web.');
    client.initialize().catch((err) => {
        logError('❌ Erro ao inicializar o WhatsApp Web:', err);
        gui.setStatus('error', 'Erro ao iniciar WhatsApp Web');
    });
}

(async () => {
    const port = await gui.startServer(3847);
    const openGui = process.argv.includes('--gui');

    logInfo(`🖥️ Painel Desktop disponível em: http://127.0.0.1:${port}`);

    if (openGui) {
        let pupExecPath = null;
        try {
            pupExecPath = puppeteer.executablePath();
        } catch {}
        gui.openWindow(port, pupExecPath);
    }

    startBotClient();
})();
