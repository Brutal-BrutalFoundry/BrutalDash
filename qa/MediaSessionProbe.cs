using System;
using Windows.Media.Control;

internal static class MediaSessionProbe
{
    [STAThread]
    private static int Main()
    {
        try
        {
            var manager = GlobalSystemMediaTransportControlsSessionManager
                .RequestAsync()
                .AsTask()
                .GetAwaiter()
                .GetResult();
            var session = manager.GetCurrentSession();
            Console.WriteLine(session == null ? "no-current-session" : session.SourceAppUserModelId);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetBaseException().Message);
            return 2;
        }
    }
}
