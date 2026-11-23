export const CDN_CACHE_VARIANTS = [
  { label: 'CSS', suffix: '.css' }, { label: 'JavaScript', suffix: '.js' },
  { label: 'JPEG', suffix: '.jpg' }, { label: 'PNG', suffix: '.png' },
  { label: 'SVG', suffix: '.svg' }, { label: 'WebP', suffix: '.webp' },
  { label: 'Font', suffix: '.woff2' }, { label: 'Text', suffix: '.txt' },
  { label: 'JSON', suffix: '.json' }, { label: 'Source map', suffix: '.map' },
  { label: '캐시 키 쿼리 1', suffix: '?cache-check=1' }, { label: '캐시 키 쿼리 2', suffix: '?cache-check=2' },
]

export const CDN_IDENTITY_HEADERS = [
  ['X-Forwarded-For', '127.0.0.1'], ['X-Real-IP', '127.0.0.1'],
  ['X-Originating-IP', '127.0.0.1'], ['X-Client-IP', '127.0.0.1'],
  ['True-Client-IP', '127.0.0.1'], ['CF-Connecting-IP', '127.0.0.1'],
  ['CF-Connecting-IPv6', '::1'], ['Forwarded', 'for=127.0.0.1;proto=https'],
  ['X-Forwarded-Host', 'TARGET.example.com'], ['X-Forwarded-Proto', 'https'],
  ['X-Original-URL', '/private/resource'], ['X-Rewrite-URL', '/private/resource'],
]

export const CDN_NORMALIZATION_VARIANTS = [
  '/private/resource', '/private/./resource', '/private//resource',
  '/private/a/../resource', '/private/%2e/resource', '/private/%2e%2e/private/resource',
  '/private%2fresource', '/private%252fresource', '/private\\resource',
  '/private/resource;param=1', '/private/resource/',
]

