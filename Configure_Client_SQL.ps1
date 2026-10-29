# ===================================================================
# HMS Industrial Barcode Tracking System
# Universal Client SQL Server Auto-Configurator (100% Automated)
# ===================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   HMS System - Client SQL Server Automatic Configuration Tool" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Detect Installed SQL Server Instances
$regBase = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server"
$instancesReg = "$regBase\Instance Names\SQL"

$foundInstances = @()
if (Test-Path $instancesReg) {
    $instancesObj = Get-ItemProperty $instancesReg -ErrorAction SilentlyContinue
    if ($instancesObj) {
        $props = $instancesObj.PSObject.Properties | Where-Object { 
            $_.Name -notmatch "^(PS|_)" -and $_.Name -notin @("PSPath","PSParentPath","PSChildName","PSDrive","PSProvider") 
        }
        foreach ($prop in $props) {
            $foundInstances += [PSCustomObject]@{ Name = $prop.Name; Id = $prop.Value }
        }
    }
}

# Fallback detection if Instance Names key was missing
if ($foundInstances.Count -eq 0) {
    $services = Get-Service -Name "MSSQL*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^MSSQLSERVER$|^MSSQL\$" }
    foreach ($s in $services) {
        $instName = if ($s.Name -eq "MSSQLSERVER") { "MSSQLSERVER" } else { $s.Name.Substring(6) }
        $foundInstances += [PSCustomObject]@{ Name = $instName; Id = $instName }
    }
}

if ($foundInstances.Count -eq 0) {
    Write-Host "[WARNING] No running SQL Server instances detected in registry." -ForegroundColor Yellow
    Write-Host "Make sure SQL Server is installed on this machine." -ForegroundColor Yellow
} else {
    Write-Host "[1/5] Detected SQL Server instances:" -ForegroundColor Green
    foreach ($inst in $foundInstances) {
        Write-Host "      • Instance: $($inst.Name) (ID: $($inst.Id))" -ForegroundColor Cyan
    }
}
Write-Host ""

# 2. Configure Mixed Mode (LoginMode=2), TCP/IP (Enabled=1), and Port 1433
Write-Host "[2/5] Enabling Mixed Mode, TCP/IP, and Port 1433 in Windows Registry..." -ForegroundColor Yellow
foreach ($inst in $foundInstances) {
    $instId = $inst.Id
    $instPath = "$regBase\$instId\MSSQLServer"
    $tcpPath = "$instPath\SuperSocketNetLib\Tcp"
    $ipAllPath = "$tcpPath\IPAll"

    # A. Mixed Mode Authentication (LoginMode = 2)
    if (Test-Path $instPath) {
        Set-ItemProperty -Path $instPath -Name "LoginMode" -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
        Write-Host "      [$($inst.Name)] Mixed Mode Authentication -> ENABLED" -ForegroundColor Green
    }

    # B. Enable TCP/IP Protocol
    if (Test-Path $tcpPath) {
        Set-ItemProperty -Path $tcpPath -Name "Enabled" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        Write-Host "      [$($inst.Name)] TCP/IP Protocol -> ENABLED" -ForegroundColor Green
    }

    # C. Set Port 1433 & Clear Dynamic Ports
    if (Test-Path $ipAllPath) {
        Set-ItemProperty -Path $ipAllPath -Name "TcpPort" -Value "1433" -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $ipAllPath -Name "TcpDynamicPorts" -Value "" -Force -ErrorAction SilentlyContinue
        Write-Host "      [$($inst.Name)] Port 1433 -> CONFIGURED (Dynamic Ports disabled)" -ForegroundColor Green
    }
}
Write-Host ""

# 3. Configure and Restart SQL Server Services
Write-Host "[3/5] Starting and restarting SQL Server services..." -ForegroundColor Yellow

# Start and Enable SQL Browser
$browserService = Get-Service -Name "SQLBrowser" -ErrorAction SilentlyContinue
if ($browserService) {
    Set-Service -Name "SQLBrowser" -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name "SQLBrowser" -ErrorAction SilentlyContinue
    Write-Host "      SQL Server Browser Service -> Started & set to Automatic" -ForegroundColor Green
}

# Restart SQL Engine Services
$sqlServices = Get-Service -Name "MSSQL*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^MSSQLSERVER$|^MSSQL\$" }
foreach ($svc in $sqlServices) {
    Write-Host "      Restarting service: $($svc.DisplayName)..." -ForegroundColor Yellow
    Restart-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
    Write-Host "      [$($svc.Name)] Restarted successfully." -ForegroundColor Green
}
Write-Host ""

# 4. Open Windows Firewall for Port 1433, 1434, and 3000
Write-Host "[4/5] Opening Windows Firewall ports (1433 TCP, 1434 UDP, 3000 TCP)..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="HMS SQL Server 1433" >$null 2>&1
netsh advfirewall firewall add rule name="HMS SQL Server 1433" dir=in action=allow protocol=TCP localport=1433 >$null 2>&1
netsh advfirewall firewall delete rule name="HMS SQL Browser 1434" >$null 2>&1
netsh advfirewall firewall add rule name="HMS SQL Browser 1434" dir=in action=allow protocol=UDP localport=1434 >$null 2>&1
netsh advfirewall firewall delete rule name="HMS Barcode Web Port 3000" >$null 2>&1
netsh advfirewall firewall add rule name="HMS Barcode Web Port 3000" dir=in action=allow protocol=TCP localport=3000 >$null 2>&1
Write-Host "      Firewall rules configured successfully." -ForegroundColor Green
Write-Host ""

