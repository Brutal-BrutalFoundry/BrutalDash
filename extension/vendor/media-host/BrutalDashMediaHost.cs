using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Text.RegularExpressions;
using Windows.Media.Control;

// Hidden Windows helper for PC-native now-playing state, transport, artwork,
// and per-app volume. It deliberately has no phone or master-volume fallback.
internal static class BrutalDashMediaHost
{
    private const int S_OK = 0;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var request = Request.Parse(args);
            if (request.VerifyUnicode)
            {
                WriteMedia(true, null, "Spotify", "Beyonc\u00e9 \u00d8resund", "\u041f\u0440\u0438\u0432\u0435\u0442 \u65e5\u672c\u8a9e", "\ud83d\udc97", "paused", 0, 0, null);
                return 0;
            }
            if (request.Snapshot || request.Command != null)
            {
                var manager = GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask().GetAwaiter().GetResult();
                var mediaSession = manager.GetCurrentSession();
                if (mediaSession == null)
                {
                    WriteMedia(false, "no-active-windows-media-session", null, null, null, null, null, 0, 0, null);
                    return 3;
                }

                if (request.Command != null)
                {
                    bool accepted;
                    switch (request.Command)
                    {
                        case "previous": accepted = mediaSession.TrySkipPreviousAsync().AsTask().GetAwaiter().GetResult(); break;
                        case "next": accepted = mediaSession.TrySkipNextAsync().AsTask().GetAwaiter().GetResult(); break;
                        case "playPause": accepted = mediaSession.TryTogglePlayPauseAsync().AsTask().GetAwaiter().GetResult(); break;
                        default: throw new ArgumentException("invalid media command");
                    }
                    if (!accepted)
                    {
                        WriteMedia(false, "windows-media-command-rejected", mediaSession.SourceAppUserModelId, null, null, null, null, 0, 0, null);
                        return 4;
                    }
                }

                var properties = mediaSession.TryGetMediaPropertiesAsync().AsTask().GetAwaiter().GetResult();
                var playback = mediaSession.GetPlaybackInfo();
                var timeline = mediaSession.GetTimelineProperties();
                var positionMs = timeline == null ? 0 : (long)timeline.Position.TotalMilliseconds;
                var durationMs = timeline == null ? 0 : (long)timeline.EndTime.TotalMilliseconds;
                if (timeline != null && playback != null && playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                {
                    positionMs += Math.Max(0, (long)(DateTimeOffset.Now - timeline.LastUpdatedTime).TotalMilliseconds);
                    if (durationMs > 0) positionMs = Math.Min(positionMs, durationMs);
                }
                string artwork = null;
                if (request.IncludeArtwork && properties != null && properties.Thumbnail != null)
                {
                    try
                    {
                        var stream = properties.Thumbnail.OpenReadAsync().AsTask().GetAwaiter().GetResult();
                        using (var input = stream.AsStreamForRead())
                        using (var output = new MemoryStream())
                        {
                            using (var sourceImage = Image.FromStream(input))
                            using (var thumbnail = new Bitmap(160, 160))
                            using (var graphics = Graphics.FromImage(thumbnail))
                            {
                                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                                graphics.DrawImage(sourceImage, 0, 0, 160, 160);
                                var jpeg = ImageCodecInfo.GetImageEncoders().First(codec => codec.MimeType == "image/jpeg");
                                using (var parameters = new EncoderParameters(1))
                                {
                                    parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 85L);
                                    thumbnail.Save(output, jpeg, parameters);
                                }
                            }
                            artwork = "data:image/jpeg;base64," + Convert.ToBase64String(output.ToArray());
                        }
                    }
                    catch { artwork = null; }
                }
                WriteMedia(true, null, mediaSession.SourceAppUserModelId,
                    properties == null ? null : properties.Title,
                    properties == null ? null : properties.Artist,
                    properties == null ? null : properties.AlbumTitle,
                    playback == null ? null : playback.PlaybackStatus.ToString().ToLowerInvariant(),
                    positionMs,
                    durationMs,
                    artwork);
                return 0;
            }

            var sessions = ActiveSessions().ToList();
            var target = SelectSession(sessions, request.Hint);
            if (target == null)
            {
                Write(false, "no-matching-active-media-session", null, null);
                return 3;
            }

            if (request.Delta.HasValue)
            {
                var next = Math.Max(0f, Math.Min(1f, target.Volume + request.Delta.Value));
                var context = Guid.Empty;
                ThrowIfFailed(target.SimpleVolume.SetMasterVolume(next, ref context), "SetMasterVolume");
                target.Volume = next;
            }

