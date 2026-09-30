#!/bin/bash
# 정찰/취약점 스캐너 4종(기본콘텐츠·백업 스캐너, HTTP 안전점검, 사이트 크롤러,
# Burp 히스토리 변환기) + 실행에 쓰는 SecLists/PayloadsAllTheThings 서브셋을 한
# zip으로 묶어 frontend/public/diagnostics-fixtures/offline-toolkit-bundle.zip에
# 만든다. 인터넷이 전혀 안 되는 내부망 PC에 그대로 반입해서 쓰는 용도라, 전체
# 저장소(SecLists 2.5GB)가 아니라 코드가 실제로 참조하는 파일만 선별해서 담는다.
#
# 재실행 시 SOURCE_CACHE_DIR에 이미 clone돼있으면 pull만 하고 새로 clone하지
# 않는다 -- 업스트림 워드리스트가 갱신됐을 때 다시 돌리기만 하면 됨.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/frontend/public/diagnostics-fixtures"
SOURCE_CACHE_DIR="${OFFLINE_BUNDLE_SOURCE_CACHE:-/tmp/offline-bundle-sources}"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

SECLISTS_DIR="$SOURCE_CACHE_DIR/SecLists"
PATT_DIR="$SOURCE_CACHE_DIR/PayloadsAllTheThings"

log() { echo "[build-offline-bundle] $*"; }

fetch_repo() {
  local url="$1" dest="$2"
  if [ -d "$dest/.git" ]; then
    log "이미 있음, pull만: $dest"
    git -C "$dest" pull --ff-only -q || log "  (pull 실패 -- 기존 로컬 사본 그대로 사용)"
  else
    log "clone: $url -> $dest"
    git clone --depth 1 -q "$url" "$dest"
  fi
}

mkdir -p "$SOURCE_CACHE_DIR"
fetch_repo "https://github.com/danielmiessler/SecLists.git" "$SECLISTS_DIR"
fetch_repo "https://github.com/swisskyrepo/PayloadsAllTheThings.git" "$PATT_DIR"

WEB_CONTENT="$SECLISTS_DIR/Discovery/Web-Content"

# default_content_scanner.py TECH_WORDLISTS + generic 보강용
SECLISTS_FILES=(
  "$WEB_CONTENT/Web-Servers/Apache-Tomcat.txt"
  "$WEB_CONTENT/Web-Servers/Apache.txt"
  "$WEB_CONTENT/Web-Servers/nginx.txt"
  "$WEB_CONTENT/Web-Servers/IIS.txt"
  "$WEB_CONTENT/Web-Servers/IIS-systemweb.txt"
  "$WEB_CONTENT/Web-Servers/JBoss.txt"
  "$WEB_CONTENT/Web-Servers/Apache-Axis.txt"
  "$WEB_CONTENT/Web-Servers/Glassfish-Sun-Microsystems.txt"
  "$WEB_CONTENT/Web-Servers/Oracle-Sun-iPlanet.txt"
  "$WEB_CONTENT/Web-Servers/Java-Servlet-Runner-Adobe-JRun.txt"
  "$WEB_CONTENT/Common-DB-Backups.txt"
  "$WEB_CONTENT/quickhits.txt"
  "$WEB_CONTENT/common.txt"
  "$WEB_CONTENT/api/api-endpoints.txt"
  "$WEB_CONTENT/api/api-endpoints-res.txt"
  "$WEB_CONTENT/api/objects.txt"
  "$WEB_CONTENT/api/actions.txt"
  "$WEB_CONTENT/CMS/wordpress.fuzz.txt"
  "$WEB_CONTENT/CMS/wp-plugins.fuzz.txt"
  "$WEB_CONTENT/CMS/wp-themes.fuzz.txt"
  "$WEB_CONTENT/CMS/drupal-themes.fuzz.txt"
  "$WEB_CONTENT/CMS/joomla-plugins.fuzz.txt"
  # crawler.py --wordlist 용 (common.txt는 위에서 이미 포함)
  "$WEB_CONTENT/raft-large-directories.txt"
  "$WEB_CONTENT/raft-large-files.txt"
  "$WEB_CONTENT/raft-medium-directories.txt"
  "$WEB_CONTENT/raft-medium-files.txt"
)

