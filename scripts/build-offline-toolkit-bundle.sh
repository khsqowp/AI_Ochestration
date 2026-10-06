#!/bin/bash
# 정찰/취약점 스캐너 3종(정찰 올인원, HTTP 안전점검, Burp 히스토리 변환기)을 한 zip으로
# 묶어 frontend/public/diagnostics-fixtures/offline-toolkit-bundle.zip에 만든다.
# 인터넷이 전혀 안 되는 내부망 PC에 그대로 반입해서 쓰는 용도.
#
# recon_toolkit.py는 워드리스트(SecLists/PayloadsAllTheThings 서브셋)를 파일
# 안에 압축 내장하고 있어서(scripts/embed-recon-wordlists.py로 생성), 이 빌드
# 스크립트는 더 이상 SecLists/PayloadsAllTheThings 원본을 clone하거나 별도
# 폴더로 담지 않는다 -- 워드리스트를 갱신하려면 embed-recon-wordlists.py를
# 먼저 재실행해서 recon_toolkit.py 자체를 갱신한 다음 이 스크립트를 돌릴 것.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_DIR="$PROJECT_ROOT/frontend/public/diagnostics-fixtures"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

log() { echo "[build-offline-bundle] $*"; }

log "도구 5종 복사 중"
for tool in recon-toolkit safe-http-audit burp-history-tool route-tree-tools burp-comparer; do
  cp -R "$FIXTURES_DIR/$tool" "$STAGE_DIR/$tool"
  find "$STAGE_DIR/$tool" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
  if [ -f "$STAGE_DIR/$tool/설명서.txt" ]; then
    mv "$STAGE_DIR/$tool/설명서.txt" "$STAGE_DIR/$tool/MANUAL_KR.txt"
  fi
done

cat > "$STAGE_DIR/READ_ME_FIRST.txt" <<'EOF'
정찰/취약점 스캐너 올인원 오프라인 패키지 (내부망용)
======================================================

인터넷이 전혀 안 되고 이 웹사이트조차 못 여는 내부망 PC에 그대로 반입해서
쓰는 패키지. 도구 3개(.py 스크립트 + 설명서)는 pip install 같은 패키지
설치 없이 바로 실행 가능(전부 Python 표준 라이브러리만 사용). route-tree-tools
안의 2개와 burp-comparer 안의 1개(전부 .html)는 Python도 필요 없이
브라우저로 파일 열면 바로 동작.

recon-toolkit/recon_toolkit.py 는 워드리스트(SecLists/PayloadsAllTheThings
서브셋)가 파일 안에 압축 내장돼 있다 -- 별도 폴더 필요 없이 이 파일 하나만
있으면 바로 실행된다. 이전 버전처럼 "콘텐츠 스캐너"와 "크롤러"가 따로 있던
구조를 하나로 합친 것으로, 루트 확인(robots.txt/sitemap.xml 등으로 실제 루트
경로 확정) -> 기본/백업 파일 탐색 -> 경로순회(Traversal)/LFI 퍼징 -> 링크
크롤링 순서로 동작하며, 대상을 여러 개 동시에 돌릴 수도 있다.

각 폴더의 MANUAL_KR.txt가 원래 이름 "설명서.txt"다 -- zip 포맷은 한글
파일명을 옛날 방식(UTF-8 플래그 없이)으로 저장하면 Windows 압축 해제
프로그램에서 깨진 문자로 나오는 경우가 있어서, 이 zip 안에서만 영문
이름으로 바꿔둠. 내용은 그대로 한글 설명서다.

폴더 구성
--------
  recon-toolkit/recon_toolkit.py              <- 루트확인/기본파일/경로순회/크롤링 올인원
  safe-http-audit/safe_http_audit.py (+ safe_rule_bundle.py, safe_http_checks/)
  burp-history-tool/burp_history_to_wordlist.py  (네트워크 요청 없음, 어디서나 실행 가능)
  route-tree-tools/har-endpoint-tree.html      <- HAR 엔드포인트 트리 (브라우저로 직접 열기)
  route-tree-tools/js-route-tree.html          <- JS URL·API 경로 트리 (브라우저로 직접 열기)

실행 방법
--------
각 폴더 안에서:
  python recon_toolkit.py                    (인자 없이 실행 -> 한글 질문 순서대로)
  python safe_http_audit.py
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