            Write(true, null, target.ProcessName, target.Volume);
            return 0;
        }
        catch (Exception error)
        {
            Write(false, error.GetBaseException().Message, null, null);
            return 2;
        }
    }

    private static IEnumerable<AudioSession> ActiveSessions()
    {
        var enumeratorType = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), true);
        var deviceEnumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumeratorType);
        IMMDevice device = null;
        IAudioSessionManager2 manager = null;
        IAudioSessionEnumerator sessions = null;
        try
        {
            ThrowIfFailed(deviceEnumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device), "GetDefaultAudioEndpoint");
            var managerGuid = typeof(IAudioSessionManager2).GUID;
            object managerObject;
            ThrowIfFailed(device.Activate(ref managerGuid, CLSCTX.ALL, IntPtr.Zero, out managerObject), "IMMDevice.Activate");
            manager = (IAudioSessionManager2)managerObject;
            ThrowIfFailed(manager.GetSessionEnumerator(out sessions), "GetSessionEnumerator");
            int count;
            ThrowIfFailed(sessions.GetCount(out count), "GetCount");
            for (var index = 0; index < count; index++)
            {
                IAudioSessionControl control = null;
                try
                {
                    ThrowIfFailed(sessions.GetSession(index, out control), "GetSession");
                    var control2 = control as IAudioSessionControl2;
                    var simple = control as ISimpleAudioVolume;
                    if (control2 == null || simple == null) continue;
                    AudioSessionState state;
                    ThrowIfFailed(control.GetState(out state), "GetState");
                    if (state != AudioSessionState.Active) continue;
                    uint processId;
                    ThrowIfFailed(control2.GetProcessId(out processId), "GetProcessId");
                    if (processId == 0) continue;
                    string processName;
                    try { processName = Process.GetProcessById((int)processId).ProcessName; }
                    catch { continue; }
                    float volume;
                    ThrowIfFailed(simple.GetMasterVolume(out volume), "GetMasterVolume");
                    yield return new AudioSession(processName, volume, simple);
                    // Keep this COM identity alive until the one-shot helper exits.
                    // Releasing control here can invalidate the ISimpleAudioVolume
                    // interface obtained from the same COM object.
                    control = null;
                    simple = null;
                }
                finally
                {
                    if (control != null) Marshal.ReleaseComObject(control);
                }
            }
        }
        finally
        {
            if (sessions != null) Marshal.ReleaseComObject(sessions);
            if (manager != null) Marshal.ReleaseComObject(manager);
            if (device != null) Marshal.ReleaseComObject(device);
            if (deviceEnumerator != null) Marshal.ReleaseComObject(deviceEnumerator);
        }
    }

    private static AudioSession SelectSession(IList<AudioSession> sessions, string hint)
    {
        var token = Token(hint);
        if (token.Length < 2) return null;
        var aliases = Aliases(token);
        var matches = sessions.Where(session => aliases.Any(alias => Token(session.ProcessName).Contains(alias) || alias.Contains(Token(session.ProcessName)))).ToList();
        // Refuse ambiguous selections. A wheel turn must never alter Discord, a
        // browser, or system audio merely because the intended player is absent.
        return matches.Count == 1 ? matches[0] : null;
    }

    private static IEnumerable<string> Aliases(string token)
    {
        yield return token;
        if (token.Contains("spotify")) yield return "spotify";
        if (token.Contains("applemusic") || token.Contains("itunes")) { yield return "applemusic"; yield return "itunes"; }
        if (token.Contains("youtube")) yield return "youtubemusic";
        if (token.Contains("vlc")) yield return "vlc";
        if (token.Contains("musicbee")) yield return "musicbee";
        if (token.Contains("foobar")) yield return "foobar";
        if (token.Contains("tidal")) yield return "tidal";
        if (token.Contains("deezer")) yield return "deezer";
        if (token.Contains("amazonmusic")) yield return "amazonmusic";
    }

    private static string Token(string value)
    {
        return new string((value ?? String.Empty).Where(Char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
    }

    private static void ThrowIfFailed(int result, string operation)
    {
        if (result != S_OK) Marshal.ThrowExceptionForHR(result);
    }

    private static void Write(bool ok, string error, string process, float? volume)
    {
        Console.WriteLine("{\"ok\":" + (ok ? "true" : "false")
            + ",\"error\":" + Json(error)
            + ",\"process\":" + Json(process)
            + ",\"volume\":" + (volume.HasValue ? volume.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null") + "}");
    }

    private static void WriteMedia(bool ok, string error, string source, string title, string artist, string album, string playback, long positionMs, long durationMs, string artwork)
    {
        Console.WriteLine("{\"ok\":" + (ok ? "true" : "false")
            + ",\"error\":" + Json(error)
            + ",\"source\":" + Json(source)
            + ",\"title\":" + Json(title)
            + ",\"artist\":" + Json(artist)
            + ",\"album\":" + Json(album)
            + ",\"playback\":" + Json(playback)
            + ",\"positionMs\":" + positionMs.ToString(CultureInfo.InvariantCulture)
            + ",\"durationMs\":" + durationMs.ToString(CultureInfo.InvariantCulture)
            + ",\"artwork\":" + Json(artwork) + "}");
    }

    private static string Json(string value)
    {
        if (value == null) return "null";
        // The Deno extension consumes this process pipe as UTF-8, while Windows
        // console output can still use an OEM code page. Escaping every non-ASCII
        // UTF-16 unit keeps titles in every language lossless through that pipe.
        var json = new StringBuilder(value.Length + 8);
        json.Append('"');
        foreach (var character in value)
        {
            switch (character)
            {
                case '\\': json.Append("\\\\"); break;
                case '"': json.Append("\\\""); break;
                case '\b': json.Append("\\b"); break;
                case '\f': json.Append("\\f"); break;
                case '\n': json.Append("\\n"); break;
                case '\r': json.Append("\\r"); break;
                case '\t': json.Append("\\t"); break;
                default:
                    if (character < 0x20 || character > 0x7e) json.Append("\\u").Append(((int)character).ToString("X4", CultureInfo.InvariantCulture));
                    else json.Append(character);
                    break;
            }
        }
        json.Append('"');
        return json.ToString();
    }

    private sealed class AudioSession
    {
        internal AudioSession(string processName, float volume, ISimpleAudioVolume simpleVolume)
        {
            ProcessName = processName;
            Volume = volume;
            SimpleVolume = simpleVolume;
        }
        internal readonly string ProcessName;
        internal float Volume;
        internal readonly ISimpleAudioVolume SimpleVolume;
    }

    private sealed class Request
    {
        internal float? Delta;
        internal string Hint;
        internal bool Snapshot;
        internal bool IncludeArtwork;
        internal string Command;
        internal bool VerifyUnicode;
        internal static Request Parse(string[] args)
        {
            var request = new Request();
            for (var index = 0; index < args.Length; index++)
            {
                if (args[index] == "--hint" && index + 1 < args.Length) request.Hint = args[++index];
                if (args[index] == "--snapshot") request.Snapshot = true;
                if (args[index] == "--artwork") request.IncludeArtwork = true;
                if (args[index] == "--verify-unicode") request.VerifyUnicode = true;
                if (args[index] == "--command" && index + 1 < args.Length) request.Command = args[++index];
                if (args[index] == "--delta" && index + 1 < args.Length)
                {
                    float delta;
                    if (!Single.TryParse(args[++index], NumberStyles.Float, CultureInfo.InvariantCulture, out delta)) throw new ArgumentException("invalid volume delta");
                    request.Delta = Math.Max(-1f, Math.Min(1f, delta));
                }
            }
            return request;
        }
    }

    private enum EDataFlow { eRender, eCapture, eAll }
    private enum ERole { eConsole, eMultimedia, eCommunications }
    private enum AudioSessionState { Inactive = 0, Active = 1, Expired = 2 }
    [Flags] private enum CLSCTX { INPROC_SERVER = 1, INPROC_HANDLER = 2, LOCAL_SERVER = 4, REMOTE_SERVER = 16, ALL = INPROC_SERVER | INPROC_HANDLER | LOCAL_SERVER | REMOTE_SERVER }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out object devices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        int Activate(ref Guid iid, CLSCTX context, IntPtr activationParameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        int OpenPropertyStore(int access, out object properties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        int GetAudioSessionControl(IntPtr sessionGuid, int streamFlags, out IAudioSessionControl control);
        int GetSimpleAudioVolume(IntPtr sessionGuid, int streamFlags, out ISimpleAudioVolume volume);
        int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
        int RegisterSessionNotification(IntPtr notification);
        int UnregisterSessionNotification(IntPtr notification);
        int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr notification);
        int UnregisterDuckNotification(IntPtr notification);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        int GetCount(out int count);
        int GetSession(int index, out IAudioSessionControl session);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl
    {
        int GetState(out AudioSessionState state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        int GetGroupingParam(out Guid group);
        int SetGroupingParam(ref Guid group, ref Guid context);
        int RegisterAudioSessionNotification(IntPtr notification);
        int UnregisterAudioSessionNotification(IntPtr notification);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2 : IAudioSessionControl
    {
        new int GetState(out AudioSessionState state);
        new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        new int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
        new int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        new int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
        new int GetGroupingParam(out Guid group);
        new int SetGroupingParam(ref Guid group, ref Guid context);
        new int RegisterAudioSessionNotification(IntPtr notification);
        new int UnregisterAudioSessionNotification(IntPtr notification);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out uint processId);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid context);
        int GetMasterVolume(out float level);
        int SetMute(bool mute, ref Guid context);
        int GetMute(out bool mute);
    }
}
