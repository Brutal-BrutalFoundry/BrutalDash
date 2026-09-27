using System.ComponentModel;
using System.Runtime.InteropServices;

namespace BrutalDashCpuHost;

internal readonly record struct CpuCoreTarget(ushort Group, byte LogicalIndex);

internal static class CpuTopology
{
    private const int RelationProcessorCore = 0;
    private const int ErrorInsufficientBuffer = 122;

    public static IReadOnlyList<CpuCoreTarget> PhysicalCores()
    {
        uint length = 0;
        if (GetLogicalProcessorInformationEx(RelationProcessorCore, IntPtr.Zero, ref length))
            throw new InvalidOperationException("Unexpected topology sizing result.");

        int error = Marshal.GetLastWin32Error();
        if (error != ErrorInsufficientBuffer || length == 0)
            throw new Win32Exception(error, "Unable to size processor topology buffer.");

        IntPtr buffer = Marshal.AllocHGlobal(checked((int)length));
        try
        {
            if (!GetLogicalProcessorInformationEx(RelationProcessorCore, buffer, ref length))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to read processor topology.");

            var cores = new List<CpuCoreTarget>();
            int offset = 0;
            while (offset < length)
            {
                IntPtr record = IntPtr.Add(buffer, offset);
                int relationship = Marshal.ReadInt32(record, 0);
                int size = Marshal.ReadInt32(record, 4);
                if (size < 8 || offset + size > length)
                    throw new InvalidDataException("Malformed processor topology record.");

                if (relationship == RelationProcessorCore)
                {
                    ushort groupCount = unchecked((ushort)Marshal.ReadInt16(record, 30));
                    int groupMaskOffset = 32;
                    int groupAffinitySize = IntPtr.Size == 8 ? 16 : 12;

                    for (int i = 0; i < groupCount; i++)
                    {
                        IntPtr groupAffinity = IntPtr.Add(record, groupMaskOffset + i * groupAffinitySize);
                        ulong mask = IntPtr.Size == 8
                            ? unchecked((ulong)Marshal.ReadInt64(groupAffinity, 0))
                            : unchecked((uint)Marshal.ReadInt32(groupAffinity, 0));
                        ushort group = unchecked((ushort)Marshal.ReadInt16(groupAffinity, IntPtr.Size));
                        if (mask == 0)
                            continue;

                        byte logicalIndex = LowestSetBit(mask);
                        cores.Add(new CpuCoreTarget(group, logicalIndex));
                        break;
                    }
                }

                offset += size;
            }

            if (cores.Count == 0)
                throw new InvalidOperationException("Windows reported no physical CPU cores.");

            return cores;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static byte LowestSetBit(ulong mask)
    {
        for (byte i = 0; i < 64; i++)
            if ((mask & (1UL << i)) != 0)
                return i;
        throw new ArgumentOutOfRangeException(nameof(mask));
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetLogicalProcessorInformationEx(
        int relationshipType,
        IntPtr buffer,
        ref uint returnedLength);
}

internal sealed class CpuAffinityScope : IDisposable
{
    private readonly IntPtr _thread;
    private readonly GroupAffinity _previous;
    private bool _disposed;

    public CpuAffinityScope(CpuCoreTarget target)
    {
        _thread = GetCurrentThread();
        var requested = new GroupAffinity
        {
            Mask = 1UL << target.LogicalIndex,
            Group = target.Group
        };

        if (!SetThreadGroupAffinity(_thread, ref requested, out _previous))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to set CPU group affinity.");
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        var restore = _previous;
        if (!SetThreadGroupAffinity(_thread, ref restore, out _))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to restore CPU group affinity.");

        _disposed = true;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GroupAffinity
    {
        public ulong Mask;
        public ushort Group;
        public ushort Reserved0;
        public ushort Reserved1;
        public ushort Reserved2;
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentThread();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetThreadGroupAffinity(
        IntPtr thread,
        ref GroupAffinity groupAffinity,
        out GroupAffinity previousGroupAffinity);
}

