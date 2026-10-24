$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:USERPROFILE 'Android\Sdk' }
$ndkRoot = Join-Path $sdkRoot 'ndk\25.2.9519653'
$toolchainBin = Join-Path $ndkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$sourceDir = Join-Path $projectRoot 'android\native-symbols\datastore-1.1.7'
$buildDir = Join-Path $projectRoot 'android\build\datastore-symbol-build'

if (-not (Test-Path (Join-Path $toolchainBin 'llvm-objcopy.exe'))) {
    throw "Android NDK 25.2.9519653 was not found under $sdkRoot."
}
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$targets = @(
    @{ Abi = 'arm64-v8a'; Compiler = 'aarch64-linux-android24-clang++.cmd'; Extra = @() },
    @{ Abi = 'armeabi-v7a'; Compiler = 'armv7a-linux-androideabi24-clang++.cmd'; Extra = @('-march=armv7-a') },
    @{ Abi = 'x86'; Compiler = 'i686-linux-android24-clang++.cmd'; Extra = @() },
    @{ Abi = 'x86_64'; Compiler = 'x86_64-linux-android24-clang++.cmd'; Extra = @() }
)

foreach ($target in $targets) {
    $compiler = Join-Path $toolchainBin $target.Compiler
    if (-not (Test-Path $compiler)) { throw "NDK compiler not found: $compiler" }
    $outputDir = Join-Path $buildDir $target.Abi
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    $outputFile = Join-Path $outputDir 'libdatastore_shared_counter.so'
    $compilerArgs = @(
        '-shared', '-fPIC', '-O2', '-g', '-fno-limit-debug-info', '-std=c++17',
        '-Wall', '-Werror', '-static-libstdc++', '-Wl,--build-id=sha1',
        '-Wl,-z,max-page-size=16384', '-Wl,-z,common-page-size=16384',
        '-Wl,-soname,libdatastore_shared_counter.so'
    ) + $target.Extra + @(
        (Join-Path $sourceDir 'shared_counter.cc'),
        (Join-Path $sourceDir 'androidx_datastore_core_SharedCounter.cc'),
        '-o', $outputFile
    )
    & $compiler @compilerArgs
    if ($LASTEXITCODE -ne 0) { throw "DataStore native build failed for $($target.Abi) with exit code $LASTEXITCODE." }

    $readelf = Join-Path $toolchainBin 'llvm-readelf.exe'
    $debugSections = & $readelf -S $outputFile | Select-String '\.debug_info|\.debug_line|\.symtab'
    if ($LASTEXITCODE -ne 0 -or $debugSections.Count -lt 3) {
        throw "Built DataStore library for $($target.Abi) is missing expected debug sections."
    }
}

Write-Output "Built AndroidX DataStore native libraries with debug information for $($targets.Count) ABIs: $buildDir"
