import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { ManagedUser, Role } from '../lib/types'
import { PanelShell } from '../components/shared'

export function UserManagementModal({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loginId, setLoginId] = useState(''); const [displayName, setDisplayName] = useState(''); const [role, setRole] = useState<Role>('USER'); const [password, setPassword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null); const [notice, setNotice] = useState('')
  const load = () => fetch('/api/admin/users', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setUsers).catch(() => setNotice('사용자 목록을 불러오지 못했습니다.'))
  useEffect(() => { load() }, [])
  const reset = () => { setLoginId(''); setDisplayName(''); setRole('USER'); setPassword(''); setEditingId(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    const response = await fetch(editingId ? `/api/admin/users/${editingId}` : '/api/admin/users', {
      method: editingId ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { displayName, role, password: password || null } : { id: loginId, displayName, role, password })
    })
    if (!response.ok) { const body = await response.json().catch(() => null); setNotice(body?.message ?? '저장하지 못했습니다.'); return }
    reset(); load()
  }
  const remove = async (user: ManagedUser) => {
    setNotice('')
    const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) { const body = await response.json().catch(() => null); setNotice(body?.message ?? '삭제하지 못했습니다.'); return }
    load()
  }
  return <PanelShell embedded={embedded} className="source-sheet">
    <div className="sheet-header"><div><p className="eyebrow">ACCOUNT ADMIN</p><h2>사용자 관리</h2></div>{onClose && <button className="sheet-close" onClick={onClose}><X size={18}/></button>}</div>
    <p className="source-intro">관리자는 모든 기능을 사용할 수 있고, 사용자는 파일 아카이브 · 수집 사이트(조회) · 에이전트 · 보안 캘린더 · 치트시트만 조회할 수 있습니다.</p>
    <form className="source-form" onSubmit={submit}>
      <label>아이디<input value={loginId} onChange={e => setLoginId(e.target.value)} required maxLength={320} disabled={Boolean(editingId)}/></label>
      <label>표시 이름<input value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={120}/></label>
      <label>권한<select value={role} onChange={e => setRole(e.target.value as Role)}><option value="USER">사용자</option><option value="ADMIN">관리자</option></select></label>
      <label>{editingId ? '비밀번호(변경 시에만 입력)' : '비밀번호'}<input value={password} onChange={e => setPassword(e.target.value)} type="password" required={!editingId} minLength={8} maxLength={200}/></label>
      {notice && <p className={notice.includes('못했') ? 'form-error' : 'form-notice'}>{notice}</p>}
      <button className="source-add" type="submit"><Plus size={16}/>{editingId ? '설정 저장' : '사용자 추가'}</button>
      {editingId && <button className="source-cancel" type="button" onClick={reset}>편집 취소</button>}
    </form>
    <div className="source-list"><div className="source-list-head"><b>등록됨</b><span>{users.length}명</span></div>
      {users.map(user => <article className="source-row" key={user.id}>
        <span className={`domain-dot ${user.role === 'ADMIN' ? 'security' : 'economy'}`}/>
        <div><b>{user.displayName}</b><small>{user.loginId} · {user.role === 'ADMIN' ? '관리자' : '사용자'} · {user.createdAt.slice(0, 10)}</small>
          <div className="source-actions"><button onClick={() => { setEditingId(user.id); setLoginId(user.loginId); setDisplayName(user.displayName); setRole(user.role); setPassword(''); setNotice('') }}>설정</button></div>
        </div>
        <button onClick={() => remove(user)}><Trash2 size={15}/></button>
      </article>)}
    </div>
  </PanelShell>
}
