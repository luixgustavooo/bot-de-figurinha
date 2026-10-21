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

// Comandos aceitos para ativação
const VALID_COMMANDS = new Set(['!s', '!sticker']);

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
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Exibe o QR Code no terminal para autenticação
client.on('qr', (qr) => {
    console.log('\n=========================================');
    console.log('Escaneie o QR Code abaixo no seu WhatsApp:');
    console.log('=========================================\n');
    qrcode.generate(qr, { small: true });
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

        const body = (msg.body || '').trim().toLowerCase();
        const isCommand = VALID_COMMANDS.has(body);

        // 3. Evita loop em mensagens de texto enviadas pelo próprio bot que não sejam comando nem mídia
        if (!msg.hasMedia && !isCommand) {
            return;
        }

        // Identifica se é grupo diretamente pelo ID (@g.us), evitando chamadas extras ao Puppeteer (msg.getChat)
        const isGroup = chatId.endsWith('@g.us');

        let targetMessage = null;

        // 4. Regra de Gatilho de Ativação:
        // Caso A: Alguém respondeu a uma mensagem com !s ou !sticker (funciona em grupos e no privado)
        if (isCommand && msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg && quotedMsg.hasMedia && quotedMsg.type !== 'sticker') {
                targetMessage = quotedMsg;
            }
        }
        // Caso B: A própria mensagem possui mídia
        else if (msg.hasMedia) {
            if (isGroup) {
                // Em grupos, só processa se a legenda for !s ou !sticker
                if (isCommand) {
                    targetMessage = msg;
                }
            } else {
                // Em chats privados: processa automaticamente mídias suportadas
                targetMessage = msg;
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
                    { quotedMessageId, sendSeen: false }
                );
                return;
            }

            try {
                await client.sendMessage(chatId, media, {
                    sendMediaAsSticker: true,
                    stickerName: STICKER_CONFIG.name,
                    stickerAuthor: STICKER_CONFIG.author,
                    quotedMessageId,
                    sendSeen: false
                });

                console.log('🎬 Figurinha animada enviada com sucesso!');
            } catch (videoErr) {
                console.error('❌ Erro ao converter vídeo/GIF em figurinha:', videoErr.message);
                await client.sendMessage(
                    chatId,
                    '❌ Não foi possível converter este vídeo em figurinha. Por favor, envie um vídeo mais curto (de até 6 segundos).',
                    { quotedMessageId, sendSeen: false }
                );
            }
        }
    } catch (error) {
        console.error('❌ Erro inesperado no processamento da mensagem:', error);
    }
});

// Inicializa o cliente
client.initialize();
