<#
.SYNOPSIS
    Provisions a Hyper-V Generation 2 VM for Arch Linux with Helm as the bare-metal desktop environment.
#>

[CmdletBinding()]
param (
    [string]$VmName = "ArchLinux-Helm",
    [string]$VmDir = "D:\Hyper-V\ArchLinux-Helm",
    [int64]$MemoryStartupBytes = 8GB,
    [int]$CpuCount = 4,
    [int64]$DiskSizeBytes = 50GB,
    [string]$IsoPath = "C:\Users\jonny\Downloads\archlinux-2026.09.01-x86_64.iso",
    [string]$SwitchName = ""
)

$logFile = "D:\projects\helm\scripts\create-arch-vm.log"
Start-Transcript -Path $logFile -Force

try {
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  Provisioning Hyper-V Arch Linux VM for Helm Desktop   " -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    # 1. Ensure current user is in Hyper-V Administrators
    $currentUsername = [Environment]::UserName
    Write-Host "`n[1/6] Checking 'Hyper-V Administrators' membership for $currentUsername..." -ForegroundColor Yellow
    try {
        Add-LocalGroupMember -Group "Hyper-V Administrators" -Member $currentUsername -ErrorAction SilentlyContinue
        Write-Host "      User '$currentUsername' added to 'Hyper-V Administrators'." -ForegroundColor Green
    } catch {
        Write-Host "      User '$currentUsername' already in group or could not update: $_" -ForegroundColor Gray
    }

    # 2. Verify ISO path
    Write-Host "`n[2/6] Verifying Arch Linux ISO..." -ForegroundColor Yellow
    if (-not (Test-Path $IsoPath)) {
        throw "Arch Linux ISO not found at: $IsoPath"
    }
    Write-Host "      Found ISO: $IsoPath" -ForegroundColor Green

    # 3. Detect / Select Hyper-V Switch
    Write-Host "`n[3/6] Detecting Virtual Switch..." -ForegroundColor Yellow
    $switches = Get-VMSwitch -ErrorAction SilentlyContinue
    $targetSwitch = $null

    if ($SwitchName -and ($switches | Where-Object { $_.Name -eq $SwitchName })) {
        $targetSwitch = $switches | Where-Object { $_.Name -eq $SwitchName } | Select-Object -First 1
    } elseif ($switches | Where-Object { $_.Name -eq "Default Switch" }) {
        $targetSwitch = $switches | Where-Object { $_.Name -eq "Default Switch" } | Select-Object -First 1
    } elseif ($switches | Where-Object { $_.SwitchType -eq "External" }) {
        $targetSwitch = $switches | Where-Object { $_.SwitchType -eq "External" } | Select-Object -First 1
    } elseif ($switches) {
        $targetSwitch = $switches | Select-Object -First 1
    }

    if ($targetSwitch) {
        Write-Host "      Using virtual switch: $($targetSwitch.Name) ($($targetSwitch.SwitchType))" -ForegroundColor Green
    } else {
        Write-Host "      No virtual switch detected. Network can be attached later." -ForegroundColor Yellow
    }

    # 4. Prepare Paths and VHDX
    Write-Host "`n[4/6] Preparing VM storage..." -ForegroundColor Yellow
    $vhdDir = Join-Path $VmDir "Virtual Hard Disks"
    if (-not (Test-Path $vhdDir)) {
        New-Item -ItemType Directory -Path $vhdDir -Force | Out-Null
    }
    $vhdPath = Join-Path $vhdDir "$VmName.vhdx"

    $existingVM = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if ($existingVM) {
        Write-Host "      VM '$VmName' already exists." -ForegroundColor Yellow
    } else {
        if (-not (Test-Path $vhdPath)) {
            Write-Host "      Creating dynamic VHDX ($([math]::Round($DiskSizeBytes / 1GB)) GB) at $vhdPath..." -ForegroundColor Gray
            New-VHD -Path $vhdPath -SizeBytes $DiskSizeBytes -Dynamic | Out-Null
        }

        Write-Host "      Creating Gen 2 VM '$VmName'..." -ForegroundColor Gray
        $newVmParams = @{
            Name = $VmName
            Path = $VmDir
            Generation = 2
            MemoryStartupBytes = $MemoryStartupBytes
            VHDPath = $vhdPath
        }
        if ($targetSwitch) {
            $newVmParams.SwitchName = $targetSwitch.Name
        }
        New-VM @newVmParams | Out-Null

        # Configure CPU cores
        Set-VMProcessor -VMName $VmName -Count $CpuCount

        # Attach ISO to DVD Drive
        Write-Host "      Attaching Arch Linux ISO to DVD drive..." -ForegroundColor Gray
        $dvd = Add-VMDvdDrive -VMName $VmName -Path $IsoPath -Passthru

        # Configure UEFI Firmware (Disable Secure Boot for Arch development ease)
        Write-Host "      Configuring UEFI firmware (Secure Boot: Off)..." -ForegroundColor Gray
        Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
        Set-VMFirmware -VMName $VmName -FirstBootDevice $dvd

        # Automatic stop action
        Set-VM -VMName $VmName -AutomaticStopAction ShutDown

        Write-Host "      [OK] VM '$VmName' created successfully." -ForegroundColor Green
    }

    # 5. Start VM
    Write-Host "`n[5/6] Starting VM '$VmName'..." -ForegroundColor Yellow
    $currentStatus = (Get-VM -Name $VmName).State
    if ($currentStatus -ne "Running") {
        Start-VM -Name $VmName
        Write-Host "      [OK] VM started." -ForegroundColor Green
    } else {
        Write-Host "      VM is already running." -ForegroundColor Green
    }

    # 6. Launch Hyper-V Console
    Write-Host "`n[6/6] Launching Virtual Machine Connection (vmconnect)..." -ForegroundColor Yellow
    Start-Process "vmconnect.exe" -ArgumentList "localhost", $VmName
    Write-Host "      vmconnect launched." -ForegroundColor Green

    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  Setup complete! Arch Linux is booting in the VM.      " -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green

} catch {
    Write-Error "Failed to provision VM: $_"
} finally {
    Stop-Transcript
}
