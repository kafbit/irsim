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
        #__trailer .tr-cursor{position:absolute;left:0;top:0;width:28px;height:28px;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));will-change:transform}
        #__trailer .tr-ripple{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:3px solid #60a5fa;background:rgba(96,165,250,.28);opacity:0}
        #__trailer .tr-ripple.go{animation:tr-ripple .55s ease-out forwards}
        @keyframes tr-ripple{0%{transform:scale(.4);opacity:.95}100%{transform:scale(3.4);opacity:0}}
        #__trailer .tr-key{position:absolute;left:50%;bottom:210px;transform:translateX(-50%) translateY(8px);display:flex;gap:8px;opacity:0;transition:opacity .15s,transform .15s}
        #__trailer .tr-key.on{opacity:1;transform:translateX(-50%) translateY(0)}
        #__trailer .tr-keycap{min-width:44px;padding:10px 18px;border-radius:12px;background:#f4f4f2;color:#14161a;font-size:26px;font-weight:600;text-align:center;box-shadow:0 3px 0 #9a9ca3,0 10px 24px rgba(0,0,0,.4);border:1px solid #d6d7d2}
        #__trailer .tr-caption{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);max-width:1500px;padding:16px 34px;border-radius:999px;background:rgba(10,11,13,.82);color:#fff;font-size:32px;font-weight:600;letter-spacing:.1px;white-space:nowrap;opacity:0;transition:opacity .35s;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12)}
        #__trailer .tr-caption.on{opacity:1}
      </style>
      <div class="tr-ripple"></div>
      <svg class="tr-cursor" viewBox="0 0 28 28" xmlns="${NS}"><path d="M4 2 L4 22 L9.2 17.4 L12.6 25 L16.2 23.4 L12.8 15.9 L19.8 15.9 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <div class="tr-key"></div>
      <div class="tr-caption"></div>`
    document.documentElement.appendChild(root)
  }
  const q = (selector) => document.querySelector(`#__trailer ${selector}`)
  let keyTimer = 0
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
