# Probe only the isolated local backend after it has been started.
# This helper performs GETs only; it does not start/stop services or touch a database.
$base = 'http://127.0.0.1:4314'
$client = [System.Net.Http.HttpClient]::new()
try {
  $results = foreach ($path in @('/health', '/unknown')) {
    $response = $client.GetAsync("$base$path").GetAwaiter().GetResult()
    [pscustomobject]@{
      path = $path
      status = [int]$response.StatusCode
      body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }
    $response.Dispose()
  }
  $results | ConvertTo-Json -Depth 3
}
finally {
  $client.Dispose()
}
