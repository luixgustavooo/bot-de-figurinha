const fs = require('fs');
const path = require('path');

const filesToPatch = [
    {
        src: path.join(__dirname, '..', 'patches', 'whatsapp-web.js', 'Client.js'),
        dest: path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'Client.js'),
    },
    {
        src: path.join(__dirname, '..', 'patches', 'whatsapp-web.js', 'Utils.js'),
        dest: path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js'),
    },
    {
        src: path.join(__dirname, '..', 'patches', 'whatsapp-web.js', 'Puppeteer.js'),
        dest: path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Puppeteer.js'),
    },
    {
        src: path.join(__dirname, '..', 'patches', 'whatsapp-web.js', 'Message.js'),
        dest: path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'structures', 'Message.js'),
    },
];

for (const { src, dest } of filesToPatch) {
    if (fs.existsSync(src) && fs.existsSync(path.dirname(dest))) {
        fs.copyFileSync(src, dest);
    }
}
console.log('✔ Patches de compatibilidade do whatsapp-web.js aplicados com sucesso.');
