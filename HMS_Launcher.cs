using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace HMSLauncher
{
    static class Program
    {
        private const int DefaultPort = 3000;

        [STAThread]
        static void Main()
        {
            try
            {
                string targetUrl = DiscoverServerUrl();
                
                // Open standard default browser
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "تعذر فتح نظام HMS للتتبع الصناعي:\n" + ex.Message + "\n\nتأكد من تشغيل السيرفر أولاً (start_system.bat)",
                    "HMS Industrial System - تنبيه",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
        }

        private static string DiscoverServerUrl()
        {
            int port = GetConfiguredPort();

            // 1. If running on the server machine itself and port is listening -> localhost
            if (IsPortOpen("127.0.0.1", port, 250))
            {
                return "http://localhost:" + port;
            }

            // 2. Check if server IP is written in local config/environment
            string savedIp = ReadSavedServerIp();
            if (!string.IsNullOrEmpty(savedIp) && IsPortOpen(savedIp, port, 400))
            {
                return "http://" + savedIp + ":" + port;
            }

            // 3. Check local active IPv4 addresses (maybe server is on another interface)
            string localIp = GetPrimaryLocalIP();
            if (!string.IsNullOrEmpty(localIp) && IsPortOpen(localIp, port, 300))
            {
                return "http://" + localIp + ":" + port;
            }

            // 4. Default fallback: localhost
            return "http://localhost:" + port;
        }

        private static int GetConfiguredPort()
        {
            try
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string envPath = Path.Combine(appDir, ".env");
                if (File.Exists(envPath))
                {
                    string content = File.ReadAllText(envPath);
                    Match m = Regex.Match(content, @"^\s*PORT\s*=\s*(\d+)", RegexOptions.Multiline);
                    if (m.Success)
                    {
                        return int.Parse(m.Groups[1].Value);
                    }
                }
            }
            catch { }
            return DefaultPort;
        }

        private static string ReadSavedServerIp()
        {
            try
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string cfgPath = Path.Combine(appDir, "server_ip.txt");
                if (File.Exists(cfgPath))
                {
                    string ip = File.ReadAllText(cfgPath).Trim();
                    if (!string.IsNullOrEmpty(ip)) return ip;
                }
            }
            catch { }
            return null;
        }

        private static string GetPrimaryLocalIP()
        {
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    IPInterfaceProperties props = ni.GetIPProperties();
                    foreach (UnicastIPAddressInformation addr in props.UnicastAddresses)
                    {
                        if (addr.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            string ipStr = addr.Address.ToString();
                            if (!ipStr.StartsWith("127.") && !ipStr.StartsWith("169.254."))
                            {
                                return ipStr;
                            }
                        }
                    }
                }
            }
            catch { }
            return null;
        }

        private static bool IsPortOpen(string host, int port, int timeoutMs)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(timeoutMs);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
