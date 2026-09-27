using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using LibreHardwareMonitor.PawnIo;

namespace BrutalDashCpuHost;

internal readonly record struct PawnIoProvisionResult(
    bool Ready,
    string? Error,
    bool PawnIoInstalled,
    string? PawnIoVersion,
    bool? RestartRequired = null);

internal static class PawnIoProvisioning
{
    private const string InstallerSha256 = "1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032";

    public static PawnIoProvisionResult Ensure()
    {
        if (!OperatingSystem.IsWindows())
            return new(false, "windows-only", false, null);

        return VerifyOrProvision(
            ProbeAccess,
            Install,
            Environment.GetEnvironmentVariable("BRUTALDASH_CPU_HOST_NO_INSTALL") != "1",
            PawnIo.IsInstalled,
            PawnIo.Version?.ToString());
    }

    internal static PawnIoProvisionResult VerifyOrProvision(
        Func<string?> probeAccess,
        Func<PawnIoProvisionResult> install,
        bool allowInstall,
        bool installed,
        string? version)
    {
        // Uninstall metadata may be missing/stale. Loading the signed module
        // through the live device is the capability check that matters.
        string? accessError = probeAccess();
        if (accessError is null) return new(true, null, true, version);
        if (accessError == "cpu-vendor-unsupported") return new(false, accessError, installed, version);
        if (!allowInstall) return new(false, "native-driver-needed", installed, version);

        PawnIoProvisionResult setup = install();
        if (setup.Error != "native-driver-provisioned") return setup;

        accessError = probeAccess();
        if (accessError is null) return new(true, null, true, version);

        // An installer exit code is not proof the driver is usable. Emit a
        // terminal setup error so the extension cannot relaunch setup forever.
        return new(false, $"native-driver-install-failed:access-after-setup:{accessError}", installed, version);
    }

    private static string? ProbeAccess()
    {
        try
        {
            CpuIdentity cpu = CpuIdentity.Read();
            if (!cpu.IsIntel && !cpu.IsAmd) return "cpu-vendor-unsupported";
            string moduleName = cpu.IsAmd ? "AMDFamily17" : "IntelMSR";
            PawnIo module = PawnIo.LoadModuleFromResource(
                typeof(PawnIoProvisioning).Assembly,
                $"BrutalDashCpuHost.Resources.PawnIo.{moduleName}.bin");
            module.Close();
            return null;
        }
        catch (Win32Exception error)
        {
            return $"Win32:{error.NativeErrorCode}:{error.Message}";
        }
        catch (Exception error)
        {
            return $"{error.GetType().Name}:{error.Message}";
        }
    }

    private static PawnIoProvisionResult Install()
    {
        Version? version = PawnIo.Version;

        string? hostDir = Path.GetDirectoryName(Environment.ProcessPath);
        string? installerPath = hostDir is null ? null : Path.Combine(hostDir, "PawnIO_setup.exe");
        if (installerPath is null || !File.Exists(installerPath))
            return new(false, "native-driver-bundle-missing", PawnIo.IsInstalled, version?.ToString());

        string actualHash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(installerPath)));
        if (!string.Equals(actualHash, InstallerSha256, StringComparison.OrdinalIgnoreCase))
            return new(false, "native-driver-integrity-failed", PawnIo.IsInstalled, version?.ToString());

        try
        {
            var startInfo = new ProcessStartInfo(installerPath, "-install -silent")
            {
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = hostDir!
            };

            using Process? installer = Process.Start(startInfo);
            if (installer is null)
                return new(false, "native-driver-launch-failed", PawnIo.IsInstalled, version?.ToString());

            installer.WaitForExit();
            if (installer.ExitCode is 0 or 183)
                return new(false, "native-driver-provisioned", false, null, false);

            if (installer.ExitCode is 3010 or 1641)
                return new(false, "native-driver-provisioned-reboot-required", false, null, true);

            return new(false, $"native-driver-install-failed:{installer.ExitCode}", false, null);
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            return new(false, "native-driver-elevation-cancelled", false, null);
        }
        catch (Exception ex)
        {
            return new(false, $"native-driver-install-failed:{ex.GetType().Name}:{ex.Message}", false, null);
        }
    }

}
