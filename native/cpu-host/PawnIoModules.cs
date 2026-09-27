// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. See LICENSE-LibreHardwareMonitor.txt.

using LibreHardwareMonitor.PawnIo;

namespace BrutalDashCpuHost;

internal sealed class IntelMsrModule : IDisposable
{
    private readonly PawnIo _io = PawnIo.LoadModuleFromResource(
        typeof(IntelMsrModule).Assembly,
        "BrutalDashCpuHost.Resources.PawnIo.IntelMSR.bin");

    public bool Read(uint index, out ulong value)
    {
        try
        {
            long[] result = _io.Execute("ioctl_read_msr", [index], 1);
            value = unchecked((ulong)result[0]);
            return true;
        }
        catch
        {
            value = 0;
            return false;
        }
    }

    public void Dispose() => _io.Close();
}

internal sealed class Amd17Module : IDisposable
{
    // PawnIO SMN reads use a shared PCI index/data register pair.
    private readonly Mutex _pciMutex = new(false, @"Global\Access_PCI");
    public string? LastSmnError { get; private set; }
    private readonly PawnIo _io = PawnIo.LoadModuleFromResource(
        typeof(Amd17Module).Assembly,
        "BrutalDashCpuHost.Resources.PawnIo.AMDFamily17.bin");

    public bool ReadMsr(uint index, out ulong value)
    {
        try
        {
            long[] result = _io.Execute("ioctl_read_msr", [index], 1);
            value = unchecked((ulong)result[0]);
            return true;
        }
        catch
        {
            value = 0;
            return false;
        }
    }

    public bool ReadSmn(uint offset, out uint value)
    {
        bool acquired = false;
        try
        {
            try { acquired = _pciMutex.WaitOne(100); }
            catch (AbandonedMutexException) { acquired = true; }
            if (!acquired) throw new TimeoutException("PCI sensor access is busy");
            long[] result = _io.Execute("ioctl_read_smn", [offset], 1);
            value = unchecked((uint)result[0]);
            LastSmnError = null;
            return true;
        }
        catch (Exception error)
        {
            LastSmnError = $"{error.GetType().Name}:{error.Message}";
            value = 0;
            return false;
        }
        finally { if (acquired) _pciMutex.ReleaseMutex(); }
    }

    public void Dispose() { _io.Close(); _pciMutex.Dispose(); }
}
