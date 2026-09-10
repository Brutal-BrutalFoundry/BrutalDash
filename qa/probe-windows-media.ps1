$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRT($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  try {
    return $task.GetAwaiter().GetResult()
  } catch {
    # Preserve the actual WinRT failure instead of only reporting AggregateException.
    $cause = $_.Exception
    while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
    throw $cause
  }
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$manager = Await-WinRT ($managerType::RequestAsync()) $managerType
$session = $manager.GetCurrentSession()
if ($null -eq $session) {
  @{ active = $false } | ConvertTo-Json -Compress
  exit 0
}

$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$properties = Await-WinRT ($session.TryGetMediaPropertiesAsync()) $propertiesType
$playback = $session.GetPlaybackInfo()
$timeline = $session.GetTimelineProperties()
@{
  active = $true
  source = $session.SourceAppUserModelId
  title = $properties.Title
  artist = $properties.Artist
  album = $properties.AlbumTitle
  status = [string]$playback.PlaybackStatus
  positionMs = [math]::Round($timeline.Position.TotalMilliseconds)
  durationMs = [math]::Round($timeline.EndTime.TotalMilliseconds)
  hasThumbnail = $null -ne $properties.Thumbnail
} | ConvertTo-Json -Compress
