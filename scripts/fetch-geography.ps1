param(
    [ValidateSet('boundary', 'settlements', 'roads', 'water')][string]$Layer = 'boundary',
    [string]$Endpoint = 'https://overpass-api.de/api/interpreter'
)
$ErrorActionPreference = 'Stop'
$queries = @{
    boundary = '[out:json][timeout:45];relation(3199272);out geom;'
    settlements = '[out:json][timeout:45];area(3603199272)->.county;(nwr["place"](area.county);nwr["name"~"^(许家山|龙宫|清潭|力洋|东香|西岙|梅枝田|箬岙|前童|梁皇|河洪|上金|海洋|中湖|西翁|张家)(村)?$"](area.county););out geom;'
    roads = '[out:json][timeout:55];area(3603199272)->.county;way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](area.county);out geom;'
    water = '[out:json][timeout:55];area(3603199272)->.county;(way["waterway"~"^(river|stream|canal)$"](area.county);way["natural"="water"](area.county);relation["natural"="water"](area.county););out geom;'
}
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRaw = Join-Path $taskRoot 'data/geography/raw'
New-Item -ItemType Directory -Path $taskRaw -Force | Out-Null
$query = $queries[$Layer]
$retrievedAt = [DateTime]::UtcNow.ToString('o')
$output = Join-Path $taskRaw ($Layer + '.overpass.json')
$metadataPath = Join-Path $taskRaw ($Layer + '.source.json')
$query | Set-Content -LiteralPath (Join-Path $taskRaw ($Layer + '.overpass.ql')) -Encoding utf8
try {
    $response = Invoke-WebRequest -Uri ($Endpoint + '?data=' + [Uri]::EscapeDataString($query)) -Headers @{'User-Agent'='Ninghai-Villages-Local-Research/0.1'} -TimeoutSec 65
    $parsed = $response.Content | ConvertFrom-Json
    if ($parsed.remark) { throw ('Overpass did not complete: ' + $parsed.remark) }
    if (-not $parsed.elements) { throw 'Overpass returned no elements; existing sample was not overwritten.' }
    [IO.File]::WriteAllText($output, $response.Content, [Text.UTF8Encoding]::new($false))
    $metadata = @{source='OpenStreetMap contributors'; endpoint=$Endpoint; query=$query; retrievedAt=$retrievedAt; osmBaseTimestamp=$parsed.osm3s.timestamp_osm_base; coordinateSystem='WGS84'; coordinateOrder='longitude,latitude'; sourceFormat='Overpass JSON'; license='ODbL-1.0'; licenseUrl='https://opendatacommons.org/licenses/odbl/1-0/'; attribution='© OpenStreetMap contributors'; attributionUrl='https://www.openstreetmap.org/copyright'; rawFile=('data/geography/raw/'+$Layer+'.overpass.json'); sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant(); elementCount=@($parsed.elements).Count; status='downloaded'; cost='No key, login or payment; one bounded read-only data query.'}
    $metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding utf8
    [pscustomobject]@{layer=$Layer;elements=$metadata.elementCount;bytes=(Get-Item -LiteralPath $output).Length;osmBase=$metadata.osmBaseTimestamp} | ConvertTo-Json
} catch {
    @{source='OpenStreetMap contributors';endpoint=$Endpoint;query=$query;retrievedAt=$retrievedAt;status='request-failed';error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRaw ($Layer + '.last-failure.json')) -Encoding utf8
    throw
}
