; Run before Electron Builder checks whether the previous app can be replaced.
; Close is graceful first so Electron can finish its normal shutdown work. A
; lingering process is then terminated only so a normal upgrade never asks the
; customer to find and close Stockroom manually.
!macro customInit
  !insertmacro nsProcess::CloseProcess "Stockroom Business.exe" $0
  Sleep 1500
  !insertmacro nsProcess::FindProcess "Stockroom Business.exe" $0
  ${If} $0 == 0
    !insertmacro nsProcess::KillProcess "Stockroom Business.exe" $0
  ${EndIf}
!macroend
