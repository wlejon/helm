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
    - "agent-access": Lets an agent in another account operate the user's helm session
      over ssh, as on a Linux box: installs OpenSSH Server listening on loopback only,
      key authentication only, for this user only, with Git Bash as the login shell,
      and authorizes -PublicKey. Then `ssh <user>@localhost bro-ctl ...` reaches the
      session's helm (bro docs/agent-control.md).
    - "revoke-agent-access": Stops and disables the OpenSSH Server service.

.PARAMETER HelmPath
    Path to the helm executable (default: D:\projects\helm\build\Release\helm.exe).

.PARAMETER PublicKey
    The public key "agent-access" authorizes (default: the running user's ~\.ssh\id_ed25519.pub).

.EXAMPLE
    .\setup-helm-user.ps1 -Action create -Username "HelmDE"
    .\setup-helm-user.ps1 -Action status -Username "HelmDE"
    .\setup-helm-user.ps1 -Action revert-shell -Username "HelmDE"
#>

[CmdletBinding()]
param (
    [string]$Username = "HelmDE",
    [ValidateSet("create", "configure-shell", "revert-shell", "status", "agent-access", "revoke-agent-access")]
    [string]$Action = "status",
    [string]$HelmPath = "D:\projects\helm\build\Release\helm.exe",
    [string]$PublicKey = "$env:USERPROFILE\.ssh\id_ed25519.pub"
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

    "agent-access" {
        if (-not (Test-Admin)) {
            Write-Error "Installing and configuring OpenSSH Server requires Administrator privileges."
            return
        }
        if (-not $sid) {
            Write-Error "User '$Username' not found."
            return
        }
        if (-not (Test-Path $PublicKey)) {
            Write-Error "Public key not found at '$PublicKey' (pass -PublicKey)."
            return
        }

        # 1. OpenSSH Server.
        $cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*' | Select-Object -First 1
        if ($cap.State -ne 'Installed') {
            Write-Host "Installing $($cap.Name)..." -ForegroundColor Cyan
            Add-WindowsCapability -Online -Name $cap.Name | Out-Null
        }
        $cfg = "$env:ProgramData\ssh\sshd_config"
        if (-not (Test-Path $cfg)) {
            # The first start writes the default config and the host keys.
            Start-Service sshd
            Stop-Service sshd
        }

        # 2. Loopback only, keys only, this user only. sshd takes the first value
        #    it reads for a keyword, so the block goes at the top (the default
        #    file ends in a Match block, which must stay last).
        $begin = '# helm agent-access begin'
        $end = '# helm agent-access end'
        $text = Get-Content $cfg -Raw
        $text = [regex]::Replace($text, "(?s)$([regex]::Escape($begin)).*?$([regex]::Escape($end))\r?\n?", '')
        $block = @(
            $begin,
            'ListenAddress 127.0.0.1',
            'ListenAddress ::1',
            'PubkeyAuthentication yes',
            'PasswordAuthentication no',
            "AllowUsers $($Username.ToLower())",
            $end
        ) -join "`r`n"
        Set-Content -Path $cfg -Value ($block + "`r`n" + $text) -Encoding ascii -NoNewline

        # 3. The key, readable by the user, SYSTEM and Administrators only
        #    (sshd refuses an authorized_keys others can write).
        $profilePath = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
        if (-not $profilePath) {
            Write-Error "No profile for '$Username' yet: log into it once first."
            return
        }
        $sshDir = Join-Path $profilePath '.ssh'
        New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
        $keys = Join-Path $sshDir 'authorized_keys'
        Copy-Item -Path $PublicKey -Destination $keys -Force
        foreach ($p in @($sshDir, $keys)) {
            icacls $p /inheritance:r /grant "${Username}:F" "*S-1-5-18:F" "*S-1-5-32-544:F" | Out-Null
        }

        # 4. Git Bash as the login shell, so commands read as they do on Linux.
        $bash = 'C:\Program Files\Git\bin\bash.exe'
        if (Test-Path $bash) {
            New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null
            New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value $bash -PropertyType String -Force | Out-Null
        }

        # 5. sshd listens on loopback only; the capability's inbound rule goes too.
        Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Disable-NetFirewallRule

        Set-Service -Name sshd -StartupType Automatic
        Restart-Service sshd
        Write-Host "[OK] sshd on loopback for '$Username' with key $PublicKey" -ForegroundColor Green
        Write-Host "     Try: ssh $($Username.ToLower())@localhost whoami"
    }

    "revoke-agent-access" {
        if (-not (Test-Admin)) {
            Write-Error "Stopping the OpenSSH Server service requires Administrator privileges."
            return
        }
        Stop-Service sshd -ErrorAction SilentlyContinue
        Set-Service -Name sshd -StartupType Disabled -ErrorAction SilentlyContinue
        Write-Host "[OK] sshd stopped and disabled." -ForegroundColor Green
    }
}
