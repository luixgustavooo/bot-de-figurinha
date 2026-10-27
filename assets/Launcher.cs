using System;
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
                    "Arquivo src\\index.js não encontrado em:\n" + scriptPath,
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

            string nodeExe = "C:\\Program Files\\nodejs\\node.exe";
            if (!File.Exists(nodeExe))
            {
                nodeExe = "node.exe";
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "\"" + scriptPath + "\" --gui";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Falha ao iniciar o Bot de Figurinhas:\n" + ex.Message,
                    "Figurinha Bot - Erro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
