$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$evidenceRoot = Join-Path $PSScriptRoot 'M8-B-evidence'
$prefix = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text id="t" x="1" y="2">'
$suffix = '</text></svg>'
$cases = @(
    @{ Name='bare-text'; Body='a & b'; Expected=$false },
    @{ Name='close-text'; Body='a ]]> b'; Expected=$false },
    @{ Name='unknown-entity'; Body='&missing;'; Expected=$false },
    @{ Name='zero-reference'; Body='&#0;'; Expected=$false },
    @{ Name='surrogate-reference'; Body='&#xD800;'; Expected=$false },
    @{ Name='overflow-reference'; Body='&#x110000;'; Expected=$false },
    @{ Name='predefined'; Body='中文 &amp; &lt; &gt; &quot; &apos;'; Expected=$true },
    @{ Name='numeric'; Body='&#38; &#60; &#x3E; &#x1F600;'; Expected=$true },
    @{ Name='cdata'; Body='<![CDATA[中文 & <tag>]]> &amp; <![CDATA[]]]]><![CDATA[>]]>'; Expected=$true }
)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$results = [System.Collections.Generic.List[string]]::new()
foreach ($case in $cases) {
    $path = Join-Path $evidenceRoot ($case.Name + '.svg')
    [System.IO.File]::WriteAllText($path, $prefix + $case.Body + $suffix, $utf8)
    $accepted = $true
    $reader = $null
    try {
        $settings = New-Object System.Xml.XmlReaderSettings
        $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $settings.XmlResolver = $null
        $reader = [System.Xml.XmlReader]::Create($path, $settings)
        while ($reader.Read()) {}
    } catch [System.Xml.XmlException] { $accepted = $false }
    finally { if ($null -ne $reader) { $reader.Dispose() } }
    $codec = & node --input-type=module -e 'import fs from "node:fs"; import {SvgCodec} from "./dist/infrastructure/SvgCodec.js"; try { new SvgCodec().deserialize(fs.readFileSync(process.argv[1],"utf8")); console.log("ACCEPT"); } catch { console.log("REJECT"); }' $path
    if ($LASTEXITCODE -ne 0) { throw 'Codec process failed' }
    if ($accepted -ne $case.Expected -or ($codec -eq 'ACCEPT') -ne $case.Expected) { throw "Crosscheck mismatch: $($case.Name)" }
    $results.Add("$($case.Name): .NET=$accepted Codec=$codec expected=$($case.Expected)")
}
foreach ($name in @('preview.svg', 'roundtrip.svg', 'copy.svg', 'structure.svg')) {
    $document = New-Object System.Xml.XmlDocument
    $document.XmlResolver = $null
    $document.Load((Join-Path $evidenceRoot $name))
    $results.Add("CLI file $name : .NET ACCEPT; elements=$($document.GetElementsByTagName('*').Count)")
}
$results | Set-Content (Join-Path $evidenceRoot 'xml-validation.txt') -Encoding utf8
$results
