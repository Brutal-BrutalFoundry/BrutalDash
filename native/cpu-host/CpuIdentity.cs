using System.Runtime.Intrinsics.X86;
using System.Text;

namespace BrutalDashCpuHost;

internal readonly record struct CpuIdentity(
    string Vendor,
    string Brand,
    int Family,
    int Model,
    int Stepping,
    uint MaxBasicLeaf,
    uint MaxExtendedLeaf)
{
    public bool IsIntel => Vendor == "GenuineIntel";
    public bool IsAmd => Vendor == "AuthenticAMD";

    public static CpuIdentity Read()
    {
        if (!X86Base.IsSupported)
            throw new PlatformNotSupportedException("x86 CPUID is unavailable.");

        var leaf0 = X86Base.CpuId(0, 0);
        uint maxBasic = unchecked((uint)leaf0.Eax);
        string vendor = DecodeInts(leaf0.Ebx, leaf0.Edx, leaf0.Ecx);

        if (maxBasic < 1)
            throw new PlatformNotSupportedException("CPUID leaf 1 is unavailable.");

        var leaf1 = X86Base.CpuId(1, 0);
        uint eax = unchecked((uint)leaf1.Eax);
        int stepping = (int)(eax & 0xF);
        int baseModel = (int)((eax >> 4) & 0xF);
        int baseFamily = (int)((eax >> 8) & 0xF);
        int extModel = (int)((eax >> 16) & 0xF);
        int extFamily = (int)((eax >> 20) & 0xFF);
        int family = baseFamily == 0xF ? baseFamily + extFamily : baseFamily;
        int model = baseFamily is 0x6 or 0xF ? baseModel | (extModel << 4) : baseModel;

        var ext0 = X86Base.CpuId(unchecked((int)0x80000000u), 0);
        uint maxExtended = unchecked((uint)ext0.Eax);
        string brand = maxExtended >= 0x80000004u ? ReadBrand() : vendor;

        return new CpuIdentity(vendor, brand.Trim(), family, model, stepping, maxBasic, maxExtended);
    }

    private static string ReadBrand()
    {
        var bytes = new byte[48];
        int offset = 0;
        for (uint leaf = 0x80000002u; leaf <= 0x80000004u; leaf++)
        {
            var value = X86Base.CpuId(unchecked((int)leaf), 0);
            WriteInt(bytes, ref offset, value.Eax);
            WriteInt(bytes, ref offset, value.Ebx);
            WriteInt(bytes, ref offset, value.Ecx);
            WriteInt(bytes, ref offset, value.Edx);
        }

        return Encoding.ASCII.GetString(bytes).TrimEnd('\0', ' ');
    }

    private static string DecodeInts(params int[] values)
    {
        var bytes = new byte[values.Length * 4];
        int offset = 0;
        foreach (int value in values)
            WriteInt(bytes, ref offset, value);
        return Encoding.ASCII.GetString(bytes);
    }

    private static void WriteInt(byte[] target, ref int offset, int value)
    {
        target[offset++] = (byte)value;
        target[offset++] = (byte)(value >> 8);
        target[offset++] = (byte)(value >> 16);
        target[offset++] = (byte)(value >> 24);
    }
}