export type CloudCheck = { label: string; command: string; purpose: string }
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
export const CLOUD_STORAGE_CHECKS: Record<'AWS S3' | 'GCP GCS' | 'Azure Blob', CloudCheck[]> = {
  'AWS S3': [
    { label: '익명 HEAD 응답', command: 'curl -sS -I --max-time 10 "https://<BUCKET>.s3.amazonaws.com/"', purpose: '본문 없이 상태·헤더만 확인' },
    { label: 'Public Access Block', command: 'aws s3api get-public-access-block --bucket <BUCKET>', purpose: '계정 권한이 있는 경우 차단 설정 확인' },
    { label: 'Bucket policy public status', command: 'aws s3api get-bucket-policy-status --bucket <BUCKET>', purpose: '정책이 공개로 평가되는지 확인' },
    { label: 'Bucket ACL', command: 'aws s3api get-bucket-acl --bucket <BUCKET>', purpose: '권한 있는 계정으로 ACL 메타데이터 확인' },
    { label: 'Object ownership', command: 'aws s3api get-bucket-ownership-controls --bucket <BUCKET>', purpose: 'ACL 사용 억제 설정 확인' },
    { label: '기본 암호화', command: 'aws s3api get-bucket-encryption --bucket <BUCKET>', purpose: '서버 측 암호화 설정 확인' },
    { label: '버전 관리', command: 'aws s3api get-bucket-versioning --bucket <BUCKET>', purpose: '버전 관리 상태 확인' },
    { label: '서버 액세스 로깅', command: 'aws s3api get-bucket-logging --bucket <BUCKET>', purpose: '액세스 로깅 대상 설정 확인' },
    { label: '수명주기 규칙', command: 'aws s3api get-bucket-lifecycle-configuration --bucket <BUCKET>', purpose: '보존·만료 규칙 확인' },
  ],
  'GCP GCS': [
    { label: '익명 HEAD 응답', command: 'curl -sS -I --max-time 10 "https://storage.googleapis.com/<BUCKET>/"', purpose: '본문 없이 상태·헤더만 확인' },
    { label: 'Bucket IAM 정책', command: 'gcloud storage buckets get-iam-policy gs://<BUCKET>', purpose: '권한 있는 계정으로 공개 principal 확인' },
    { label: 'Public Access Prevention', command: 'gcloud storage buckets describe gs://<BUCKET> --format="yaml(iamConfiguration.publicAccessPrevention,iamConfiguration.uniformBucketLevelAccess)"', purpose: '공개 접근 방지·균일 권한 설정 확인' },
    { label: '균일 버킷 수준 접근', command: 'gcloud storage buckets describe gs://<BUCKET> --format="value(iamConfiguration.uniformBucketLevelAccess.enabled)"', purpose: '객체 ACL 비활성화 여부 확인' },
    { label: '기본 암호화 키', command: 'gcloud storage buckets describe gs://<BUCKET> --format="value(encryption.defaultKmsKeyName)"', purpose: '고객 관리 암호화 키 설정 확인' },
    { label: '버전 관리', command: 'gcloud storage buckets describe gs://<BUCKET> --format="value(versioning.enabled)"', purpose: '객체 버전 관리 확인' },
    { label: '보존 정책', command: 'gcloud storage buckets describe gs://<BUCKET> --format="yaml(retentionPolicy)"', purpose: '보존 기간·잠금 설정 확인' },
    { label: '액세스 로그 구성', command: 'gcloud storage buckets describe gs://<BUCKET> --format="yaml(logging)"', purpose: '로그 버킷·접두사 설정 확인' },
    { label: 'CORS 구성', command: 'gcloud storage buckets describe gs://<BUCKET> --format="yaml(cors)"', purpose: '허용 Origin·메서드 확인' },
  ],
  'Azure Blob': [
    { label: '익명 HEAD 응답', command: 'curl -sS -I --max-time 10 "https://<ACCOUNT>.blob.core.windows.net/<CONTAINER>?restype=container"', purpose: '본문 없이 상태·헤더만 확인' },
    { label: '컨테이너 공개 접근 수준', command: 'az storage container show-permission --name <CONTAINER> --account-name <ACCOUNT> --auth-mode login', purpose: '로그인한 점검 계정으로 공개 수준 확인' },
    { label: '공용 네트워크 접근', command: 'az storage account show --name <ACCOUNT> --resource-group <RESOURCE_GROUP> --query "{publicNetworkAccess:publicNetworkAccess,allowBlobPublicAccess:allowBlobPublicAccess}"', purpose: '계정 공개 접근 설정 확인' },
    { label: '최소 TLS 버전', command: 'az storage account show --name <ACCOUNT> --resource-group <RESOURCE_GROUP> --query minimumTlsVersion', purpose: '최소 TLS 설정 확인' },
    { label: 'HTTPS 전용', command: 'az storage account show --name <ACCOUNT> --resource-group <RESOURCE_GROUP> --query enableHttpsTrafficOnly', purpose: 'HTTPS 전용 설정 확인' },
    { label: '인프라 암호화', command: 'az storage account show --name <ACCOUNT> --resource-group <RESOURCE_GROUP> --query encryption.requireInfrastructureEncryption', purpose: '인프라 암호화 추가 적용 확인' },
    { label: '소프트 삭제 보존', command: 'az storage account blob-service-properties show --account-name <ACCOUNT> --auth-mode login --query deleteRetentionPolicy', purpose: '삭제 데이터 복구 보존 기간 확인' },
    { label: '버전 관리', command: 'az storage account blob-service-properties show --account-name <ACCOUNT> --auth-mode login --query isVersioningEnabled', purpose: 'Blob 버전 관리 확인' },
    { label: '진단 설정', command: 'az monitor diagnostic-settings list --resource <STORAGE_ACCOUNT_RESOURCE_ID>', purpose: '스토리지 진단 로그 전송 설정 확인' },
  ],
}

export const MODERN_RECON_PATHS = [
  '/actuator/health', '/actuator/info', '/actuator/metrics', '/actuator/prometheus',
  '/actuator/env', '/actuator/configprops', '/actuator/mappings', '/actuator/beans',
  '/actuator/loggers', '/actuator/auditevents', '/swagger-ui.html', '/swagger-ui/index.html',
  '/v2/api-docs', '/v3/api-docs', '/openapi.json', '/api-docs', '/swagger.json',
  '/graphql', '/graphiql', '/.well-known/openid-configuration',
  '/_next/static/', '/_next/static/chunks/', '/manifest.json', '/asset-manifest.json',
  '/firebase.json', '/.well-known/assetlinks.json', '/robots.txt', '/sitemap.xml',
]
export const MODERN_BACKEND_PROBES = [
  { label: 'Firebase RTDB 후보 (HEAD)', command: 'curl -sS -I --max-time 8 "https://<PROJECT-ID>.firebaseio.com/.json?shallow=true"' },
  { label: 'Supabase REST 후보 (HEAD)', command: 'curl -sS -I --max-time 8 "https://<PROJECT-ID>.supabase.co/rest/v1/"' },
]