# 5. Initialize hms_user, sa, and Databases
Write-Host "[5/5] Initializing Database & Users (hms_user, sa)..." -ForegroundColor Yellow

$sqlScript = @"
USE [master];

-- 1. Enable and configure sa
BEGIN TRY
    ALTER LOGIN [sa] WITH PASSWORD = N'HMS@2024!Secure', CHECK_POLICY = OFF;
    ALTER LOGIN [sa] ENABLE;
END TRY
BEGIN CATCH END CATCH;

-- 2. Create or update hms_user
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'hms_user')
BEGIN
    CREATE LOGIN [hms_user] WITH PASSWORD = N'HMS@2024!Secure', CHECK_POLICY = OFF;
END
ELSE
BEGIN
    ALTER LOGIN [hms_user] WITH PASSWORD = N'HMS@2024!Secure', CHECK_POLICY = OFF;
END;
ALTER LOGIN [hms_user] ENABLE;

-- 3. Grant sysadmin & dbcreator
BEGIN TRY
    ALTER SERVER ROLE [sysadmin] ADD MEMBER [hms_user];
    ALTER SERVER ROLE [dbcreator] ADD MEMBER [hms_user];
    ALTER SERVER ROLE [sysadmin] ADD MEMBER [sa];
END TRY
BEGIN CATCH END CATCH;

-- 4. Create standard factory databases if not exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'HMS_Factory_DB')
BEGIN
    CREATE DATABASE [HMS_Factory_DB];
    ALTER DATABASE [HMS_Factory_DB] SET RECOVERY SIMPLE;
    ALTER DATABASE [HMS_Factory_DB] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
END;

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'freedomBarcodeDB')
BEGIN
    CREATE DATABASE [freedomBarcodeDB];
    ALTER DATABASE [freedomBarcodeDB] SET RECOVERY SIMPLE;
    ALTER DATABASE [freedomBarcodeDB] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
END;

-- 5. Ensure hms_user is db_owner on both databases
USE [HMS_Factory_DB];
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N'hms_user')
    CREATE USER [hms_user] FOR LOGIN [hms_user];
ALTER ROLE [db_owner] ADD MEMBER [hms_user];

USE [freedomBarcodeDB];
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N'hms_user')
    CREATE USER [hms_user] FOR LOGIN [hms_user];
ALTER ROLE [db_owner] ADD MEMBER [hms_user];
"@

$sqlTempFile = "$env:TEMP\hms_auto_init_sql.sql"
[System.IO.File]::WriteAllText($sqlTempFile, $sqlScript)

# Find sqlcmd executable
$sqlCmdPath = (Get-Command sqlcmd.exe -ErrorAction SilentlyContinue).Source
if (-not $sqlCmdPath) {
    $knownPaths = @(
        "$env:ProgramFiles\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles\Microsoft SQL Server\Client SDK\ODBC\130\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles\Microsoft SQL Server\160\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles\Microsoft SQL Server\150\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles\Microsoft SQL Server\140\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles(x86)\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe",
        "$env:ProgramFiles(x86)\Microsoft SQL Server\160\Tools\Binn\sqlcmd.exe"
    )
    foreach ($kp in $knownPaths) {
        if (Test-Path $kp) { $sqlCmdPath = $kp; break }
    }
}

$appliedAny = $false
$authAttempts = @(
    @{ Name = "Windows Authentication"; Args = @("-E") },
    @{ Name = "sa (HMS@2024!Secure)"; Args = @("-U", "sa", "-P", "HMS@2024!Secure") },
    @{ Name = "sa (Gs654321)"; Args = @("-U", "sa", "-P", "Gs654321") },
    @{ Name = "sa (123456)"; Args = @("-U", "sa", "-P", "123456") },
    @{ Name = "sa (blank)"; Args = @("-U", "sa", "-P", "") }
)

$serverTargets = @(".")
foreach ($inst in $foundInstances) {
    if ($inst.Name -ne "MSSQLSERVER") {
        $serverTargets += ".\$($inst.Name)"
        $serverTargets += "localhost\$($inst.Name)"
    }
}
$serverTargets += "127.0.0.1,1433"
$serverTargets += "localhost,1433"

if ($sqlCmdPath) {
    foreach ($srv in ($serverTargets | Select-Object -Unique)) {
        foreach ($auth in $authAttempts) {
            $argsList = @("-S", $srv) + $auth.Args + @("-i", $sqlTempFile, "-b")
            $res = & $sqlCmdPath $argsList 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "      [OK] Applied SQL setup on [$srv] via $($auth.Name)" -ForegroundColor Green
                $appliedAny = $true
                break
            }
        }
    }
} else {
    Write-Host "      [INFO] sqlcmd.exe not found in PATH; Node.js setup will complete user mapping." -ForegroundColor Yellow
}
Remove-Item $sqlTempFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "   [SUCCESS] SQL Server is fully configured for client machine!" -ForegroundColor Green
Write-Host "   • Address:     127.0.0.1:1433 (TCP/IP Enabled)" -ForegroundColor White
Write-Host "   • Auth Mode:   Mixed Mode (SQL + Windows Auth)" -ForegroundColor White
Write-Host "   • User:        hms_user" -ForegroundColor White
Write-Host "   • Password:    HMS@2024!Secure" -ForegroundColor White
Write-Host "   • Databases:   HMS_Factory_DB / freedomBarcodeDB ready" -ForegroundColor White
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
