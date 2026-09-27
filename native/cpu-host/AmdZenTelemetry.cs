using System.Diagnostics;

namespace BrutalDashCpuHost;

internal sealed class AmdZenTelemetry : IDisposable
{
    private const uint SmnThermTconCurTmp = 0x00059800;
    private const uint MsrPwrUnit = 0xC0010299;
    private const uint MsrPkgEnergyStat = 0xC001029B;
    private const uint MsrHardwarePstateStatus = 0xC0010293;
    private const uint MsrMperf = 0xC00000E7;
    private const uint MsrAperf = 0xC00000E8;

    private readonly Amd17Module _msr = new();
    private readonly IReadOnlyList<CpuCoreTarget> _cores;
    private readonly CpuIdentity _identity;
    private readonly double? _energyUnitJ;
    private readonly double _temperatureOffsetC;
    private readonly Dictionary<CpuCoreTarget, ulong> _lastMperf = new();
    private readonly Dictionary<CpuCoreTarget, ulong> _lastAperf = new();

    private uint? _lastEnergy;
    private long _lastEnergyTimestamp;

    public AmdZenTelemetry(CpuIdentity identity)
    {
        if (!identity.IsAmd)
            throw new ArgumentException("AMD telemetry requires an AuthenticAMD CPU.", nameof(identity));

        if (identity.Family is not (0x17 or 0x19 or 0x1A))
            throw new NotSupportedException($"AMD family 0x{identity.Family:X} is not a supported Zen family.");

        _identity = identity;
        _cores = CpuTopology.PhysicalCores();
        _energyUnitJ = ResolveEnergyUnit();
        _temperatureOffsetC = ResolveTemperatureOffset(identity.Brand);
    }

    public CpuTelemetryReading Read()
    {
        return new CpuTelemetryReading(
            ReadPackageTemperature(),
            ReadAverageCoreClock(),
            ReadPackagePower(),
            "amd-smn-tctl-tdie",
            "amd-msr-physical-core-average",
            "amd-msr-package-energy",
            _msr.LastSmnError);
    }

    private double? ReadPackageTemperature()
    {
        if (!_msr.ReadSmn(SmnThermTconCurTmp, out uint raw))
            return null;

        double temp = ((raw >> 21) * 125) / 1000.0;
        if ((raw & 0x00080000u) != 0)
            temp -= 49.0;

        temp += _temperatureOffsetC;
        return double.IsFinite(temp) && temp is > -20 and < 150 ? temp : null;
    }

    private double? ReadAverageCoreClock()
    {
        double total = 0;
        int count = 0;

        foreach (CpuCoreTarget core in _cores)
        {
            if (!ReadOn(core, MsrHardwarePstateStatus, out ulong pstate))
                continue;

            double mhz;
            if (_identity.Family == 0x1A)
            {
                uint fid = (uint)(pstate & 0xFFF);
                if (fid == 0)
                    continue;
                mhz = fid * 5.0;
            }
            else
            {
                uint dfsId = (uint)((pstate >> 8) & 0x3F);
                uint fid = (uint)(pstate & 0xFF);
                if (dfsId == 0 || fid == 0)
                    continue;
                mhz = fid / (double)dfsId * 200.0;
            }

            if (ReadOn(core, MsrMperf, out ulong mperf) &&
                ReadOn(core, MsrAperf, out ulong aperf))
            {
                if (_lastMperf.TryGetValue(core, out ulong oldMperf) &&
                    _lastAperf.TryGetValue(core, out ulong oldAperf))
                {
                    ulong mperfDelta = unchecked(mperf - oldMperf);
                    ulong aperfDelta = unchecked(aperf - oldAperf);

                    if (mperfDelta > 0 && aperfDelta < mperfDelta)
                        mhz *= aperfDelta / (double)mperfDelta;
                }

                _lastMperf[core] = mperf;
                _lastAperf[core] = aperf;
            }

            if (!double.IsFinite(mhz) || mhz is <= 0 or > 10000)
                continue;

            total += Math.Round(mhz);
            count++;
        }

        return count == 0 ? null : total / count;
    }

    private double? ReadPackagePower()
    {
        if (_energyUnitJ is null || _energyUnitJ <= 0)
            return null;

        if (!ReadOn(_cores[0], MsrPkgEnergyStat, out ulong raw))
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
        uint previous = _lastEnergy.Value;
        uint delta = unchecked(current - previous);

        _lastEnergy = current;
        _lastEnergyTimestamp = now;

        if (seconds < 0.01)
            return null;

        double watts = delta * _energyUnitJ.Value / seconds;
        return double.IsFinite(watts) && watts is >= 0 and < 5000 ? watts : null;
    }

    private double? ResolveEnergyUnit()
    {
        if (!ReadOn(_cores[0], MsrPwrUnit, out ulong raw))
            return null;

        int exponent = (int)((raw >> 8) & 0x1F);
        return Math.Pow(0.5, exponent);
    }

    private static double ResolveTemperatureOffset(string brand)
    {
        if (brand.Contains("1600X", StringComparison.OrdinalIgnoreCase) ||
            brand.Contains("1700X", StringComparison.OrdinalIgnoreCase) ||
            brand.Contains("1800X", StringComparison.OrdinalIgnoreCase))
            return -20.0;

        if ((brand.Contains("Threadripper", StringComparison.OrdinalIgnoreCase) &&
             (brand.Contains("19", StringComparison.OrdinalIgnoreCase) ||
              brand.Contains("29", StringComparison.OrdinalIgnoreCase))))
            return -27.0;

        if (brand.Contains("2700X", StringComparison.OrdinalIgnoreCase))
            return -10.0;

        return 0.0;
    }

    private bool ReadOn(CpuCoreTarget core, uint msr, out ulong value)
    {
        using var affinity = new CpuAffinityScope(core);
        return _msr.ReadMsr(msr, out value);
    }

    public void Dispose() => _msr.Dispose();
}
