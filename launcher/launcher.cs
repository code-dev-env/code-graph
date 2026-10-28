using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

// Portable launcher: carries code-graph.html inside itself, unpacks it to %LOCALAPPDATA%\CodeGraph
// and opens it in its own Edge/Chrome app window. No install, no admin rights, no internet.
static class Launcher
{
    [STAThread]
    static void Main()
    {
        try
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodeGraph");
            Directory.CreateDirectory(dir);
            string html = Path.Combine(dir, "code-graph.html");
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("code-graph.html"))
            using (FileStream f = new FileStream(html, FileMode.Create, FileAccess.Write))
                s.CopyTo(f);

            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string[] browsers = {
                Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
            };
            string url = new Uri(html).AbsoluteUri;
            foreach (string b in browsers)
            {
                if (!File.Exists(b)) continue;
                string profile = Path.Combine(dir, "profile");
                Process.Start(b, "--app=\"" + url + "\" --window-size=1500,900 --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check");
                return;
            }
            Process.Start(new ProcessStartInfo(html) { UseShellExecute = true });   // last resort: default browser
        }
        catch (Exception e)
        {
            MessageBox.Show("Could not start Code Graph:\n" + e.Message, "Code Graph");
        }
    }
}