TRAVERSAL_DIR="$PATT_DIR/Directory Traversal/Intruder"
LFI_DIR="$PATT_DIR/File Inclusion/Intruders"
PATT_FILES=(
  "$TRAVERSAL_DIR/directory_traversal.txt"
  "$TRAVERSAL_DIR/deep_traversal.txt"
  "$TRAVERSAL_DIR/traversals-8-deep-exotic-encoding.txt"
  "$TRAVERSAL_DIR/dotdotpwn.txt"
  "$LFI_DIR/JHADDIX_LFI.txt"
  "$LFI_DIR/List_Of_File_To_Include.txt"
  "$LFI_DIR/List_Of_File_To_Include_NullByteAdded.txt"
  "$LFI_DIR/dot-slash-PathTraversal_and_LFI_pairing.txt"
  "$LFI_DIR/LFI-FD-check.txt"
)

log "SecLists 서브셋 복사 중 (${#SECLISTS_FILES[@]}개 파일)"
for f in "${SECLISTS_FILES[@]}"; do
  rel="${f#"$SECLISTS_DIR"/}"
  dest="$STAGE_DIR/SecLists-master/$rel"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$f" ]; then
    cp "$f" "$dest"
  else
    log "  [경고] 없음, 건너뜀: $rel"
  fi
done
cp "$SECLISTS_DIR/LICENSE" "$STAGE_DIR/SecLists-master/LICENSE"

log "PayloadsAllTheThings 서브셋 복사 중 (${#PATT_FILES[@]}개 파일)"
for f in "${PATT_FILES[@]}"; do
  rel="${f#"$PATT_DIR"/}"
  dest="$STAGE_DIR/PayloadsAllTheThings-master/$rel"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$f" ]; then
    cp "$f" "$dest"
  else
    log "  [경고] 없음, 건너뜀: $rel"
  fi
done
cp "$PATT_DIR/LICENSE.md" "$STAGE_DIR/PayloadsAllTheThings-master/LICENSE.md" 2>/dev/null \
  || cp "$PATT_DIR/LICENSE" "$STAGE_DIR/PayloadsAllTheThings-master/LICENSE" 2>/dev/null \
  || log "  [경고] PayloadsAllTheThings LICENSE 파일을 못 찾음"

log "도구 4종 복사 중"
for tool in default-content-scanner site-crawler safe-http-audit burp-history-tool; do
  cp -R "$FIXTURES_DIR/$tool" "$STAGE_DIR/$tool"
  find "$STAGE_DIR/$tool" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
  # zip 포맷이 한글 파일명을 옛날 방식으로 저장하면 Windows 압축 해제 프로그램에서
  # 깨진 문자로 나오는 경우가 있어서, zip 안에서만 영문 이름으로 바꿔둔다(내용은 그대로 한글).
  if [ -f "$STAGE_DIR/$tool/설명서.txt" ]; then
    mv "$STAGE_DIR/$tool/설명서.txt" "$STAGE_DIR/$tool/MANUAL_KR.txt"
  fi
done

cat > "$STAGE_DIR/READ_ME_FIRST.txt" <<'EOF'
정찰/취약점 스캐너 올인원 오프라인 패키지 (내부망용)
======================================================

인터넷이 전혀 안 되고 이 웹사이트조차 못 여는 내부망 PC에 그대로 반입해서
쓰는 패키지. 도구 4개(.py 스크립트 + 설명서) + 그 도구들이 --tech/
--traversal/--wordlist에 쓰는 SecLists·PayloadsAllTheThings 서브셋
워드리스트까지 전부 한 번에 들어있다. 압축만 풀면 바로 실행 가능 --
pip install 같은 패키지 설치 전혀 필요 없음(전부 Python 표준 라이브러리만
사용).

각 폴더의 MANUAL_KR.txt가 원래 이름 "설명서.txt"다 -- zip 포맷은 한글
파일명을 옛날 방식(UTF-8 플래그 없이)으로 저장하면 Windows 압축 해제
프로그램에서 깨진 문자로 나오는 경우가 있어서, 이 zip 안에서만 영문
이름으로 바꿔둠. 내용은 그대로 한글 설명서다.

