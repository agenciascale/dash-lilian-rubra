#requires -Version 5
<#
  build.ps1 - Dashboard de trafego (SEGUIDORES / VISITAS AO PERFIL) - Lilian Mesquita (conta "Rubra")
  Fonte 1: Meta Graph API (insights nivel anuncio, por dia) -> midia + VISITAS AO PERFIL DO INSTAGRAM (campo instagram_profile_visits) + follows da API (referencia).
  IMPORTANTE: usamos `instagram_profile_visits` (coluna "Visitas ao perfil do Instagram"), NAO `results`/`total_profile_visits`
  (que e "Visitas ao perfil E A PAGINA" = Resultado, ~5x maior por incluir pagina do FB). Escolha do Leandro: so o perfil do IG.
  Fonte 2: planilha da Lilian (abas mensais) -> coluna "Seguid." (N) = seguidores lancados a mao (numero-verdade).
  Token da Meta vem de $env:META_ACCESS_TOKEN (secret do GitHub Actions / .env local).

  Conta dedicada a SEGUIDORES (uma frente). Campanhas incluidas (historico desde o comeco da gestao, p/ comparativo):
    - LM | E1-DIST | ... | Visitas no Perfil   (padrao da agencia)
    - Ganho de seguidores 02/04/2026           (campanha antiga, pre-nomenclatura)
  Imposto x1.1385 sobre TODO gasto (Meta Ads). CTR sempre de LINK.

  Modelo: daily[] (funil por dia) + grain[] (dia x campanha x conjunto x anuncio) + followers[] ({d,gain} da planilha).
  Metricas de resultado: visits = visitas ao perfil (API) ; gain = seguidores manuais (planilha). follows = follows atribuidos pela API (so referencia).
  Publica so agregados (sem PII).
#>
param([string]$Mode = "all")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------- CONFIG ----------------
$ACCOUNT   = "act_1490434912872704"   # Lilian Mesquita / conta "Rubra"
$API_VER   = "v21.0"
$TAX       = 1.1385                    # imposto Meta Ads
$START     = "2026-03-01"             # inicio do reporting (1a campanha ~24/03; planilha comeca em Abr)

# INCLUI so campanhas de seguidores/perfil (todas as dela sao dessas; descarta stray futuro)
$INCLUDE_RX = '(?i)(e1[-\s]?dist|seguidor|perfil|visita)'

# planilha da Lilian (seguidores manuais na coluna "Seguid." = N das abas mensais; M = invest c/ imposto)
$SHEET_ID   = "1ESPchuMZHmXrDIyl5N8Kzy9i20Et0-9EkDVXe_DhSNs"
# fallback de gids caso a descoberta via htmlview falhe (Abr..Ago; NAO ha aba de Jun nessa planilha)
$FALLBACK_TABS = @{
  "1774656171" = "Abr"; "1713917476" = "Mai"; "1819205739" = "Jul"; "580767448" = "Ago"
}

$OutFile = Join-Path $PSScriptRoot "data.js"

