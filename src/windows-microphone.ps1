$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$recorder = $null
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-microphone.cs')
  [PiBotMicrophone]::Emit('{"type":"ready"}')
  while ($null -ne ($requestLine = [Console]::ReadLine())) {
    try {
      $request = $requestLine | ConvertFrom-Json
      switch ($request.action) {
        'devices' { $names = @([PiBotMicrophone]::Devices()); [PiBotMicrophone]::Emit((@{type='devices'; names=$names} | ConvertTo-Json -Compress)) }
        'start' { if ($null -ne $recorder) { $recorder.Dispose() }; $recorder = New-Object -TypeName PiBotMicrophone -ArgumentList @([int]$request.device, [string]$request.id, [bool]$request.stream); [PiBotMicrophone]::Emit((@{type='listening'; id=$request.id} | ConvertTo-Json -Compress)) }
        'finish' { if ($null -ne $recorder) { $recorder.Finish(); $recorder=$null } }
        'cancel' { if ($null -ne $recorder) { $recorder.Dispose(); $recorder=$null }; [PiBotMicrophone]::Emit('{"type":"cancelled"}') }
        'close' { break }
      }
      if ($request.action -eq 'close') { break }
    } catch { [PiBotMicrophone]::Emit((@{type='error'; id=$request.id; error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
  }
} finally { if ($null -ne $recorder) { $recorder.Dispose() } }