export const GIT_EXPOSURE_PATHS = [
  '/.git/HEAD', '/.git/config', '/.git/index', '/.git/packed-refs', '/.git/refs/heads/main',
  '/.env', '/.env.local', '/.env.development', '/.env.production', '/.env.staging', '/.env.backup',
  '/.env.example', '/.envrc', '/.npmrc', '/.pypirc', '/.netrc', '/.htpasswd',
  '/config.php.bak', '/config.yml.bak', '/application.yml', '/application-prod.yml',
  '/wp-config.php.bak', '/settings.py.bak', '/database.yml', '/credentials.json',
  '/.aws/credentials', '/.aws/config', '/.ssh/config', '/id_rsa', '/id_ed25519',
  '/docker-compose.yml', '/compose.yaml', '/Dockerfile.bak', '/.docker/config.json',
  '/.kube/config', '/terraform.tfstate', '/terraform.tfstate.backup', '/.terraformrc',
  '/.vscode/sftp.json', '/.idea/workspace.xml', '/.DS_Store', '/Thumbs.db',
  '/backup.zip', '/site-backup.tar.gz', '/backup.sql', '/dump.sql', '/db.sql',
  '/debug.log', '/error.log', '/access.log', '/phpinfo.php', '/server-status',
  '/.github/workflows/', '/.gitlab-ci.yml', '/Jenkinsfile', '/.circleci/config.yml',
]

export function buildGitExposureProbe(base: string): string {
  const quotedBase = shellQuote(base)
  const pathList = GIT_EXPOSURE_PATHS.map(path => `  '${path}'`).join('\n')
  return `base=${quotedBase}\nwhile IFS= read -r path; do\n  code=$(curl -sS -I -o /dev/null -w '%{http_code}' --max-time 8 "${'${base}'}${'${path}'}")\n  printf '%s\\t%s\\n' "$code" "$path"\ndone <<'PATHS'\n${pathList}\nPATHS`
}

export const DNS_PROVIDER_FINGERPRINTS = [
  { provider: 'AWS S3', cname: 's3.amazonaws.com', fingerprint: 'The specified bucket does not exist', status: '취약 후보' },
  { provider: 'Microsoft Azure', cname: 'cloudapp.net · azurewebsites.net 등', fingerprint: 'NXDOMAIN', status: '취약 후보' },
  { provider: 'Discourse', cname: 'trydiscourse.com', fingerprint: 'NXDOMAIN', status: '취약 후보' },
  { provider: 'Digital Ocean', cname: '최신 카탈로그 확인', fingerprint: 'DNS provider 상태 확인 필요', status: '취약 후보' },
  { provider: 'Ghost', cname: 'ghost.io', fingerprint: 'Site unavailable · Failed to resolve DNS path for this host', status: '취약 후보' },
  { provider: 'Gemfury', cname: '최신 카탈로그 확인', fingerprint: '404: This page could not be found.', status: '취약 후보' },
  { provider: 'GetResponse', cname: '최신 카탈로그 확인', fingerprint: 'With GetResponse Landing Pages, lead generation has never been easier', status: '취약 후보' },
  { provider: 'GitHub Pages', cname: '최신 카탈로그 확인', fingerprint: "There isn't a GitHub Pages site here.", status: '경계 사례' },
  { provider: 'Help Juice', cname: 'helpjuice.com', fingerprint: "We could not find what you're looking for.", status: '취약 후보' },
  { provider: 'Help Scout', cname: 'helpscoutdocs.com', fingerprint: 'No settings were found for this company:', status: '취약 후보' },
  { provider: 'Helprace', cname: 'helprace.com', fingerprint: 'HTTP 301', status: '취약 후보' },
  { provider: 'Heroku', cname: '최신 카탈로그 확인', fingerprint: 'No such app', status: '경계 사례' },
  { provider: 'HubSpot', cname: '최신 카탈로그 확인', fingerprint: "This page isn't available", status: '비취약으로 분류' },
  { provider: 'Intercom', cname: '최신 카탈로그 확인', fingerprint: "Uh oh. That page doesn't exist.", status: '경계 사례' },
  { provider: 'JetBrains YouTrack', cname: 'youtrack.cloud', fingerprint: 'is not a registered InCloud YouTrack', status: '취약 후보' },
  { provider: 'Fastly', cname: '최신 카탈로그 확인', fingerprint: 'Fastly error: unknown domain:', status: '비취약으로 분류' },
  { provider: 'Netlify', cname: '최신 카탈로그 확인', fingerprint: 'Not Found - Request ID:', status: '경계 사례' },
  { provider: 'ngrok', cname: 'ngrok.io', fingerprint: 'Tunnel .*.ngrok.io not found', status: '취약 후보' },
  { provider: 'Pantheon', cname: '최신 카탈로그 확인', fingerprint: '404 error unknown site!', status: '취약 후보' },
  { provider: 'Pingdom', cname: '최신 카탈로그 확인', fingerprint: "Sorry, couldn't find the status page", status: '취약 후보' },
  { provider: 'Readme.io', cname: 'readme.io', fingerprint: 'The creators of this project are still working on making everything perfect!', status: '취약 후보' },
  { provider: 'Read the Docs', cname: '최신 카탈로그 확인', fingerprint: '현재 카탈로그의 정확한 패턴 확인 필요', status: '취약 후보' },
  { provider: 'Shopify', cname: '최신 카탈로그 확인', fingerprint: 'Sorry, this shop is currently unavailable.', status: '경계 사례' },
  { provider: 'Short.io', cname: '최신 카탈로그 확인', fingerprint: 'Link does not exist', status: '취약 후보' },
  { provider: 'SmartJobBoard', cname: '52.16.160.97', fingerprint: 'This job board website is either expired or its domain name is invalid.', status: '취약 후보' },
  { provider: 'Smartling', cname: '최신 카탈로그 확인', fingerprint: 'Domain is not configured', status: '경계 사례' },
  { provider: 'Unbounce', cname: '최신 카탈로그 확인', fingerprint: 'The requested URL was not found on this server.', status: '비취약으로 분류' },
  { provider: 'UptimeRobot', cname: 'stats.uptimerobot.com', fingerprint: 'page not found', status: '취약 후보' },
  { provider: 'UserVoice', cname: '최신 카탈로그 확인', fingerprint: 'This UserVoice subdomain is currently available!', status: '비취약으로 분류' },
  { provider: 'Vercel', cname: '최신 카탈로그 확인', fingerprint: 'DEPLOYMENT_NOT_FOUND.', status: '경계 사례' },
]

