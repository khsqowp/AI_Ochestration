#!/bin/bash
# 정찰/취약점 스캐너 모달(frontend/src/panels/ScannerToolsModal.tsx)에 올라있는 도구
# 전부를 한 zip으로 묶어 frontend/public/diagnostics-fixtures/offline-toolkit-bundle.zip에
# 만든다. 인터넷이 전혀 안 되는 내부망 PC에 그대로 반입해서 쓰는 용도.
#
# 도구 목록은 frontend/src/scanner-tools-data.ts의 SCANNER_TOOLS가 유일한 출처다 --
# 이 스크립트는 그 파일에서 id 목록을 뽑아 아래 EXPECTED_TOOL_IDS와 정확히 같은지
# 검증하고, 다르면(새 도구 추가/제거) 조용히 넘어가지 않고 에러로 멈춘다. 새 도구가
# 생기면 EXPECTED_TOOL_IDS와 TOOL_DIRS(또는 CLIENT_ROUTE_SCOUT_ID 분기)를 같이 고칠 것.
#
# route-tree-tools/, burp-comparer/ 는 이 모달이 아니라 각자 별도 모달
# (RouteTreeModal.tsx, BurpComparerModal.tsx)에서 개별 다운로드를 제공하므로
# 이 번들에는 포함하지 않는다.
#
# recon_toolkit.py는 워드리스트(SecLists/PayloadsAllTheThings 서브셋)를 파일
# 안에 압축 내장하고 있어서(scripts/embed-recon-wordlists.py로 생성), 이 빌드
# 스크립트는 SecLists/PayloadsAllTheThings 원본을 clone하거나 별도 폴더로
# 담지 않는다 -- 워드리스트를 갱신하려면 embed-recon-wordlists.py를 먼저
# 재실행해서 recon_toolkit.py 자체를 갱신한 다음 이 스크립트를 돌릴 것.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/frontend/public/diagnostics-fixtures"
DATA_FILE="$PROJECT_ROOT/frontend/src/scanner-tools-data.ts"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

log() { echo "[build-offline-bundle] $*"; }

# frontend/public/diagnostics-fixtures/<id>/ 아래에 파일을 그대로 복사하면 되는 도구들.
TOOL_DIRS=(
  recon-toolkit
  safe-http-audit
  xss-reflected-scanner
  xss-stored-scanner
  jwt-analyzer
  crypto-identifier
  burp-history-tool
)
# 브라우저 콘솔에 붙여넣는 스크립트라 diagnostics-fixtures/ 에 폴더가 없는 도구 -- 소스는
# React에서 ?raw로 import하는 .txt 그대로.
CLIENT_ROUTE_SCOUT_ID="client-route-scout"
CLIENT_ROUTE_SCOUT_SRC="$PROJECT_ROOT/frontend/src/scanner-scripts/clientRouteScoutV12.txt"

EXPECTED_TOOL_IDS=$(printf '%s\n' "${TOOL_DIRS[@]}" "$CLIENT_ROUTE_SCOUT_ID" | sort)
ACTUAL_TOOL_IDS=$(grep -oE "id: '[a-zA-Z0-9_-]+'" "$DATA_FILE" | sed -E "s/id: '(.*)'/\1/" | sort)

if [ "$EXPECTED_TOOL_IDS" != "$ACTUAL_TOOL_IDS" ]; then
  log "ERROR: $DATA_FILE 의 SCANNER_TOOLS id 목록이 이 스크립트의 목록과 다르다."
  log "이 스크립트의 TOOL_DIRS / CLIENT_ROUTE_SCOUT_ID 를 먼저 맞춰서 고친 다음 다시 실행할 것."
  echo "--- 스크립트가 기대하는 목록 ---"
  echo "$EXPECTED_TOOL_IDS"
  echo "--- scanner-tools-data.ts 실제 목록 ---"
  echo "$ACTUAL_TOOL_IDS"
  exit 1
fi

log "도구 ${#TOOL_DIRS[@]}종 + client-route-scout 콘솔 스크립트 복사 중"
for tool in "${TOOL_DIRS[@]}"; do
  cp -R "$FIXTURES_DIR/$tool" "$STAGE_DIR/$tool"
  find "$STAGE_DIR/$tool" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
  if [ -f "$STAGE_DIR/$tool/설명서.txt" ]; then
    mv "$STAGE_DIR/$tool/설명서.txt" "$STAGE_DIR/$tool/MANUAL_KR.txt"
  fi
done

mkdir -p "$STAGE_DIR/$CLIENT_ROUTE_SCOUT_ID"
cp "$CLIENT_ROUTE_SCOUT_SRC" "$STAGE_DIR/$CLIENT_ROUTE_SCOUT_ID/client-route-scout-console-script.txt"
cat > "$STAGE_DIR/$CLIENT_ROUTE_SCOUT_ID/MANUAL_KR.txt" <<'EOF'
Client Route Scout (콘솔 스크립트) -- 안내
==========================================

