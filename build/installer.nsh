; Register an Open with choice without changing the user's default DOCX app.
!macro customInstall
  WriteRegStr HKLM "Software\Classes\NebulaDOCX.Document" "" "Word document (Nebula DOCX)"
  WriteRegStr HKLM "Software\Classes\NebulaDOCX.Document\DefaultIcon" "" '"$INSTDIR\Nebula DOCX.exe",0'
  WriteRegStr HKLM "Software\Classes\NebulaDOCX.Document\shell\open\command" "" '"$INSTDIR\Nebula DOCX.exe" "%1"'
  WriteRegNone HKLM "Software\Classes\.docx\OpenWithProgids" "NebulaDOCX.Document"
  WriteRegStr HKLM "Software\Classes\Applications\Nebula DOCX.exe" "FriendlyAppName" "Nebula DOCX"
  WriteRegStr HKLM "Software\Classes\Applications\Nebula DOCX.exe\SupportedTypes" ".docx" ""
  WriteRegStr HKLM "Software\Classes\Applications\Nebula DOCX.exe\shell\open\command" "" '"$INSTDIR\Nebula DOCX.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Classes\.docx\OpenWithProgids" "NebulaDOCX.Document"
  DeleteRegKey /ifempty HKLM "Software\Classes\.docx\OpenWithProgids"
  DeleteRegKey HKLM "Software\Classes\NebulaDOCX.Document"
  DeleteRegKey HKLM "Software\Classes\Applications\Nebula DOCX.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