폴더 그대로 유지할 것 (스크립트가 자기 위치 기준 상대경로로 워드리스트를
찾음):
  default-content-scanner/default_content_scanner.py
  site-crawler/crawler.py
  safe-http-audit/safe_http_audit.py (+ safe_rule_bundle.py, safe_http_checks/)
  burp-history-tool/burp_history_to_wordlist.py  (네트워크 요청 없음, 어디서나 실행 가능)
  SecLists-master/                    <- 콘텐츠 스캐너·크롤러가 자동으로 찾음
  PayloadsAllTheThings-master/        <- 콘텐츠 스캐너가 자동으로 찾음

실행 방법
--------
각 폴더 안에서:
  python default_content_scanner.py          (인자 없이 실행 -> 한글 질문 순서대로)
  python crawler.py
  python safe_http_audit.py
  python burp_history_to_wordlist.py
자세한 옵션은 각 폴더의 MANUAL_KR.txt 참고. 인자 없이 실행한 뒤 마지막에
"고급 옵션을 더 조정할까요?"에 y로 답하면 옵션 번호 메뉴가 뜨는데, 이
메뉴 설명도 전부 한글로 나온다.

이번 패키지에서 달라진 점
------------------------
- 콘텐츠 스캐너 --tech에 axis/glassfish/iplanet/jrun/api/cms 추가, generic
  목록도 quickhits.txt(2500여개) 병합으로 대폭 확대.
- 경로순회(traversal) 모드: File Inclusion 페이로드까지 병합, 기본으로
  우회 인코딩(단일/이중 URL인코딩, 오버롱 UTF-8, null byte) 자동 적용
  (--no-bypass-encodings로 끔), 확인 가능한 타겟 파일 7종으로 확대.
- 크롤러 --wordlist에 raft-large/medium 디렉터리·파일 목록 추가, 리포트에
  "수집 실패·건너뜀" 섹션 신설(뭐가 왜 빠졌는지 항상 보이게).
- 신규: burp-history-tool -- Burp Suite export(XML/텍스트)에서 경로를
  뽑아 워드리스트 + 경로별 메서드 목록을 만들어줌(네트워크 요청 없음).

워드리스트 커버리지
------------------
콘텐츠 스캐너 --tech 전 종류(tomcat/apache/nginx/iis/jboss/db-backups/
axis/glassfish/iplanet/jrun/api/cms)와 --traversal 페이로드(Directory
Traversal + File Inclusion) 전부 코드가 실제로 쓰는 파일 그대로 포함(빠진
것 없음). nextjs는 SecLists 파일이 아니라 코드에 내장된 목록이라 별도
파일 불필요. 크롤러 --wordlist는 common.txt + raft-large/medium 디렉터리·
파일 4종 포함 -- 다른 이름 쓰려면 원본 저장소에서 해당 파일만
SecLists-master/Discovery/Web-Content/ 안에 추가로 넣으면 됨. 또는
burp-history-tool로 실제 관측된 경로 기반 워드리스트를 직접 만들어도 됨.
safe_http_audit은 외부 워드리스트를 아예 안 씀(자체 룰 파일만 사용, 이미
포함됨).

출처 / 라이선스: SecLists·PayloadsAllTheThings 둘 다 MIT 라이선스,
각 폴더의 LICENSE 파일 그대로 포함함.
  https://github.com/danielmiessler/SecLists
  https://github.com/swisskyrepo/PayloadsAllTheThings

주의
----
소유하거나 명시적으로 허가받은 대상에서만 사용할 것.
EOF

OUT_ZIP="$FIXTURES_DIR/offline-toolkit-bundle.zip"
rm -f "$OUT_ZIP"
( cd "$STAGE_DIR" && zip -q -r -X "$OUT_ZIP" . )

log "검증 중"
python3 - "$OUT_ZIP" <<'PYEOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
non_ascii = [n for n in names if not n.isascii()]
print(f"entries: {len(names)}")
print(f"non-ascii names: {non_ascii or 'none'}")
bad = z.testzip()
print("zip integrity:", "OK" if bad is None else f"BAD ({bad})")
PYEOF

log "완료: $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"
