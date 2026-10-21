# 🤖 WhatsApp Sticker Bot

Bot para WhatsApp desenvolvido em Node.js capaz de converter **imagens**, **vídeos curtos** e **GIFs** em figurinhas (estáticas e animadas) automaticamente.

## 🚀 Tecnologias Utilizadas

- **[whatsapp-web.js](https://wwebjs.dev/)**: Cliente WhatsApp Web baseado em Puppeteer com persistência via `LocalAuth`.
- **[sharp](https://sharp.pixelplumbing.com/)**: Redimensionamento de alta performance para imagens estáticas em `512x512` (`.webp`) com fundo transparente.
- **[ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static)**: Binário embutido do FFmpeg para conversão de vídeos e GIFs em figurinhas animadas sem necessidade de instalação global no sistema operacional.
- **[qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal)**: Exibição do QR Code de autenticação diretamente no terminal.

---

## 📦 Como Instalar e Executar

1. **Instale as dependências** (caso ainda não tenha instalado):
   ```bash
   npm install
   ```

2. **Inicie o bot**:
   ```bash
   npm start
   ```

3. **Autentique no WhatsApp**:
   - No terminal, será exibido um **QR Code**.
   - No seu celular, abra o WhatsApp > **Aparelhos conectados** > **Conectar um aparelho** e escaneie o código.
   - Após conectar, a sessão ficará salva automaticamente na pasta `.wwebjs_auth`.

---

## 💬 Como Usar

- **Em conversas privadas (PV)**:
  - Basta enviar qualquer **imagem**, **GIF** ou **vídeo curto** (recomendado até 6 segundos) e o bot responderá automaticamente com a figurinha.
  - Você também pode responder a uma mídia existente com `!s` ou `!sticker`.

- **Em grupos**:
  - Envie uma foto/vídeo com a legenda `!s` ou `!sticker`.
  - Ou responda (marque) uma foto/vídeo já enviada no grupo digitando `!s` ou `!sticker`.

---

## ⚙️ Personalização

No arquivo [`src/index.js`](src/index.js), você pode alterar facilmente o nome do pacote e o autor exibidos nos detalhes da figurinha editando o objeto `STICKER_CONFIG`:

```js
const STICKER_CONFIG = {
    name: 'Figurinha Bot 🤖',
    author: 'Criado automaticamente',
    maxVideoSizeBytes: 15 * 1024 * 1024,
};
```
