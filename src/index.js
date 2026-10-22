require('../scripts/apply-patches');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');

// Configurações de metadados das figurinhas
const STICKER_CONFIG = {
    name: 'Figurinha Bot 🤖',
    author: 'Criado automaticamente',
    maxVideoSizeBytes: 15 * 1024 * 1024, // Limite de segurança (~15MB em buffer)
};

// Comando aceito para ativação
const VALID_COMMANDS = new Set(['!s']);

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
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
    console.log(`⏳ Carregando WhatsApp Web: ${percent}% (${message})`);
});

// Exibe o QR Code no terminal para autenticação
client.on('qr', (qr) => {
    console.log('\n=========================================');
    console.log('Escaneie o QR Code abaixo no seu WhatsApp:');
    console.log('=========================================\n');
    qrcode.generate(qr, { small: true });
});

// Confirmação de autenticação
client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso! Sincronizando sessão...');
});

// Confirmação de conexão pronta
client.on('ready', () => {
    console.log('✅ Bot de Figurinhas conectado e pronto para uso!');
});

// Log de falha de autenticação
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

// Desconexão
client.on('disconnected', (reason) => {
    console.warn('⚠️ Cliente desconectado:', reason);
});

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
 * Escuta todas as mensagens criadas (inclusive enviadas pelo próprio número do bot)
 */
client.on('message_create', async (msg) => {
    try {
        const chatId = msg.fromMe ? msg.to : msg.from;

        // 1. Ignora atualizações de Status, Listas de Transmissão e Canais (que causam erro ao buscar chat)
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

        console.log(`📩 Processando mídia do tipo [${mediaType}] no chat [${chatId}]...`);

        // Faz o download da mídia
        const media = await targetMessage.downloadMedia();
        if (!media || !media.data) {
            console.warn('⚠️ Não foi possível baixar a mídia da mensagem.');
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

            console.log('✨ Figurinha estática enviada com sucesso!');
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

                console.log('🎬 Figurinha animada enviada com sucesso!');
            } catch (videoErr) {
                console.error('❌ Erro ao converter vídeo/GIF em figurinha:', videoErr.message);
                await client.sendMessage(
                    chatId,
                    '❌ Não foi possível converter este vídeo em figurinha. Por favor, envie um vídeo mais curto (de até 6 segundos).',
                    { quotedMessageId, ignoreQuoteErrors: true, sendSeen: false }
                );
            }
        }
    } catch (error) {
        console.error('❌ Erro inesperado no processamento da mensagem:', error);
    }
});

// Inicializa o cliente
console.log('🚀 Iniciando o Bot de Figurinhas... Aguarde a conexão com o WhatsApp Web.');
client.initialize();
