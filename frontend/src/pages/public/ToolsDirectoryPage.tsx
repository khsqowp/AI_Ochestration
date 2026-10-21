import { useSeoMeta } from '../../lib/useSeoMeta'
import { Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
const games=[['snake','스네이크'],['minesweeper','지뢰찾기'],['roulette','룰렛'],['ladder','사다리타기'],['gomoku','오목'],['reflex-test','반응속도 테스트'],['typing-race','타자 연습 속도 측정']]
const tools=[['order-picker','순서 정하기'],['random-draw','랜덤 추첨기'],['date-calculator','날짜·영업일 계산기'],['unit-converter','단위 변환기'],['image-ocr','이미지 OCR']]
function Group({title,items}:{title:string;items:string[][]}){return <section className="tools-group"><h2>{title}</h2><div>{items.map(([slug,name])=><Link key={slug} to={`/tools/${slug}`}><strong>{name}</strong><span>광고 없이 열기 ↗</span></Link>)}</div></section>}
export function ToolsDirectoryPage(){useSeoMeta({title:'게임과 무료 도구 | Reversing Lab',description:'광고 없이 바로 사용하는 브라우저 게임과 무료 도구입니다.',structuredData:{'@context':'https://schema.org','@type':'CollectionPage',name:'게임과 무료 도구',url:'https://lab.khsqowp1.my/tools',inLanguage:'ko-KR'}});return <main className="public-tools"><header className="pt-top"><Link to="/"><Bot size={17}/> Reversing Lab</Link></header><section className="pt-heading"><p>REVERSING LAB · FREE TOOLS</p><h1>게임과 도구</h1><span>광고 없이 바로 사용하는 브라우저 도구</span></section><Group title="게임" items={games}/><Group title="이외 기능" items={tools}/></main>}
