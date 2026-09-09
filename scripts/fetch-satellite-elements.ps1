$ErrorActionPreference = 'Stop'
# Reproducible, offline runtime fixture: geometric J2000 ecliptic elements.
$targets = @(@('Moon',301,399), @('Io',501,599), @('Europa',502,599), @('Ganymede',503,599), @('Callisto',504,599), @('Titan',606,699), @('Enceladus',602,699), @('Titania',703,799), @('Triton',801,899), @('Charon',901,999), @('Phobos',401,499), @('Earth',399,10), @('Pluto',999,10))
$data = [ordered]@{}
foreach ($target in $targets) {
  $uri = "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='$($target[1])'&CENTER='500@$($target[2])'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&TLIST='2451545.0'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'"
  $result = (Invoke-RestMethod -Uri $uri).result
  $block = [regex]::Match($result, '(?s)\$\$SOE(.*?)\$\$EOE').Groups[1].Value
  if (!$block) { throw "No ephemeris for $($target[0]): $result" }
  $fields = [ordered]@{source=$uri; epochJD=2451545.0}
  foreach ($pair in @(@('aAU','A'),@('e','EC'),@('iDeg','IN'),@('lanDeg','OM'),@('argpDeg','W'),@('mDeg','MA'),@('periodDays','PR'))) {
    $match = [regex]::Match($block, "\b$($pair[1])\s*=\s*([\d.E+\-]+)")
    if (!$match.Success) { throw "Missing $($pair[1])" }
    $fields[$pair[0]] = [double]::Parse($match.Groups[1].Value, [cultureinfo]::InvariantCulture)
  }
  $data[$target[0]] = $fields
}
$data | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../content/solarSatelliteElements.json')
