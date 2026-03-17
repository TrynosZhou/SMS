# PowerShell script to convert USER_MANUAL.md to Word-compatible HTML
$mdFile = "USER_MANUAL.md"
$outputFile = "USER_MANUAL.doc"

if (-not (Test-Path $mdFile)) {
    Write-Host "Error: $mdFile not found!"
    exit 1
}

$content = Get-Content $mdFile -Raw -Encoding UTF8

# Create Word-compatible HTML
$html = @"
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<meta name=ProgId content=Word.Document>
<meta name=Generator content='Microsoft Word'>
<title>School Management System - User Manual</title>
<!--[if gte mso 9]><xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
 </w:WordDocument>
</xml><![endif]-->
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; }
h1 { font-size: 24pt; font-weight: bold; color: #2c3e50; margin-top: 24pt; margin-bottom: 12pt; }
h2 { font-size: 18pt; font-weight: bold; color: #667eea; margin-top: 18pt; margin-bottom: 10pt; border-bottom: 2pt solid #e9ecef; padding-bottom: 6pt; }
h3 { font-size: 14pt; font-weight: bold; color: #764ba2; margin-top: 14pt; margin-bottom: 8pt; }
p { margin-top: 6pt; margin-bottom: 6pt; }
ul, ol { margin-top: 6pt; margin-bottom: 6pt; padding-left: 24pt; }
li { margin-top: 3pt; margin-bottom: 3pt; }
code { font-family: 'Courier New', monospace; font-size: 10pt; background-color: #f4f4f4; padding: 2pt 4pt; }
blockquote { border-left: 4pt solid #667eea; padding-left: 12pt; margin: 12pt 0; color: #666; font-style: italic; }
strong { font-weight: bold; color: #2c3e50; }
em { font-style: italic; color: #666; }
hr { border: none; border-top: 2pt solid #e9ecef; margin: 18pt 0; }
</style>
</head>
<body>
"@

# Convert markdown to HTML
$htmlContent = $content

# Headers
$htmlContent = $htmlContent -replace '(?m)^# (.*)$', '<h1>$1</h1>'
$htmlContent = $htmlContent -replace '(?m)^## (.*)$', '<h2>$1</h2>'
$htmlContent = $htmlContent -replace '(?m)^### (.*)$', '<h3>$1</h3>'

# Bold and italic
$htmlContent = $htmlContent -replace '\*\*(.*?)\*\*', '<strong>$1</strong>'
$htmlContent = $htmlContent -replace '(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)', '<em>$1</em>'

# Code
$htmlContent = $htmlContent -replace '`([^`]+)`', '<code>$1</code>'

# Blockquotes
$htmlContent = $htmlContent -replace '(?m)^> (.*)$', '<blockquote>$1</blockquote>'

# Horizontal rules
$htmlContent = $htmlContent -replace '(?m)^---$', '<hr>'

# Lists - numbered
$htmlContent = $htmlContent -replace '(?m)^(\d+)\. (.*)$', '<li>$2</li>'

# Lists - bullet
$htmlContent = $htmlContent -replace '(?m)^- (.*)$', '<li>$1</li>'
$htmlContent = $htmlContent -replace '(?m)^\* (.*)$', '<li>$1</li>'

# Wrap consecutive list items in ul tags
$htmlContent = $htmlContent -replace '(?s)(<li>.*?</li>\s*)+', { 
    $listItems = $_.Value
    $listItems = $listItems -replace '\s+', ' '
    "<ul>$listItems</ul>"
}

# Paragraphs
$htmlContent = $htmlContent -replace '\r?\n\r?\n', '</p><p>'
$htmlContent = $htmlContent -replace '\r?\n', ' '

# Wrap in paragraph tags
$htmlContent = '<p>' + $htmlContent + '</p>'

# Clean up - remove paragraph tags around block elements
$htmlContent = $htmlContent -replace '<p>(<h[1-6]>)', '$1'
$htmlContent = $htmlContent -replace '(</h[1-6]>)</p>', '$1'
$htmlContent = $htmlContent -replace '<p>(<ul>)', '$1'
$htmlContent = $htmlContent -replace '(</ul>)</p>', '$1'
$htmlContent = $htmlContent -replace '<p>(<hr>)', '$1'
$htmlContent = $htmlContent -replace '(</hr>)</p>', '$1'
$htmlContent = $htmlContent -replace '<p>(<blockquote>)', '$1'
$htmlContent = $htmlContent -replace '(</blockquote>)</p>', '$1'
$htmlContent = $htmlContent -replace '<p></p>', ''

# Clean up multiple spaces
$htmlContent = $htmlContent -replace ' +', ' '

$html += $htmlContent
$html += '</body></html>'

# Save as .doc (Word-compatible HTML)
[System.IO.File]::WriteAllText((Resolve-Path .).Path + "\$outputFile", $html, [System.Text.Encoding]::UTF8)

Write-Host "Word document created successfully: $outputFile"
Write-Host "You can open this file in Microsoft Word and save it as .docx format if needed."

