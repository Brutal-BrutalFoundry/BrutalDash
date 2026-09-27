using System.Text.Json;

namespace BrutalDashCpuHost;

internal static class Program
{
    private static void Emit(object payload)
    {
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }

    public static int Main()
    {
        PawnIoProvisionResult pawn = PawnIoProvisioning.Ensure();
        if (!pawn.Ready)
        {
            Emit(new
            {
                ok = false,
                error = pawn.Error,
                pawnIoInstalled = pawn.PawnIoInstalled,
                pawnIoVersion = pawn.PawnIoVersion,
                restartRequired = pawn.RestartRequired
            });
            return 0;
        }

        try
        {
            CpuIdentity cpu = CpuIdentity.Read();

            if (cpu.IsIntel)
            {
                using var telemetry = new IntelTelemetry(cpu);
                return Run(cpu, pawn, telemetry.Read);
            }

            if (cpu.IsAmd)
            {
                using var telemetry = new AmdZenTelemetry(cpu);
                return Run(cpu, pawn, telemetry.Read);
            }

            Emit(new
            {
                ok = false,
                error = "cpu-vendor-unsupported",
                pawnIoInstalled = pawn.PawnIoInstalled,
                pawnIoVersion = pawn.PawnIoVersion,
                cpuName = cpu.Brand
            });
            return 0;
        }
        catch (Exception ex)
        {
            Emit(new
            {
                ok = false,
                error = $"{ex.GetType().Name}:{ex.Message}",
                pawnIoInstalled = pawn.PawnIoInstalled,
                pawnIoVersion = pawn.PawnIoVersion
            });
            return 0;
        }
    }

    private static int Run(
        CpuIdentity cpu,
        PawnIoProvisionResult pawn,
        Func<CpuTelemetryReading> read)
    {
        while (true)
        {
            CpuTelemetryReading value = read();
            bool ok = value.TempC is not null ||
                      value.ClockMHz is not null ||
                      value.PowerW is not null;

            Emit(new
            {
                ok,
                error = value.TemperatureError ?? (ok ? null : "cpu-sensors-unavailable"),
                pawnIoInstalled = pawn.PawnIoInstalled,
                pawnIoVersion = pawn.PawnIoVersion,
                cpuName = cpu.Brand,
                cpuVendor = cpu.IsIntel ? "Intel" : "AMD",
                cpuTempSensor = value.TemperatureSource,
                cpuClockSensor = value.ClockSource,
                cpuPowerSensor = value.PowerSource,
                cpuTemp = value.TempC,
                cpuClock = value.ClockMHz,
                cpuPower = value.PowerW
            });

            Thread.Sleep(500);
        }
    }
}
