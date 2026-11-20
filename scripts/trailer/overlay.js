(() => {
  if (window.top !== window) return
  if (window.__trailer) return
  const NS = 'http://www.w3.org/2000/svg'
  const install = () => {
    if (document.getElementById('__trailer')) return
    const root = document.createElement('div')
    root.id = '__trailer'
    root.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;direction:ltr;font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
    )
    root.innerHTML = `
      <style>
        #__trailer .tr-cursor{z-index:4;position:absolute;left:0;top:0;width:28px;height:28px;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));will-change:transform}
        #__trailer .tr-ripple{z-index:4;position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid #60a5fa;background:rgba(96,165,250,.28);opacity:0}
        #__trailer .tr-ripple.go{animation:tr-ripple .55s ease-out forwards}
        @keyframes tr-ripple{0%{transform:scale(.4);opacity:.95}100%{transform:scale(3.4);opacity:0}}
        #__trailer .tr-key{z-index:3;position:absolute;left:50%;bottom:210px;transform:translateX(-50%) translateY(8px);display:flex;gap:8px;opacity:0;transition:opacity .15s,transform .15s}
        #__trailer .tr-key.on{opacity:1;transform:translateX(-50%) translateY(0)}
        #__trailer .tr-keycap{min-width:44px;padding:10px 18px;border-radius:12px;background:#f4f4f2;color:#14161a;font-size:26px;font-weight:600;text-align:center;box-shadow:0 3px 0 #9a9ca3,0 10px 24px rgba(0,0,0,.4);border:1px solid #d6d7d2}
        #__trailer .tr-caption{z-index:3;position:absolute;left:50%;bottom:120px;transform:translateX(-50%);max-width:1500px;padding:16px 34px;border-radius:999px;background:rgba(10,11,13,.82);color:#fff;font-size:32px;font-weight:600;letter-spacing:.1px;white-space:nowrap;opacity:0;transition:opacity .35s;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12)}
        #__trailer .tr-caption.on{opacity:1}
        #__trailer .tr-chapter{z-index:3;position:absolute;left:56px;top:48px;display:flex;gap:18px;align-items:stretch;padding:18px 30px 20px 24px;border-radius:18px;background:rgba(10,11,13,.78);border:1px solid rgba(255,255,255,.12);opacity:0;transform:translateX(-40px)}
        #__trailer .tr-chapter.in{opacity:1;transform:none;transition:opacity .45s ease-out,transform .45s ease-out}
        #__trailer .tr-chapter.out{opacity:0;transition:opacity .25s}
        #__trailer .tr-chapter-bar{width:6px;border-radius:3px;background:#6366f1;flex:none}
        #__trailer .tr-chapter-n{font-size:22px;font-weight:600;letter-spacing:2px;color:#a5b4fc;line-height:1.2}
        #__trailer .tr-chapter-name{font-size:72px;font-weight:800;color:#fff;line-height:1.1;text-shadow:0 4px 24px rgba(0,0,0,.6);white-space:nowrap}
        #__trailer .tr-spot{z-index:1;position:absolute;opacity:0;transition:opacity .25s}
        #__trailer .tr-spot.on{opacity:1}
        #__trailer .tr-spot-hole{position:absolute;inset:0;border-radius:14px;box-shadow:0 0 0 200vmax rgba(5,6,8,.58)}
        #__trailer .tr-spot-ring{position:absolute;inset:0;border-radius:14px;border:3px solid #818cf8;animation:tr-pulse .9s ease-in-out 2}
        @keyframes tr-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.04);opacity:.6}}
        #__trailer .tr-spot-label{position:absolute;white-space:nowrap;padding:10px 22px;border-radius:999px;background:#4f46e5;color:#fff;font-size:26px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.4)}
      </style>
      <div class="tr-ripple"></div>
      <svg class="tr-cursor" viewBox="0 0 28 28" xmlns="${NS}"><path d="M4 2 L4 22 L9.2 17.4 L12.6 25 L16.2 23.4 L12.8 15.9 L19.8 15.9 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <div class="tr-key"></div>
      <div class="tr-spot"><div class="tr-spot-hole"></div><div class="tr-spot-ring"></div><div class="tr-spot-label"></div></div>
      <div class="tr-chapter"><div class="tr-chapter-bar"></div><div><div class="tr-chapter-n"></div><div class="tr-chapter-name"></div></div></div>
      <div class="tr-caption"></div>`
    document.documentElement.appendChild(root)
  }
  const q = (selector) => document.querySelector(`#__trailer ${selector}`)
  let keyTimer = 0
  let chapterTimer = 0
  window.__trailer = {
    install,
    cursor(x, y, visible = true) {
      install()
      const el = q('.tr-cursor')
      el.style.transform = `translate(${x - 4}px, ${y - 2}px)`
      el.style.opacity = visible ? '1' : '0'
    },
    ripple(x, y) {
      install()
      const el = q('.tr-ripple')
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.classList.remove('go')
      void el.offsetWidth
      el.classList.add('go')
    },
    key(labels, ms = 800) {
      install()
      const el = q('.tr-key')
      el.innerHTML = labels.map((label) => `<span class="tr-keycap">${label}</span>`).join('')
      el.classList.add('on')
      clearTimeout(keyTimer)
      keyTimer = setTimeout(() => el.classList.remove('on'), ms)
    },
    chapter(n, name) {
      install()
      const el = q('.tr-chapter')
      clearTimeout(chapterTimer)
      const show = () => {
        el.querySelector('.tr-chapter-n').textContent = String(n).padStart(2, '0')
        el.querySelector('.tr-chapter-name').textContent = name
        el.classList.remove('out')
        el.classList.remove('in')
        void el.offsetWidth
        el.classList.add('in')
      }
      if (n === null || n === undefined) {
        el.classList.remove('in')
        el.classList.add('out')
        return
      }
      if (el.classList.contains('in')) {
        el.classList.remove('in')
        el.classList.add('out')
        chapterTimer = setTimeout(show, 260)
      } else {
        show()
      }
    },
    spotlight(rect, label) {
      install()
      const el = q('.tr-spot')
      if (!rect) {
        el.classList.remove('on')
        return
      }
      const pad = 12
      const x = rect.x - pad
      const y = rect.y - pad
      const w = rect.width + pad * 2
      const h = rect.height + pad * 2
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      const pill = el.querySelector('.tr-spot-label')
      pill.textContent = label ?? ''
      pill.style.left = '0px'
      pill.style.top = '0px'
      const pw = pill.offsetWidth
      const ph = pill.offsetHeight
      const above = y >= 90
      const top = above ? -ph - 14 : h + 14
      let left = (w - pw) / 2
      left = Math.min(Math.max(left, 16 - x), window.innerWidth - 16 - pw - x)
      pill.style.left = `${left}px`
      pill.style.top = `${top}px`
      const ring = el.querySelector('.tr-spot-ring')
      ring.style.animation = 'none'
      void ring.offsetWidth
      ring.style.animation = ''
      el.classList.add('on')
    },
    caption(text) {
      install()
      const el = q('.tr-caption')
      if (text) {
        el.textContent = text
        el.classList.add('on')
      } else {
        el.classList.remove('on')
      }
    },
  }
  if (document.documentElement) install()
  else document.addEventListener('DOMContentLoaded', install)
})()
