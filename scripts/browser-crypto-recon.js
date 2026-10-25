// DevTools 콘솔에 붙여 넣는 승인된 클라이언트 측 암호 진단 도구.
// 스크립트 원본 재조회 외에는 요청을 만들지 않으며, 관찰 결과는 로컬 콘솔에만 출력한다.
// 사용: 아래 공개 함수별 주석을 참고하고, 필요하면 recon.unhookAll()로 후킹을 해제한다.
window.recon = (function () {
  'use strict';

  const DANGEROUS_RE = /(enc|dec|crypt|cipher|aes|rsa|secret|private.?key|public.?key|password|token|jwt)/gi;
  const MAX_HITS = 200;
  const PREVIEW_BYTES = 1024;
  const hooked = [];
  const results = [];

  function record(source, label, raw) {
    results.push({ source, label, raw });
  }

  function hits(pattern = DANGEROUS_RE) {
    const matcher = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (Object.prototype.toString.call(matcher) !== '[object RegExp]') throw new TypeError('pattern은 RegExp 또는 문자열이어야 합니다.');
    const matched = results.filter(item => {
      matcher.lastIndex = 0;
      return matcher.test(typeof item.raw === 'string' ? item.raw : JSON.stringify(item.raw));
    });
    console.table(matched);
    return matched;
  }

  function clearResults() { results.length = 0; }

  function scanSource(label, src) {
    const windows = [];
    let cursor = 0;
    let hits = 0;
    let commentHits = 0;
    let truncated = false;

    function scanCode(start, end) {
      const code = src.slice(start, end);
      DANGEROUS_RE.lastIndex = 0;
      let match;
      while ((match = DANGEROUS_RE.exec(code))) {
        if (hits === MAX_HITS) {
          truncated = true;
          break;
        }
        hits++;
        const index = start + match.index;
        const left = Math.max(start, index - 80);
        const right = Math.min(end, start + DANGEROUS_RE.lastIndex + 80);
        const previous = windows[windows.length - 1];
        if (previous && left <= previous[1]) previous[1] = Math.max(previous[1], right);
        else windows.push([left, right]);
      }
    }

    let quote = null;
    for (let i = 0; i < src.length;) {
      const char = src[i];
      if (quote) {
        if (char === '\\') i += 2;
        else if (char === quote) { quote = null; i++; }
        else i++;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; i++; continue; }
      if (char !== '/' || (src[i + 1] !== '/' && src[i + 1] !== '*')) { i++; continue; }

      scanCode(cursor, i);
      if (truncated) break;
      const lineComment = src[i + 1] === '/';
      const closing = lineComment ? src.indexOf('\n', i + 2) : src.indexOf('*/', i + 2);
      const end = closing < 0 ? src.length : closing + (lineComment ? 0 : 2);
      const comment = src.slice(i, end);
      DANGEROUS_RE.lastIndex = 0;
      if (commentHits < MAX_HITS && DANGEROUS_RE.test(comment)) {
        commentHits++;
        const raw = comment.trim().slice(0, 500);
        console.log(`%c[comment] ${label}`, 'color:gray', raw);
        record('scan', `[comment] ${label}`, raw);
      }
      cursor = end;
      i = end;
    }
    if (!truncated) scanCode(cursor, src.length);
    if (commentHits === MAX_HITS) console.warn(`[comment] ${label} — 출력 상한 200건 도달`);

    if (hits) {
      const snippets = windows.map(([start, end]) => src.slice(start, end));
      console.log(`%c[code] ${label} — ${hits}건${truncated ? ' 이상 (상한 200건)' : ''}`,
        'color:red;font-weight:bold', snippets);
      for (const raw of snippets) record('scan', `[code] ${label}`, raw);
    }
    return { hits, truncated };
  }

  // 사용: await recon.scanAllScripts() — 현재 문서의 script 원본을 검사한다.
  async function scanAllScripts() {
    const summary = { scanned: 0, skipped: 0, hits: 0, truncated: 0 };
    for (const script of Array.from(document.scripts)) {
      const label = script.src || '(inline)';
      let src = script.textContent || '';
      if (script.src) {
        try {
          const response = await fetch(script.src, { credentials: 'same-origin', redirect: 'error' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          src = await response.text();
        } catch (error) {
          summary.skipped++;
          console.warn(`[scan] 건너뜀: ${script.src} — 재조회 실패(CORS/네트워크/응답 상태): ${String(error)}`);
          continue;
        }
      }
      if (!src) {
        summary.skipped++;
        console.warn(`[scan] 건너뜀: ${label} — 원본이 비어 있음`);
        continue;
      }
      const result = scanSource(label, src);
      summary.scanned++;
      summary.hits += result.hits;
      if (result.truncated) summary.truncated++;
    }
    console.log('[scan] 요약', summary);
    return summary;
  }

  function webpackCaches() {
    const caches = [];
    let names = [];
    try { names = Object.getOwnPropertyNames(window); } catch {}
    for (const name of names) {
      if (!/__webpack_require__|webpack.*require/i.test(name)) continue;
      try {
        const requireFn = window[name];
        if (requireFn && requireFn.c && typeof requireFn.c === 'object' &&
            !caches.includes(requireFn.c)) caches.push(requireFn.c);
      } catch {}
    }
    return caches;
  }

  // 사용: recon.findWebpackExports(['createDecipheriv']) — 노출된 웹팩 캐시의 함수 export를 찾는다.
  function findWebpackExports(names) {
    if (!Array.isArray(names)) return [];
    const found = [];
    for (const cache of webpackCaches()) {
      let ids = [];
      try { ids = Object.keys(cache); } catch { continue; }
      for (const id of ids) {
        try {
          const exp = cache[id] && cache[id].exports;
          if (!exp) continue;
          for (const holder of [exp, exp.a, exp.default]) {
            if (!holder) continue;
            for (const name of names) {
              if (typeof name === 'string' && typeof holder[name] === 'function' &&
                  !found.some(item => item.holder === holder && item.name === name)) {
                found.push({ moduleId: id, holder, name });
              }
            }
          }
        } catch {}
      }
    }
    return found;
  }

  function observePromise(promise, onValue) {
    if (promise && typeof promise.then === 'function') {
      try { promise.then(value => { try { onValue(value); } catch {} }, () => {}); } catch {}
    }
    return promise;
  }

  function preview(value) {
    if (typeof value === 'string') return value.slice(0, PREVIEW_BYTES);
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      try {
        const bytes = value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const text = new TextDecoder('utf-8', { fatal: true })
          .decode(bytes.subarray(0, Math.min(bytes.length, PREVIEW_BYTES)));
        return `${text}${bytes.length > PREVIEW_BYTES ? '…' : ''} (${bytes.length}바이트)`;
      } catch { return `[바이너리 ${value.byteLength}바이트]`; }
    }
    return value == null ? value : `[${typeof value}]`;
  }

  function install(holder, name, replacement, label) {
    if (hooked.some(item => item.holder === holder && item.name === name)) return false;
    try {
      const original = holder[name];
      if (typeof original !== 'function') return false;
      const hadOwnProperty = Object.prototype.hasOwnProperty.call(holder, name);
      const wrapper = replacement(original);
      holder[name] = wrapper;
      if (holder[name] === wrapper) {
        hooked.push({ holder, name, original, wrapper, hadOwnProperty });
        console.log(`후킹됨: ${label}`);
        record('hook', '후킹됨', label);
        return true;
      }
    } catch (error) { console.warn(`[hook] 실패: ${label}`, error); }
    return false;
  }

  function hookFn({ holder, name, moduleId }) {
    const decrypt = /Decipher|Decrypt/.test(name);
    const direction = decrypt ? '평문' : '암호문';
    install(holder, name, original => function (...args) {
      console.log(`%c[hook] module#${moduleId}.${name} 호출`, 'color:orange');
      record('hook', `module#${moduleId}.${name} 호출`, name);
      const ret = original.apply(this, args);
      if (ret && typeof ret.update === 'function' && typeof ret.final === 'function') {
        install(ret, 'update', update => function (...updateArgs) {
          const out = update.apply(this, updateArgs);
          const raw = preview(out);
          console.log(`[hook] ${name}.update → ${direction}:`, raw);
          record('hook', `${name}.update → ${direction}`, raw);
          return out;
        }, `${name}.update`);
        install(ret, 'final', final => function (...finalArgs) {
          const out = final.apply(this, finalArgs);
          const raw = preview(out);
          console.log(`[hook] ${name}.final → ${direction}:`, raw);
          record('hook', `${name}.final → ${direction}`, raw);
          return out;
        }, `${name}.final`);
      } else {
        const raw = preview(ret);
        console.log(`[hook] ${name} → ${direction}:`, raw);
        record('hook', `${name} → ${direction}`, raw);
      }
      return ret;
    }, `module#${moduleId}.${name}`);
  }

  function breakpointGuidance() {
    console.warn('[hook] 노출된 웹팩 캐시에서 대상 함수를 찾지 못함. ' +
      'webpackChunk*만 보이거나 scope-hoisting/인라인 빌드이면 패치 가능한 export가 없을 수 있음. ' +
      'recon.scanAllScripts()로 번들의 고유 함수/변수명을 찾고 DevTools Sources에서 해당 호출부에 ' +
      '조건부 중단점을 설정하거나 DOM 변경이면 "Pause on attribute/property change"를 사용하세요.');
  }

  // 사용: recon.hookWebpackCrypto() — 노출된 Node 스타일 암호 함수 export를 관찰한다.
  function hookWebpackCrypto() {
    const targets = ['createDecipheriv', 'createCipheriv', 'privateDecrypt',
      'publicEncrypt', 'publicDecrypt', 'privateEncrypt'];
    const found = findWebpackExports(targets);
    if (!found.length) breakpointGuidance();
    else found.forEach(hookFn);
    return found;
  }

  function algorithmInfo(algorithm) {
    if (typeof algorithm === 'string') return { name: algorithm };
    const info = {};
    for (const key of ['name', 'iv', 'counter', 'additionalData', 'tagLength',
      'length', 'salt', 'iterations', 'hash']) {
      try {
        const value = algorithm && algorithm[key];
        if (value === undefined) continue;
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
          const bytes = value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
          info[key] = { bytes: bytes.length,
            hex: Array.from(bytes.subarray(0, 32), byte => byte.toString(16).padStart(2, '0')).join('') +
              (bytes.length > 32 ? '…' : '') };
        } else if (typeof value === 'string' || typeof value === 'number') info[key] = value;
        else if (key === 'hash' && value && typeof value.name === 'string') info[key] = value.name;
      } catch {}
    }
    return info;
  }

  // 사용: recon.hookWebCrypto() — native crypto.subtle.encrypt/decrypt 결과를 관찰한다.
  function hookWebCrypto() {
    let subtle;
    try { subtle = window.crypto && window.crypto.subtle; } catch {}
    if (!subtle) {
      console.warn('[webcrypto] crypto.subtle에 접근할 수 없음');
      return 0;
    }
    let installed = 0;
    for (const name of ['encrypt', 'decrypt']) {
      if (install(subtle, name, original => function (...args) {
        const algorithm = algorithmInfo(args[0]);
        console.log(`[webcrypto] ${name} 알고리즘:`, algorithm);
        record('webcrypto', `${name} 알고리즘`, algorithm);
        const promise = original.apply(this, args);
        return observePromise(promise, value => {
          const length = value && value.byteLength;
          const raw = { bytes: length, utf8: preview(value) };
          console.log(`[webcrypto] ${name} → ${name === 'decrypt' ? '평문' : '암호문'}:`, raw);
          record('webcrypto', `${name} → ${name === 'decrypt' ? '평문' : '암호문'}`, raw);
        });
      }, `crypto.subtle.${name}`)) installed++;
    }
    return installed;
  }

  // 사용: recon.hookNetwork() — 앱의 fetch/XHR URL과 상태만 관찰한다.
  // body도 로그에 남긴다 -- 원래 목적이 "이 암호문이 어느 응답에서 왔는지" 매칭이라
  // URL/상태만으로는 못 맞춘다. clone()된 쪽만 읽고 원본 응답은 그대로 호출자에게 돌려준다.
  function hookNetwork() {
    let installed = 0;
    if (typeof window.fetch === 'function' && install(window, 'fetch', original => function (...args) {
      const promise = original.apply(this, args);
      return observePromise(promise, response => {
        console.log('%c[fetch]', 'color:blue', response.url, response.status);
        record('network', `fetch HTTP ${response.status}`, response.url);
        try {
          response.clone().text().then(body => {
            if (body) {
              const raw = preview(body);
              console.log('%c[fetch] body', 'color:blue', response.url, raw);
              record('network', `fetch body ${response.url}`, raw);
            }
          }, () => {});
        } catch {}
      });
    }, 'window.fetch')) installed++;
    if (typeof XMLHttpRequest !== 'undefined' &&
        install(XMLHttpRequest.prototype, 'send', original => function (...args) {
          this.addEventListener('loadend', () => {
            console.log('%c[xhr]', 'color:blue', this.responseURL, this.status);
            record('network', `xhr HTTP ${this.status}`, this.responseURL);
            if (this.responseText) {
              const raw = preview(this.responseText);
              console.log('%c[xhr] body', 'color:blue', this.responseURL, raw);
              record('network', `xhr body ${this.responseURL}`, raw);
            }
          }, { once: true });
          return original.apply(this, args);
        }, 'XMLHttpRequest.send')) installed++;
    return installed;
  }

  // 사용: recon.tryDecode('값') — 짧은 Base64/hex/JWT 값을 로컬에서 해석한다.
  function tryDecode(value) {
    const out = {};
    try {
      if (typeof value !== 'string' || value.length > 16384) return out;
      try { out.base64 = atob(value); } catch {}
      if (value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)) {
        try {
          out.hex = Array.from({ length: value.length / 2 }, (_, i) =>
            String.fromCharCode(parseInt(value.slice(i * 2, i * 2 + 2), 16))).join('');
        } catch {}
      }
      const parts = value.split('.');
      if (parts.length === 3) {
        try {
          const decodePart = part => {
            const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/')
              .padEnd(Math.ceil(part.length / 4) * 4, '='));
            return JSON.parse(new TextDecoder('utf-8', { fatal: true })
              .decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
          };
          out.jwtHeader = decodePart(parts[0]);
          out.jwtPayload = decodePart(parts[1]);
        } catch {}
      }
    } catch {}
    console.log('[decode]', out);
    record('decode', '결과', out);
    return out;
  }

  // 사용: recon.hookAll() — 웹팩, WebCrypto, 네트워크 관찰 후킹을 한 번에 설치한다.
  function hookAll() {
    return { webpack: hookWebpackCrypto(), webcrypto: hookWebCrypto(), network: hookNetwork() };
  }

  // 사용: recon.unhookAll() — 이 도구가 설치한 후킹을 모두 원래 함수로 복원한다.
  function unhookAll() {
    let restored = 0;
    for (const { holder, name, original, wrapper, hadOwnProperty } of hooked.splice(0).reverse()) {
      try {
        if (holder[name] !== wrapper) continue;
        if (hadOwnProperty) holder[name] = original;
        else delete holder[name];
        restored++;
      } catch { console.warn(`[hook] 복원 실패: ${name}`); }
    }
    return restored;
  }

  return { scanAllScripts, hookWebpackCrypto, hookWebCrypto, hookNetwork,
    tryDecode, findWebpackExports, hookAll, unhookAll, hits, clearResults };
})();
console.log('recon 로드됨. recon.scanAllScripts() / recon.hookWebpackCrypto() / recon.hookWebCrypto() / recon.hookNetwork() / recon.hookAll() / recon.tryDecode("값") / recon.findWebpackExports(["이름"]) / recon.hits() / recon.clearResults() / recon.unhookAll()');
