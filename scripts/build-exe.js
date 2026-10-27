const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT_DIR = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.ico');
const CS_PATH = path.join(ASSETS_DIR, 'Launcher.cs');
const EXE_PATH = path.join(ROOT_DIR, 'BotFigurinha.exe');

async function createIcoFile() {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#00d09c"/>
                <stop offset="100%" stop-color="#008069"/>
            </linearGradient>
        </defs>
        <rect x="12" y="12" width="232" height="232" rx="56" fill="url(#bg)"/>
        <rect x="48" y="48" width="160" height="160" rx="32" fill="#0b141a" opacity="0.9"/>
        <circle cx="98" cy="114" r="14" fill="#00d09c"/>
        <circle cx="158" cy="114" r="14" fill="#00d09c"/>
        <rect x="88" y="152" width="80" height="14" rx="7" fill="#00d09c"/>
        <circle cx="196" cy="60" r="24" fill="#ffffff"/>
        <text x="196" y="69" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#008069" text-anchor="middle">!s</text>
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(svgIcon))
        .resize(256, 256)
        .png()
        .toBuffer();

    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // Type: 1 = ICO
    header.writeUInt16LE(1, 4); // Image count: 1
    header.writeUInt8(0, 6);    // Width: 0 = 256px
    header.writeUInt8(0, 7);    // Height: 0 = 256px
    header.writeUInt8(0, 8);    // Colors
    header.writeUInt8(0, 9);    // Reserved
    header.writeUInt16LE(1, 10); // Planes
    header.writeUInt16LE(32, 12); // BPP
    header.writeUInt32LE(pngBuffer.length, 14); // Size
    header.writeUInt32LE(22, 18); // Offset

    fs.writeFileSync(ICON_PATH, Buffer.concat([header, pngBuffer]));
}

function createCSharpSource() {
    const nodePathEscaped = process.execPath.replace(/\\/g, '\\\\');

    const csCode = `using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Windows.Forms;

namespace BotFigurinhaLauncher
{
    static class Program
    {
        static bool IsPortOpen(int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    var success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(350));
                    return success && client.Connected;
                }
            }
            catch
            {
                return false;
            }
        }

        [STAThread]
        static void Main()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string scriptPath = Path.Combine(baseDir, "src", "index.js");

            if (!File.Exists(scriptPath))
            {
                MessageBox.Show(
                    "Arquivo src\\\\index.js não encontrado em:\\n" + scriptPath,
                    "Figurinha Bot - Erro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // Se o bot já estiver rodando na porta 3847, apenas abre a janela do painel
            if (IsPortOpen(3847))
            {
                Process.Start("http://127.0.0.1:3847");
                return;
            }

            string nodeExe = "${nodePathEscaped}";
            if (!File.Exists(nodeExe))
            {
                nodeExe = "node.exe";
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "\\"" + scriptPath + "\\" --gui";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Falha ao iniciar o Bot de Figurinhas:\\n" + ex.Message,
                    "Figurinha Bot - Erro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
`;
    fs.writeFileSync(CS_PATH, csCode, 'utf8');
}

async function build() {
    console.log('🎨 Gerando ícone do aplicativo (assets/icon.ico)...');
    await createIcoFile();

    console.log('📝 Gerando código-fonte do executável Desktop (assets/Launcher.cs)...');
    createCSharpSource();

    const cscCandidates = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    ];
    const cscPath = cscCandidates.find((p) => fs.existsSync(p));
    if (!cscPath) {
        throw new Error('Compilador C# (csc.exe) do Windows não encontrado.');
    }

    console.log('⚙️ Compilando BotFigurinha.exe...');
    execFileSync(
        cscPath,
        [
            '/nologo',
            '/target:winexe',
            '/optimize+',
            `/win32icon:${ICON_PATH}`,
            `/out:${EXE_PATH}`,
            '/reference:System.dll',
            '/reference:System.Windows.Forms.dll',
            CS_PATH,
        ],
        { stdio: 'inherit' },
    );

    console.log(`✅ Executável criado com sucesso em: ${EXE_PATH}`);
}

build().catch((err) => {
    console.error('❌ Erro ao gerar o executável:', err.message);
    process.exit(1);
});
