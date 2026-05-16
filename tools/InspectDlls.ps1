# InspectDlls.ps1
# Inspects the public API surface of Johnson Controls CCT DLLs via reflection.
# Run once before building the web API to understand available types and methods.
# Output is written to tools\dll-inspection-output.txt

$binDir = "C:\Program Files (x86)\Johnson Controls\CCT\bin"
$outFile = "$PSScriptRoot\dll-inspection-output.txt"

$targetDlls = @(
    "Metasys.DataAccess.dll",
    "Metasys.FCAccess.dll",
    "JCIExtMetasysAPI.dll",
    "JCIExtMetasysAPIHL.dll",
    "MetasysCore.dll",
    "MetasysCommon.dll",
    "MetasysWebServices.dll",
    "JohnsonControls.Tools.Metasys.Objects.dll",
    "JohnsonControls.Tools.Metasys.Applications.Controllers.dll",
    "DataAccessBridgeWrapper.CPPCLI.dll"
)

$results = [System.Text.StringBuilder]::new()

function Write-Section($title) {
    $line = "=" * 80
    $null = $results.AppendLine($line)
    $null = $results.AppendLine($title)
    $null = $results.AppendLine($line)
}

foreach ($dllName in $targetDlls) {
    $dllPath = Join-Path $binDir $dllName
    Write-Section "DLL: $dllName"

    if (-not (Test-Path $dllPath)) {
        $null = $results.AppendLine("  [NOT FOUND at $dllPath]")
        $null = $results.AppendLine()
        continue
    }

    $fileInfo = Get-Item $dllPath
    $null = $results.AppendLine("  Path:     $dllPath")
    $null = $results.AppendLine("  Size:     $([math]::Round($fileInfo.Length / 1KB, 1)) KB")
    $null = $results.AppendLine("  Modified: $($fileInfo.LastWriteTime)")

    try {
        $assembly = [System.Reflection.Assembly]::LoadFrom($dllPath)
        $null = $results.AppendLine("  Loaded:   OK")
        $null = $results.AppendLine("  FullName: $($assembly.FullName)")

        # Target framework
        $tfm = $assembly.GetCustomAttributes($false) | Where-Object { $_.GetType().Name -eq "TargetFrameworkAttribute" }
        if ($tfm) {
            $null = $results.AppendLine("  Target:   $($tfm.FrameworkName)")
        }

        $publicTypes = $assembly.GetExportedTypes() | Sort-Object FullName
        $null = $results.AppendLine("  Public types: $($publicTypes.Count)")
        $null = $results.AppendLine()

        foreach ($type in $publicTypes) {
            $baseTypeName = if ($type.BaseType) { $type.BaseType.Name } else { "" }
            $null = $results.AppendLine("  TYPE: $($type.FullName) [$baseTypeName]")

            # Constructors
            $ctors = $type.GetConstructors([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance)
            foreach ($ctor in $ctors) {
                $params = ($ctor.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
                $null = $results.AppendLine("    .ctor($params)")
            }

            # Public methods (non-inherited)
            $methods = $type.GetMethods([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly) |
                Where-Object { -not $_.IsSpecialName } |
                Sort-Object Name
            foreach ($method in $methods) {
                $params = ($method.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
                $null = $results.AppendLine("    $($method.ReturnType.Name) $($method.Name)($params)")
            }

            # Public properties
            $props = $type.GetProperties([System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::DeclaredOnly) |
                Sort-Object Name
            foreach ($prop in $props) {
                $access = if ($prop.CanRead -and $prop.CanWrite) { "get;set;" } elseif ($prop.CanRead) { "get;" } else { "set;" }
                $null = $results.AppendLine("    PROP $($prop.PropertyType.Name) $($prop.Name) { $access }")
            }

            $null = $results.AppendLine()
        }
    }
    catch {
        $null = $results.AppendLine("  [LOAD ERROR] $_")
        $null = $results.AppendLine()
    }
}

# Also check for any interfaces in the key namespaces
Write-Section "NAMESPACE SEARCH: JohnsonControls.Metasys.DataAccess"
$loaded = [System.AppDomain]::CurrentDomain.GetAssemblies()
foreach ($asm in $loaded) {
    $matching = $asm.GetTypes() | Where-Object { $_.Namespace -like "JohnsonControls.Metasys*" } | Sort-Object FullName
    foreach ($t in $matching) {
        $null = $results.AppendLine("  $($t.FullName) [in $($asm.GetName().Name)]")
    }
}

$output = $results.ToString()
$output | Out-File -FilePath $outFile -Encoding utf8
Write-Host "Done. Output written to: $outFile"
Write-Host "Total output size: $([math]::Round($output.Length / 1KB, 1)) KB"
