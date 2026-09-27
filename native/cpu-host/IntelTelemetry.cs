using System.Diagnostics;
using System.Runtime.Intrinsics.X86;

namespace BrutalDashCpuHost;

internal readonly record struct CpuTelemetryReading(
    double? TempC,
    double? ClockMHz,
    double? PowerW,
    string TemperatureSource,
    string ClockSource,
    string PowerSource,
    string? TemperatureError = null);

internal sealed class IntelTelemetry : IDisposable
{
    private const uint MsrPlatformInfo = 0xCE;
    private const uint Ia32PerfStatus = 0x198;
    private const uint Ia32TemperatureTarget = 0x1A2;
    private const uint Ia32PackageThermStatus = 0x1B1;
    private const uint MsrRaplPowerUnit = 0x606;
    private const uint MsrPkgEnergyStatus = 0x611;

    private readonly IntelMsrModule _msr = new();
    private readonly IReadOnlyList<CpuCoreTarget> _cores;
    private readonly CpuIdentity _identity;
    private readonly double? _busMHz;
    private readonly double? _energyUnitJ;

    private uint? _lastEnergy;
    private long _lastEnergyTimestamp;

    public IntelTelemetry(CpuIdentity identity)
    {
        if (!identity.IsIntel)
            throw new ArgumentException("Intel telemetry requires a GenuineIntel CPU.", nameof(identity));

        _identity = identity;
        _cores = CpuTopology.PhysicalCores();
        _busMHz = ResolveBusMHz();
        _energyUnitJ = ResolveEnergyUnit();
    }

    public CpuTelemetryReading Read()
    {
        return new CpuTelemetryReading(
            ReadPackageTemperature(),
            ReadAverageCoreClock(),
            ReadPackagePower(),
            "intel-msr-package-therm",
            "intel-msr-physical-core-average",
            "intel-rapl-package");
    }

    private double? ReadPackageTemperature()
    {
        CpuCoreTarget core = _cores[0];

        double tjMax = 100.0;
        if (ReadOn(core, Ia32TemperatureTarget, out ulong target))
        {
            int encoded = (int)((target >> 16) & 0xFF);
            if (encoded is >= 70 and <= 125)
                tjMax = encoded;
        }

        if (!ReadOn(core, Ia32PackageThermStatus, out ulong therm))
            return null;

        if ((therm & (1UL << 31)) == 0)
            return null;

        int delta = (int)((therm >> 16) & 0x7F);
        double temp = tjMax - delta;
        return temp is > -20 and < 150 ? temp : null;
    }

    private double? ReadAverageCoreClock()
    {
        if (_busMHz is null || _busMHz <= 0)
            return null;

        double total = 0;
        int count = 0;

        foreach (CpuCoreTarget core in _cores)
        {
            if (!ReadOn(core, Ia32PerfStatus, out ulong perf))
                continue;

            int ratio = (int)((perf >> 8) & 0xFF);
            if (ratio <= 0)
                continue;

            double mhz = ratio * _busMHz.Value;
            if (mhz is <= 0 or > 10000)
                continue;

            total += mhz;
            count++;
        }

        return count == 0 ? null : total / count;
    }

    private double? ReadPackagePower()
    {
        if (_energyUnitJ is null || _energyUnitJ <= 0)
            return null;

        if (!ReadOn(_cores[0], MsrPkgEnergyStatus, out ulong raw))
            return null;

        uint current = unchecked((uint)raw);
        long now = Stopwatch.GetTimestamp();

        if (_lastEnergy is null)
        {
            _lastEnergy = current;
            _lastEnergyTimestamp = now;
            return null;
        }

        double seconds = (now - _lastEnergyTimestamp) / (double)Stopwatch.Frequency;
        uint delta = unchecked(current - _lastEnergy.Value);
        _lastEnergy = current;
        _lastEnergyTimestamp = now;

        if (seconds < 0.01)
            return null;

        double watts = delta * _energyUnitJ.Value / seconds;
        return double.IsFinite(watts) && watts is >= 0 and < 5000 ? watts : null;
    }

    private double? ResolveEnergyUnit()
    {
        if (!ReadOn(_cores[0], MsrRaplPowerUnit, out ulong raw))
            return null;

        int exponent = (int)((raw >> 8) & 0x1F);
        return 1.0 / (1UL << exponent);
    }

    private double? ResolveBusMHz()
    {
        if (X86Base.IsSupported && _identity.MaxBasicLeaf >= 0x16)
        {
            var leaf16 = X86Base.CpuId(0x16, 0);
            int bus = leaf16.Ecx & 0xFFFF;
            if (bus is >= 50 and <= 1000)
                return bus;
        }

        if (X86Base.IsSupported && _identity.MaxBasicLeaf >= 0x15)
        {
            var leaf15 = X86Base.CpuId(0x15, 0);
            uint denominator = unchecked((uint)leaf15.Eax);
            uint numerator = unchecked((uint)leaf15.Ebx);
            uint crystalHz = unchecked((uint)leaf15.Ecx);

            if (denominator != 0 && numerator != 0 && crystalHz != 0 &&
                ReadOn(_cores[0], MsrPlatformInfo, out ulong platform))
            {
                int ratio = (int)((platform >> 8) & 0xFF);
                if (ratio > 0)
                {
                    double tscMHz = crystalHz * (numerator / (double)denominator) / 1_000_000.0;
                    double busMHz = tscMHz / ratio;
                    if (busMHz is >= 50 and <= 1000)
                        return busMHz;
                }
            }
        }

        return null;
    }

    private bool ReadOn(CpuCoreTarget core, uint msr, out ulong value)
    {
        using var affinity = new CpuAffinityScope(core);
        return _msr.Read(msr, out value);
    }

    public void Dispose() => _msr.Dispose();
}
