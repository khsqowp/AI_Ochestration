import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const BASE_URL = 'https://lab.khsqowp1.my'
const OUT_DIR = process.env.OMAKASE_OUT_DIR || 'dist'
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const topics = JSON.parse(readFileSync(new URL('../src/omakase-topics.json', import.meta.url), 'utf8'))
const TOPIC_LABELS = {
  'pentest-server-to-cloud': '서버 모의해킹',
  'web-vuln-diagnosis-checklist': '웹취약점 체크리스트',
  'kisa-critical-infra-standard': 'KISA 기반시설 표준',
  'cloud-pentest-aws-azure-gcp': '클라우드 침투(AWS/Azure/GCP)',
  'ransomware-threat-intel': '랜섬웨어 위협 인텔리전스',
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function descriptionFromMarkdown(markdown) {
  const description = markdown
    .replace(/^#[^\n]*\n/, ' ') // 문서 맨 앞 "# 제목" 줄은 <title>에 이미 있으니 설명에서 또 반복하지 않는다
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`~>|{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (description.length <= 150) return description
  const wordEnd = description.lastIndexOf(' ', 150)
  if (wordEnd < 0) return description.includes(' ') ? `${description.split(' ')[0]}…` : description
  return `${description.slice(0, wordEnd).trimEnd()}…`
}

function chapterMarkdown(markdown) {
  const customDescription = markdown.match(/^<!--[ \t]*description:[ \t]*([^\r\n]*?)[ \t]*-->(?:\r?\n|$)/)
  return {
    description: customDescription?.[1].trim() || descriptionFromMarkdown(markdown),
    content: customDescription ? markdown.slice(customDescription[0].length) : markdown,
  }
}

// 프로덕션 Docker 빌드는 컨텍스트가 frontend/ 뿐이라 .git도 git 바이너리도 없다 —
// 그때는 아래 커밋된 스냅샷으로 대체한다. 스냅샷 갱신: node scripts/update-omakase-dates.mjs
let datesSnapshot = {}
try { datesSnapshot = JSON.parse(readFileSync(new URL('./omakase-dates.json', import.meta.url), 'utf8')) } catch {}

function gitDates(topicId, fileId) {
  const key = `${topicId}/${fileId}`
  try {
    const relativePath = `frontend/public/omakase-content/${topicId}/${fileId}.md`
    const history = execSync('git log --follow --format=%aI -- "$OMAKASE_GIT_PATH"', {
      cwd: REPO_ROOT,
      env: { ...process.env, OMAKASE_GIT_PATH: relativePath },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(Boolean)
    if (history.length) return { datePublished: history.at(-1), dateModified: history[0] }
  } catch {}
  return datesSnapshot[key] ?? {}
}

function htmlDocument({ title, description, path, header, content, structuredData }) {
  const pageTitle = `${title} | Orchestration Lab`
  const url = `${BASE_URL}${path}`
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(url)}">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
  <style>
    body { max-width: 760px; margin: 0 auto; padding: 2rem 1.25rem; font: 16px/1.7 system-ui, sans-serif; color: #202632; }
    header { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem; }
    nav { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-top: 2rem; }
    a { color: #1754a3; }
    h1, h2, h3 { line-height: 1.3; }
    pre { overflow-x: auto; padding: 1rem; background: #f2f4f7; border-radius: 6px; }
    code { overflow-wrap: anywhere; }
    :not(pre) > code { padding: .1rem .3rem; background: #f2f4f7; }
    table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
    th, td { border: 1px solid #cbd2dc; padding: .4rem .65rem; text-align: left; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  <header>${header}</header>
  <main>${content}</main>
</body>
</html>
`
}

const urls = ['/', '/omakase']
let filePageCount = 0

for (const topic of topics) {
  const shortTitle = TOPIC_LABELS[topic.id]
  if (!shortTitle) throw new Error(`Missing short title for ${topic.id}`)
  const topicPath = `/omakase/${topic.id}/`
  const filesById = new Map(topic.files.map(file => [file.id, file]))
  const sections = topic.sections.map(section => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <ul>${section.fileIds.map(fileId => {
        const file = filesById.get(fileId)
        if (!file) throw new Error(`Missing file ${topic.id}/${fileId}`)
        return `<li><a href="${topicPath}${file.id}/">${escapeHtml(file.title)}</a></li>`
      }).join('')}</ul>
    </section>`).join('')

  const topicHtml = htmlDocument({
    title: shortTitle,
    description: topic.subtitle,
    path: topicPath,
    header: `<a href="/">Orchestration Lab</a><a href="/omakase">← 전체 목차</a>`,
    content: `<h1>${escapeHtml(topic.title)}</h1><p>${escapeHtml(topic.subtitle)}</p>${sections}`,
  })
  const topicDir = join(OUT_DIR, 'omakase', topic.id)
  await mkdir(topicDir, { recursive: true })
  await writeFile(join(topicDir, 'index.html'), topicHtml)
  urls.push(topicPath)

  for (const [index, file] of topic.files.entries()) {
    const markdown = readFileSync(new URL(`../public/omakase-content/${topic.id}/${file.id}.md`, import.meta.url), 'utf8')
    const { description, content } = chapterMarkdown(markdown)
    const dates = gitDates(topic.id, file.id)
    const filePath = `${topicPath}${file.id}/`
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: file.title,
      description,
      author: { '@type': 'Organization', name: 'Orchestration Lab' },
      ...dates,
    }
    const renderedContent = marked.parse(content)
    const dateLine = dates.dateModified ? `<p class="last-modified">최종 수정: ${escapeHtml(dates.dateModified.slice(0, 10))}</p>` : ''
    const datedContent = dateLine
      ? /<h1\b[^>]*>.*?<\/h1>/s.test(renderedContent)
        ? renderedContent.replace(/(<h1\b[^>]*>.*?<\/h1>)/s, `$1${dateLine}`)
        : `${dateLine}${renderedContent}`
      : renderedContent
    const previous = topic.files[index - 1]
    const next = topic.files[index + 1]
    const navigation = `<nav aria-label="챕터 이동">${previous ? `<a href="${topicPath}${previous.id}/">← 이전 글: ${escapeHtml(previous.title)}</a>` : ''}${next ? `<a href="${topicPath}${next.id}/">다음 글: ${escapeHtml(next.title)} →</a>` : ''}</nav>`
    const fileHtml = htmlDocument({
      title: `${file.title} — ${shortTitle}`,
      description,
      path: filePath,
      header: `<a href="/">Orchestration Lab</a><a href="${topicPath}">← ${escapeHtml(topic.title)} 목차</a>`,
      structuredData,
      // 원본 마크다운이 전부 자체 "# <제목>" 헤딩으로 시작해서, 여기서 또 <h1>을 끼워 넣으면
      // 페이지에 똑같은 제목이 H1 두 개로 중복 출력된다(SEO 헤딩 구조 오류 + 눈에도 중복 보임).
      content: `${datedContent}${navigation}`,
    })
    const fileDir = join(topicDir, file.id)
    await mkdir(fileDir, { recursive: true })
    await writeFile(join(fileDir, 'index.html'), fileHtml)
    urls.push(filePath)
    filePageCount += 1
  }
}

const toolSlugs = ['snake', 'minesweeper', 'roulette', 'ladder', 'gomoku', 'reflex-test', 'typing-race', 'order-picker', 'random-draw', 'date-calculator', 'unit-converter', 'image-ocr']
urls.push('/tools', ...toolSlugs.map(slug => `/tools/${slug}`))

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(path => `  <url><loc>${escapeHtml(`${BASE_URL}${path}`)}</loc></url>`).join('\n')}
</urlset>
`
await mkdir(OUT_DIR, { recursive: true })
await writeFile(join(OUT_DIR, 'sitemap.xml'), sitemap)
console.log(`Generated ${filePageCount} file pages, ${topics.length} topic pages, and ${urls.length} sitemap URLs in ${OUT_DIR}`)
