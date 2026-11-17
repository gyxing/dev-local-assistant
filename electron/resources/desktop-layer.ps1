param(
  [Parameter(Mandatory = $true)]
  [long]$WindowHandle
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DesktopBottom {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    public static bool SendToBottom(long handle) {
        IntPtr hWnd = new IntPtr(handle);
        // HWND_BOTTOM = 1, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
        return SetWindowPos(hWnd, new IntPtr(1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    }
}
"@

if (-not [DesktopBottom]::SendToBottom($WindowHandle)) {
  exit 1
}
