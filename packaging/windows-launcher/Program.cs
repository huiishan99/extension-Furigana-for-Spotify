using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

[assembly: AssemblyTitle("Furigana for Spotify")]
[assembly: AssemblyDescription("Update, repair, and launch Furigana for Spotify")]
[assembly: AssemblyCompany("Furigana for Spotify contributors")]
[assembly: AssemblyProduct("Furigana for Spotify")]
[assembly: AssemblyCopyright("Copyright (c) Furigana for Spotify contributors")]

internal static class Program
{
    private const string AppUserModelId = "FuriganaForSpotify.Launcher";

    [DllImport("shell32.dll", SetLastError = true)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string appId);

    [STAThread]
    private static int Main()
    {
        try
        {
            int appIdResult = SetCurrentProcessExplicitAppUserModelID(AppUserModelId);
            if (appIdResult < 0)
            {
                Marshal.ThrowExceptionForHR(appIdResult);
            }

            string executablePath = Assembly.GetExecutingAssembly().Location;
            string appDirectory = Path.GetDirectoryName(executablePath);
            if (String.IsNullOrEmpty(appDirectory))
            {
                throw new InvalidOperationException("The launcher directory could not be determined.");
            }

            string launcherScript = Path.Combine(appDirectory, "launcher.ps1");
            if (!File.Exists(launcherScript))
            {
                launcherScript = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "spicetify",
                    "CustomApps",
                    "spotify-furigana",
                    "launcher.ps1");
            }
            if (!File.Exists(launcherScript))
            {
                throw new FileNotFoundException("The Furigana launcher script is missing.", launcherScript);
            }
            if (launcherScript.IndexOf('"') >= 0)
            {
                throw new InvalidOperationException("The launcher path contains an unsupported quote character.");
            }

            string systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
            string powershell = Path.Combine(systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            if (!File.Exists(powershell))
            {
                throw new FileNotFoundException("Windows PowerShell could not be found.", powershell);
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = powershell,
                Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + launcherScript + "\"",
                WorkingDirectory = Path.GetDirectoryName(launcherScript),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Furigana for Spotify could not start.\n\n" + error.Message,
                "Furigana for Spotify",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }
}
