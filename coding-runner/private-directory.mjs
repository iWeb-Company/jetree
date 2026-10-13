import { chmod, lstat } from 'node:fs/promises';
import { command } from './process.mjs';

// POSIX mode bits do not restrict Windows files. Set and verify the actual DACL
// before copying project contents or creating temporary credential files.
const protect = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$target = $env:JETREE_CODE_PRIVATE_DIRECTORY
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$allowed = @($identity.Value, 'S-1-5-18', 'S-1-5-32-544')
$directory = [System.IO.DirectoryInfo]::new($target)
$acl = $directory.GetAccessControl()
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) { $acl.RemoveAccessRuleSpecific($rule) }
foreach ($sid in $allowed) { $principal = [Security.Principal.SecurityIdentifier]::new($sid); $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')) }
$directory.SetAccessControl($acl)
$checked = $directory.GetAccessControl()
$rules = @($checked.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (-not $checked.AreAccessRulesProtected -or $rules.Count -ne 3) { throw 'PRIVATE_DIRECTORY_FAILED' }
foreach ($rule in $rules) { if ($rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $allowed -notcontains $rule.IdentityReference.Value) { throw 'PRIVATE_DIRECTORY_FAILED' } }
'{"private":true}'
`;

export async function ensurePrivateDirectory(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  if (process.platform === 'win32') {
    try {
      const result = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(protect, 'utf16le').toString('base64')], { env: { JETREE_CODE_PRIVATE_DIRECTORY: directory }, maxBytes: 4096 });
      if (JSON.parse(result.trim()).private !== true) throw new Error();
    } catch { throw new Error('PRIVATE_DIRECTORY_FAILED'); }
  } else {
    await chmod(directory, 0o700);
    if ((await lstat(directory)).mode & 0o077) throw new Error('PRIVATE_DIRECTORY_FAILED');
  }
}