$TOKEN = $env:META_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($TOKEN)) {
  # fallback: le do .env local (nunca commitado) pra rodar na maquina
  $envFile = Join-Path $PSScriptRoot ".env"
  if (Test-Path $envFile) {
    foreach ($ln in [IO.File]::ReadAllLines($envFile)) {
      if ($ln -match '^\s*META_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $TOKEN = $matches[1].Trim('"').Trim("'") }
    }
  }
}
if ([string]::IsNullOrWhiteSpace($TOKEN)) { throw "META_ACCESS_TOKEN nao definido (env nem .env)." }
# secret colado costuma vir com \n/espaco/aspas no fim -> Meta rejeita (code 190). Limpa.
$TOKEN = $TOKEN.Trim().Trim('"').Trim("'").Trim()

$today = ([DateTime]::UtcNow.AddHours(-3)).ToString("yyyy-MM-dd")   # BRT

# ---------------- HELPERS ----------------
function ToNum($s) { $o = 0.0; [double]::TryParse(("$s"), [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$o) | Out-Null; return $o }
function JsonStr($items) {
  if (-not $items -or $items.Count -eq 0) { return "[]" }
  $parts = foreach ($it in $items) { $it | ConvertTo-Json -Compress -Depth 6 }
  return "[" + ($parts -join ",") + "]"
}

# ---------------- FETCH (Meta Graph API) ----------------
Write-Host "Buscando insights (nivel ad, por dia) de $START ate $today ..."
$fields = "campaign_name,adset_name,ad_name,ad_id,impressions,reach,clicks,inline_link_clicks,spend,instagram_profile_visits,instagram_profile_follow_v2"
$tr = '{"since":"' + $START + '","until":"' + $today + '"}'
$url = "https://graph.facebook.com/$API_VER/$ACCOUNT/insights"
$qs  = "?level=ad&time_increment=1&limit=500&fields=$fields&time_range=$tr&access_token=$TOKEN"
$next = $url + $qs

$rows = New-Object System.Collections.Generic.List[object]
$page = 0
while ($next) {
  $resp = Invoke-RestMethod -Uri $next -Method Get
  if ($resp.data) { foreach ($d in $resp.data) { $rows.Add($d) } }
  $page++
  $next = if ($resp.paging -and $resp.paging.next) { $resp.paging.next } else { $null }
}
Write-Host ("  paginas: {0} | linhas ad-dia (brutas): {1}" -f $page, $rows.Count)

# ---------------- AGREGACAO MIDIA ----------------
$grain = New-Object System.Collections.Generic.List[object]
$dd = @{}   # date -> agregados do funil
$adIds = @{}  # ad_name -> ad_id (p/ buscar o link do criativo depois)
$skipped = 0
foreach ($r in $rows) {
  $day = ("$($r.date_start)").Trim()
  if ($day -notmatch '^\d{4}-\d{2}-\d{2}$') { continue }
  $camp = ("$($r.campaign_name)").Trim()
  if ($camp -notmatch $INCLUDE_RX) { $skipped++; continue }
  $adNm = ("$($r.ad_name)").Trim()
  if ($adNm -and $r.ad_id) { $adIds[$adNm] = "$($r.ad_id)" }
  $spend  = (ToNum $r.spend) * $TAX
  $impr   = [int](ToNum $r.impressions); $reach = [int](ToNum $r.reach)
  $clk    = [int](ToNum $r.inline_link_clicks)        # cliques no LINK (CTR sempre de link)
  $visits = [int](ToNum $r.instagram_profile_visits)  # visitas ao perfil DO INSTAGRAM (so IG, nao a Pagina do FB) - escolha do Leandro
  $follows= [int](ToNum $r.instagram_profile_follow_v2) # follows atribuidos pela API (referencia)
  $grain.Add([ordered]@{
    d=$day; camp=$camp; adset=("$($r.adset_name)").Trim(); ad=("$($r.ad_name)").Trim();
    spend=[math]::Round($spend,2); impr=$impr; reach=$reach; clk=$clk; visits=$visits; follows=$follows
  })
  if (-not $dd.ContainsKey($day)) { $dd[$day] = @{ spend=0.0; impr=0; reach=0; clk=0; visits=0; follows=0 } }
  $dd[$day].spend += $spend; $dd[$day].impr += $impr; $dd[$day].reach += $reach
  $dd[$day].clk += $clk; $dd[$day].visits += $visits; $dd[$day].follows += $follows
}
Write-Host ("  linhas fora do padrao (descartadas): {0} | linhas mantidas: {1}" -f $skipped, $grain.Count)

$daily = New-Object System.Collections.Generic.List[object]
$allDays = New-Object System.Collections.Generic.SortedSet[string]
foreach ($k in $dd.Keys) { [void]$allDays.Add($k) }
foreach ($day in $allDays) {
  $a = $dd[$day]
  $daily.Add([ordered]@{ d=$day; spend=[math]::Round($a.spend,2); impr=$a.impr; reach=$a.reach;
    clk=$a.clk; visits=$a.visits; follows=$a.follows })
}
$totVis=0; ($dd.Values | ForEach-Object { $totVis += $_.visits })
$totSpend=0.0; ($dd.Values | ForEach-Object { $totSpend += $_.spend })
Write-Host ("  dias: {0} | gasto c/imposto R$ {1:n2} | visitas ao perfil: {2}" -f $daily.Count, $totSpend, $totVis)

# ---------------- SEGUIDORES (planilha manual, coluna "Seguid." = N das abas mensais) ----------------
Write-Host "Lendo seguidores manuais (coluna N / Seguid. das abas mensais) ..."
$wc = New-Object System.Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
$monTabs = @{}
try {
  $html = $wc.DownloadString("https://docs.google.com/spreadsheets/d/$SHEET_ID/htmlview")
  foreach ($m in [regex]::Matches($html, 'name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"')) {
    $nm = $m.Groups[1].Value; $gid = $m.Groups[2].Value
    if ($nm -match '(?i)(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\s*$') { $monTabs[$gid] = $nm }
  }
} catch { }
if ($monTabs.Count -eq 0) { $monTabs = $FALLBACK_TABS }
Write-Host ("  abas mensais encontradas: {0}" -f $monTabs.Count)

function Parse-CsvLine([string]$line) {
  $out = New-Object System.Collections.Generic.List[string]
  $cur = New-Object System.Text.StringBuilder; $inQ = $false
  for ($i=0; $i -lt $line.Length; $i++) {
    $ch = $line[$i]
    if ($inQ) {
      if ($ch -eq '"') { if ($i+1 -lt $line.Length -and $line[$i+1] -eq '"') { [void]$cur.Append('"'); $i++ } else { $inQ = $false } }
      else { [void]$cur.Append($ch) }
    } elseif ($ch -eq '"') { $inQ = $true }
    elseif ($ch -eq ',') { [void]$out.Add($cur.ToString()); $cur.Clear() | Out-Null }
    else { [void]$cur.Append($ch) }
  }
  [void]$out.Add($cur.ToString())
  return $out
}

$fmap = @{}   # yyyy-MM-dd -> seguidores (soma se repetir data)
foreach ($gid in $monTabs.Keys) {
  try {
    $csv = $wc.DownloadString("https://docs.google.com/spreadsheets/d/$SHEET_ID/gviz/tq?tqx=out:csv&gid=$gid&_=" + [DateTime]::UtcNow.Ticks)
  } catch { continue }
  foreach ($line in ($csv -split "`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $f = Parse-CsvLine $line
    if ($f.Count -lt 14) { continue }
    # colunas (idx do A): 1=Data(B, DD/MM/YYYY) ... 13=Seguid.(N)
    $dataRaw = ("$($f[1])").Trim()
    $segRaw  = ("$($f[13])").Trim()
    if ($dataRaw -notmatch '^(\d{1,2})/(\d{1,2})/(\d{4})') { continue }
    $dd2 = "{0:D2}" -f [int]$matches[1]; $mm2 = "{0:D2}" -f [int]$matches[2]; $yy = $matches[3]
    $iso = "$yy-$mm2-$dd2"
    $segClean = ($segRaw -replace '[^\d\-]', '')
    if ($segClean -eq '' -or $segClean -eq '-') { continue }
    $seg = 0; if (-not [int]::TryParse($segClean, [ref]$seg)) { continue }
    if ($seg -le 0) { continue }
    if ($fmap.ContainsKey($iso)) { $fmap[$iso] += $seg } else { $fmap[$iso] = $seg }
  }
}
$followers = New-Object System.Collections.Generic.List[object]
$fdays = New-Object System.Collections.Generic.SortedSet[string]
foreach ($k in $fmap.Keys) { [void]$fdays.Add($k) }
$totFol = 0
foreach ($d in $fdays) { $followers.Add([ordered]@{ d=$d; gain=$fmap[$d] }); $totFol += $fmap[$d] }
Write-Host ("  dias com seguidores: {0} | total de seguidores (planilha): {1}" -f $followers.Count, $totFol)

# ---------------- LINKS DOS ANUNCIOS (permalink do Instagram do criativo) ----------------
Write-Host "Buscando link do Instagram de cada anuncio (instagram_permalink_url) ..."
$adLinks = [ordered]@{}   # ad_name -> https://www.instagram.com/p/...
foreach ($nm in $adIds.Keys) {
  $aid = $adIds[$nm]
  try {
    $u = "https://graph.facebook.com/$API_VER/$aid`?fields=creative%7Binstagram_permalink_url,effective_object_story_id%7D&access_token=$TOKEN"
    $cr = Invoke-RestMethod -Uri $u -Method Get
    $link = ""
    if ($cr.creative -and $cr.creative.instagram_permalink_url) { $link = "$($cr.creative.instagram_permalink_url)" }
    elseif ($cr.creative -and $cr.creative.effective_object_story_id) { $link = "https://www.facebook.com/" + ("$($cr.creative.effective_object_story_id)" -replace '_', '/posts/') }
    if ($link) { $adLinks[$nm] = $link }
  } catch { }
}
Write-Host ("  anuncios com link: {0}/{1}" -f $adLinks.Count, $adIds.Count)

# ---------------- OUTPUT data.js ----------------
$now = [DateTime]::UtcNow.AddHours(-3)   # BRT
$meta = [ordered]@{ generatedAt = $now.ToString("yyyy-MM-dd HH:mm"); tz="BRT"; tax=$TAX;
  client="Lilian Mesquita (Rubra)"; account=$ACCOUNT; start=$START;
  folSheet=$SHEET_ID; folTabs=@([string[]]($monTabs.Keys | Sort-Object)) }

$js = "window.DASH=" + ($meta | ConvertTo-Json -Compress -Depth 4) + ";" + [Environment]::NewLine
$js += "window.DASH.daily="     + (JsonStr $daily)     + ";" + [Environment]::NewLine
$js += "window.DASH.grain="     + (JsonStr $grain)     + ";" + [Environment]::NewLine
$js += "window.DASH.followers=" + (JsonStr $followers) + ";" + [Environment]::NewLine
$adLinksJson = if ($adLinks.Count -gt 0) { $adLinks | ConvertTo-Json -Compress -Depth 3 } else { "{}" }
$js += "window.DASH.adLinks="   + $adLinksJson + ";" + [Environment]::NewLine

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($OutFile, $js, $utf8NoBom)
Write-Host ("OK -> {0} ({1:n0} bytes) | dias={2} grain={3} followers={4}" -f $OutFile, (Get-Item $OutFile).Length, $daily.Count, $grain.Count, $followers.Count)