export const CORS_ORIGIN_CASES = [
  { label: '기준 요청 (Origin 없음)', origin: '', note: '일반 응답 헤더와 Vary: Origin 기준값을 기록' },
  { label: '정상 등록 Origin', origin: 'https://TARGET.example.com', note: '허용 목록의 정확한 값으로 비교' },
  { label: '외부 임의 Origin', origin: 'https://untrusted.invalid', note: '반사 여부와 credentials 허용을 함께 확인' },
  { label: 'null Origin', origin: 'null', note: 'null을 허용 목록에 잘못 넣었는지 확인' },
  { label: '유사 suffix 도메인', origin: 'https://target.example.com.untrusted.invalid', note: '호스트 끝부분 경계 검증 확인' },
  { label: '유사 prefix 도메인', origin: 'https://untrusted-target.example.com', note: '문자열 부분일치 검증 확인' },
  { label: 'scheme 변경', origin: 'http://TARGET.example.com', note: 'HTTPS Origin만 허용하는 정책인지 확인' },
  { label: '비표준 포트', origin: 'https://TARGET.example.com:8443', note: 'scheme·host·port를 조합해 비교하는지 확인' },
  { label: '후행 점', origin: 'https://TARGET.example.com.', note: '정규화 및 정확한 호스트 비교 확인' },
  { label: '유사 문자 도메인', origin: 'https://target-example.com', note: '등록 도메인과 혼동 가능한 값을 거부하는지 확인' },
]

export const DNS_RECORD_CHECKS = [
  ['A / AAAA', 'dig A +short <DOMAIN> && dig AAAA +short <DOMAIN>'],
  ['CNAME', 'dig CNAME +noall +answer <SUBDOMAIN>'], ['NS', 'dig NS +noall +answer <DOMAIN>'],
  ['CAA', 'dig CAA +noall +answer <DOMAIN>'], ['DNSSEC DS', 'dig DS +noall +answer <DOMAIN>'],
  ['SPF TXT', 'dig TXT +short <DOMAIN>'], ['DMARC', 'dig TXT +short _dmarc.<DOMAIN>'],
  ['Wildcard 기준', 'dig A +short random-nonexistent-<NONCE>.<DOMAIN>'],
]