이 폴더의 client-route-scout-console-script.txt 는 실행 파일이 아니다. 대상
사이트를 브라우저로 열어둔 상태에서 DevTools(F12) -> Console 탭에 파일 내용
전체를 그대로 붙여넣고 Enter 치면 바로 그 자리에서 동작하는 스크립트다.

- 같은 오리진 GET만 사용 -- 경로 추측, 폼 제출, 세션 값 변경 없음.
- API 키/JWT/자격증명 같은 노출 후보는 값 자체를 담지 않고 마스킹된 위치와
  근거만 콘솔에 출력한다.
- 결과는 브라우저 콘솔에 바로 표(라우트 목록, 노출 후보 등)로 뜨고,
  window.__CLIENT_ROUTE_SCOUT_V12__ 에도 저장된다.

웹사이트 자체도 못 여는 완전 오프라인 환경에서는 이 스크립트를 쓸 일이
없다(붙여넣을 "그 사이트"의 브라우저 콘솔이 필요하므로) -- 다른 도구들과
달리 참고용으로만 같이 넣어둔다.
EOF

cat > "$STAGE_DIR/READ_ME_FIRST.txt" <<EOF
정찰/취약점 스캐너 올인원 오프라인 패키지 (내부망용)
======================================================

인터넷이 전혀 안 되고 이 웹사이트조차 못 여는 내부망 PC에 그대로 반입해서
쓰는 패키지. 진단 페이지(정찰/취약점 스캐너 모달)에 올라있는 도구 전체를
그대로 담았다 -- recon-toolkit/safe-http-audit/xss-reflected-scanner/
xss-stored-scanner/jwt-analyzer/crypto-identifier/burp-history-tool 7개는
pip install 같은 패키지 설치 없이 바로 실행 가능(전부 Python 표준
라이브러리만 사용). client-route-scout 는 Python 스크립트가 아니라 브라우저
DevTools 콘솔에 붙여넣는 스크립트라 사용법이 다르다(해당 폴더의
MANUAL_KR.txt 참고).

recon-toolkit/recon_toolkit.py 는 워드리스트(SecLists/PayloadsAllTheThings
서브셋)가 파일 안에 압축 내장돼 있다 -- 별도 폴더 필요 없이 이 파일 하나만
있으면 바로 실행된다. 루트 확인(robots.txt/sitemap.xml 등으로 실제 루트
경로 확정) -> 기본/백업 파일 탐색 -> 경로순회(Traversal)/LFI 퍼징 -> 링크
크롤링 순서로 동작하며, 대상을 여러 개 동시에 돌릴 수도 있다.

각 폴더의 MANUAL_KR.txt가 원래 이름 "설명서.txt"다 -- zip 포맷은 한글
파일명을 옛날 방식(UTF-8 플래그 없이)으로 저장하면 Windows 압축 해제
프로그램에서 깨진 문자로 나오는 경우가 있어서, 이 zip 안에서만 영문
이름으로 바꿔둠. 내용은 그대로 한글 설명서다.

폴더 구성
--------
  recon-toolkit/recon_toolkit.py                 <- 루트확인/기본파일/경로순회/크롤링 올인원
  safe-http-audit/safe_http_audit.py (+ safe_rule_bundle.py, safe_http_checks/)
  xss-reflected-scanner/xss_reflected_scanner.py <- Reflected XSS 스캐너
  xss-stored-scanner/xss_stored_scanner.py       <- Stored XSS 스캐너
  jwt-analyzer/jwt_analyzer.py                   <- JWT(JWS/JWE) 구조 분석기
  crypto-identifier/crypto_identifier.py         <- 해시/인코딩 식별기
  burp-history-tool/burp_history_to_wordlist.py  <- 네트워크 요청 없음, 어디서나 실행 가능
  client-route-scout/client-route-scout-console-script.txt  <- 브라우저 콘솔에 붙여넣는 스크립트(MANUAL_KR.txt 참고)

실행 방법
--------
각 폴더 안에서(client-route-scout 제외):
  python recon_toolkit.py                    (인자 없이 실행 -> 한글 질문 순서대로)
  python safe_http_audit.py
  python xss_reflected_scanner.py
  python xss_stored_scanner.py
  python jwt_analyzer.py
  python crypto_identifier.py
  python burp_history_to_wordlist.py
자세한 옵션은 각 폴더의 MANUAL_KR.txt 참고. recon_toolkit.py는 --help로도
전체 옵션 확인 가능(설명 문구는 한글).

출처 / 라이선스: recon_toolkit.py에 내장된 워드리스트는 SecLists·
PayloadsAllTheThings(둘 다 MIT 라이선스)에서 가져온 서브셋이다.
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
