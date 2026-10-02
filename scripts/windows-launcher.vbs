' Use the GUI script host so Windows Terminal never opens a console.
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
launcher = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "windows-launcher.ps1")
command = "powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & launcher & """"
If WScript.Arguments.Count > 0 Then
    If WScript.Arguments(0) = "-Background" Then command = command & " -Background"
End If
shell.Run command, 0, False
