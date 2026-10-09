param([string]$Endpoint = 'https://overpass-api.de/api/interpreter')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRaw = Join-Path $taskRoot 'data/geography/raw'
$points = @(@{id='xujiashan';lat=29.3211666;lon=121.5337458},@{id='longgong';lat=29.3753662;lon=121.2721072},@{id='qingtan';lat=29.4315601;lon=121.2881886},@{id='meizhitian';lat=29.2348314;lon=121.506495},@{id='ruoao';lat=29.184526;lon=121.4779495})
$clauses = foreach($point in $points) {
    'way["building"](around:1000,' + $point.lat + ',' + $point.lon + ');'
    'way["highway"](around:1000,' + $point.lat + ',' + $point.lon + ');'
    'way["waterway"](around:1000,' + $point.lat + ',' + $point.lon + ');'
}
$query = '[out:json][timeout:50];(' + ($clauses -join '') + ');out geom;'
$query | Set-Content -LiteralPath (Join-Path $taskRaw 'village-detail.overpass.ql') -Encoding utf8
$retrievedAt = [DateTime]::UtcNow.ToString('o')
try {
    $response = Invoke-WebRequest -Uri ($Endpoint + '?data=' + [Uri]::EscapeDataString($query)) -Headers @{'User-Agent'='Ninghai-Villages-Local-Research/0.2'} -TimeoutSec 60
    $parsed = $response.Content | ConvertFrom-Json
    if($parsed.remark){throw $parsed.remark}
    if(-not $parsed.elements){throw 'No mapped detail returned; no geometry invented.'}
    $output = Join-Path $taskRaw 'village-detail.overpass.json'
    [IO.File]::WriteAllText($output,$response.Content,[Text.UTF8Encoding]::new($false))
    @{source='OpenStreetMap contributors';endpoint=$Endpoint;query=$query;retrievedAt=$retrievedAt;osmBaseTimestamp=$parsed.osm3s.timestamp_osm_base;coordinateSystem='WGS84';coordinateOrder='longitude,latitude';license='ODbL-1.0';licenseUrl='https://opendatacommons.org/licenses/odbl/1-0/';attribution='© OpenStreetMap contributors';attributionUrl='https://www.openstreetmap.org/copyright';rawFile='data/geography/raw/village-detail.overpass.json';sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();elementCount=@($parsed.elements).Count;status='downloaded';queryCoverage=$points;radiusMeters=1000;scope='Mapped building ways, highways and waterway ways within 1km of each of five village label points; not a complete cadastral survey';cost='One bounded read-only request, no key, login, payment or tile download'} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRaw 'village-detail.source.json') -Encoding utf8
    [pscustomobject]@{elements=@($parsed.elements).Count;bytes=(Get-Item -LiteralPath $output).Length} | ConvertTo-Json
}catch{
    @{endpoint=$Endpoint;query=$query;retrievedAt=$retrievedAt;status='request-failed';error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRaw 'village-detail.last-failure.json') -Encoding utf8
    throw
}
