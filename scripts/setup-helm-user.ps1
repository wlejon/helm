<#
.SYNOPSIS
    Provisions a dedicated Windows user account for Helm Desktop Environment shell testing.

.DESCRIPTION
    Sets up a separate local user (e.g. HelmDE) configured to launch helm.exe directly
    as its Winlogon shell instead of explorer.exe. This isolates shell testing from your
    primary user account.

.PARAMETER Username
    The name of the local user account to create or configure (default: "HelmDE").

.PARAMETER Action
    The action to perform:
    - "create": Creates the local user account and configures its shell.
    - "configure-shell": Configures the user's Winlogon\Shell to point to helm.exe.
    - "revert-shell": Restores the user's Winlogon\Shell back to "explorer.exe".
    - "status": Displays the current shell configuration for the user.

.PARAMETER HelmPath
    Path to the helm executable (default: D:\projects\helm\build\Release\helm.exe).

.EXAMPLE
    .\setup-helm-user.ps1 -Action create -Username "HelmDE"
    .\setup-helm-user.ps1 -Action status -Username "HelmDE"
    .\setup-helm-user.ps1 -Action revert-shell -Username "HelmDE"
#>

[CmdletBinding()]
param (
    [string]$Username = "HelmDE",
    [ValidateSet("create", "configure-shell", "revert-shell", "status")]
    [string]$Action = "status",
    [string]$HelmPath = "D:\projects\helm\build\Release\helm.exe"
)

function Test-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-UserSid([string]$user) {
    try {
        $ntAccount = New-Object System.Security.Principal.NTAccount($user)
        $sid = $ntAccount.Translate([System.Security.Principal.SecurityIdentifier])
        return $sid.Value
    } catch {
        return $null
    }
}

Write-Host "=== Helm Desktop Environment Windows Shell Provisioning ===" -ForegroundColor Cyan
Write-Host "Target User: $Username"
Write-Host "Helm Binary: $HelmPath"
Write-Host ""

# Verify helm binary existence
if (Test-Path $HelmPath) {
    Write-Host "[OK] Helm binary found at: $HelmPath" -ForegroundColor Green
} else {
    Write-Host "[WARN] Helm binary not yet built at: $HelmPath" -ForegroundColor Yellow
}

$sid = Get-UserSid $Username

switch ($Action) {
    "status" {
        if (-not $sid) {
            Write-Host "User '$Username' does not exist on this machine." -ForegroundColor Yellow
            Write-Host "Run with -Action create (as Administrator) to create the account."
            return
        }

        Write-Host "User '$Username' exists (SID: $sid)." -ForegroundColor Green
        
        $userKey = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
        if (Test-Path $userKey) {
            $shellVal = (Get-ItemProperty -Path $userKey -Name "Shell" -ErrorAction SilentlyContinue).Shell
            if ($shellVal) {
                Write-Host "Configured Winlogon Shell: $shellVal" -ForegroundColor Cyan
            } else {
                Write-Host "No custom shell set in user hive (defaults to system explorer.exe)." -ForegroundColor Gray
            }
        } else {
            Write-Host "User registry hive not loaded (user has not logged in or hive unloaded)." -ForegroundColor Gray
        }
    }

    "create" {
        if (-not (Test-Admin)) {
            Write-Error "Creating a local user requires Administrator privileges. Please re-run in an elevated PowerShell session."
            return
        }

        if (-not (Test-Path $HelmPath)) {
            Write-Warning "Helm binary not found at $HelmPath. Ensure you have built helm before logging into the session."
        }

        # Check if user already exists
        $existing = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "User '$Username' already exists." -ForegroundColor Yellow
        } else {
            Write-Host "Creating local user '$Username'..." -ForegroundColor Cyan
            $password = Read-Host "Enter password for $Username" -AsSecureString
            New-LocalUser -Name $Username -Password $password -FullName "Helm Desktop Environment" -Description "User account for Helm standalone shell"
            Add-LocalGroupMember -Group "Users" -Member $Username
            Write-Host "[OK] Created user '$Username'." -ForegroundColor Green
        }

        Write-Host "`nTo set Helm as the shell for ${Username}:" -ForegroundColor Cyan
        Write-Host "1. Log into Windows as '$Username' once to create its user profile."
        Write-Host "2. From that session, or as Administrator, run:"
        Write-Host "   .\setup-helm-user.ps1 -Action configure-shell -Username `"$Username`""
    }

    "configure-shell" {
        if (-not (Test-Path $HelmPath)) {
            Write-Error "Cannot configure shell: Helm binary does not exist at '$HelmPath'."
            return
        }

        # If configuring for current user
        if ($env:USERNAME -ieq $Username) {
            $regPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
            Set-ItemProperty -Path $regPath -Name "Shell" -Value $HelmPath
            Write-Host "[OK] Successfully set shell for current user ($Username) to:" -ForegroundColor Green
            Write-Host "     $HelmPath" -ForegroundColor White
            return
        }

        # Configuring via SID for another user
        if (-not (Test-Admin)) {
            Write-Error "Configuring another user's shell registry requires Administrator privileges."
            return
        }

        if (-not $sid) {
            Write-Error "User '$Username' not found."
            return
        }

        $userKey = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
        if (-not (Test-Path $userKey)) {
            # Attempt to load the user's NTUSER.DAT if not currently loaded
            $profilePath = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
            if ($profilePath -and (Test-Path "$profilePath\NTUSER.DAT")) {
                reg load "HKU\$sid" "$profilePath\NTUSER.DAT"
                $loaded = $true
            }
        }

        if (Test-Path $userKey) {
            Set-ItemProperty -Path $userKey -Name "Shell" -Value $HelmPath
            Write-Host "[OK] Successfully configured Winlogon\Shell for $Username ($sid) to:" -ForegroundColor Green
            Write-Host "     $HelmPath" -ForegroundColor White
        } else {
            Write-Host "[NOTE] Profile hive for $Username is not loaded." -ForegroundColor Yellow
            Write-Host "Please log into the '$Username' account once, and run this script from inside that user session."
        }

        if ($loaded) {
            [GC]::Collect()
            reg unload "HKU\$sid"
        }
    }

    "revert-shell" {
        if ($env:USERNAME -ieq $Username) {
            $regPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
            Set-ItemProperty -Path $regPath -Name "Shell" -Value "explorer.exe"
            Write-Host "[OK] Reverted shell for $Username back to explorer.exe" -ForegroundColor Green
            return
        }

        if (-not (Test-Admin)) {
            Write-Error "Reverting another user's shell registry requires Administrator privileges."
            return
        }

        $userKey = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
        if (Test-Path $userKey) {
            Set-ItemProperty -Path $userKey -Name "Shell" -Value "explorer.exe"
            Write-Host "[OK] Reverted Winlogon\Shell for $Username ($sid) back to explorer.exe" -ForegroundColor Green
        } else {
            Write-Host "User hive not loaded. Run from inside '$Username' session to revert." -ForegroundColor Yellow
        }
    }
}
