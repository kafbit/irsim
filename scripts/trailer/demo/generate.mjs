import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CSS = `
body{margin:0}
.app{--ink:#0f172a;--sub:#475569;--muted:#64748b;--line:#e2e8f0;--bg:#f8fafc;--accent:#4f46e5;--tint:#eef2ff;--ok:#dcfce7;--ok-ink:#166534;--bad:#fee2e2;--bad-ink:#991b1b;--soft:#f1f5f9;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;min-height:var(--cv-h,100vh);display:flex;font-size:15px;line-height:1.4}
.app *{box-sizing:border-box}
.col{flex-direction:column}
.side{width:232px;flex:none;border-right:1px solid var(--line);background:var(--bg);padding:24px 16px;display:flex;flex-direction:column;gap:6px}
.logo{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;padding:0 8px 20px}
.logo i{width:26px;height:26px;border-radius:8px;background:var(--accent);display:block}
.nav{padding:10px 12px;border-radius:8px;color:var(--sub);font-weight:500}
.nav.on{background:var(--tint);color:var(--accent);font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px 32px;border-bottom:1px solid var(--line)}
.top h1{margin:0;font-size:26px;font-weight:700}
.content{padding:28px 32px;display:flex;flex-direction:column;gap:24px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.cards4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.card{border:1px solid var(--line);border-radius:14px;padding:18px 20px;background:#fff}
.card small{color:var(--muted);font-size:14px;font-weight:500}
.card b{display:block;font-size:30px;margin-top:6px;letter-spacing:-.5px}
.card em{font-style:normal;color:var(--ok-ink);font-size:13px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:15px}
th{text-align:left;color:var(--muted);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.4px;padding:12px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
td{padding:14px 16px;border-bottom:1px solid var(--line)}
.tbl{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:13px;font-weight:600}
.paid{background:var(--ok);color:var(--ok-ink)}
.due{background:var(--tint);color:var(--accent)}
.late{background:var(--bad);color:var(--bad-ink)}
.draft{background:var(--soft);color:var(--sub)}
.btn{display:inline-block;border-radius:10px;font-weight:600}
.prim{background:var(--accent);color:#fff;padding:11px 20px}
.ghost{background:#fff;color:var(--ink);border:1px solid #cbd5e1;padding:11px 20px}
h2{margin:0;font-size:18px}
.chart{display:flex;align-items:flex-end;gap:14px;height:170px;padding:8px 4px 0}
.chart i{flex:1;background:var(--tint);border-radius:8px 8px 0 0;display:block}
.chart i.hi{background:var(--accent)}
.grow{flex:1}
.hamb{display:none}
`

const MEDIA = `
@media (max-width:1000px){.side{width:76px;padding:24px 10px}.side .nav{font-size:0;padding:10px 0;text-align:center}.side .nav:before{content:"";display:inline-block;width:20px;height:20px;border-radius:6px;background:var(--line)}.side .nav.on:before{background:var(--accent)}.logo span{display:none}.cards4{grid-template-columns:repeat(2,1fr)}}
@media (max-width:640px){.side{display:none}.hamb{display:block;width:36px;height:36px;border-radius:10px;background:var(--soft)}.top{padding:16px}.top h1{font-size:20px}.content{padding:16px}.cards4,.cards{grid-template-columns:repeat(2,1fr);gap:12px}.card b{font-size:22px}.hide-s{display:none}.chart{height:110px}.top .btn{display:none}}
`

const wrap = (title, width, height, body, extraCss = '', cls = '') => `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>${CSS}${extraCss}</style>
</helmet>
<div dir="ltr" lang="en" class="app ${cls}">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${width},"height":${height}}}'>
class Component extends DCLogic {
  renderVals() {
    return {}
  }
}
</script>
</body>
</html>
`

const side = (active) => `<aside class="side">
<div class="logo"><i></i><span>Ledgerly</span></div>
${['Dashboard', 'Invoices', 'Customers', 'Reports', 'Settings'].map((n) => `<div class="nav${n === active ? ' on' : ''}">${n}</div>`).join('\n')}
</aside>`

const invoices = [
  ['INV-1042', 'Northwind Studio', 'Mar 28', '$2,400.00', 'paid', 'Paid'],
  ['INV-1041', 'Bluebird Coffee', 'Mar 30', '$860.00', 'due', 'Due'],
  ['INV-1040', 'Halden Legal', 'Mar 12', '$5,120.00', 'late', 'Overdue'],
  ['INV-1039', 'Pine and Oak', 'Apr 02', '$1,275.50', 'draft', 'Draft'],
  ['INV-1038', 'Orbit Labs', 'Apr 04', '$3,900.00', 'paid', 'Paid'],
  ['INV-1037', 'Maple Dental', 'Apr 09', '$640.00', 'due', 'Due'],
]
const rows = (n) =>
  invoices
    .slice(0, n)
    .map(([id, who, date, amount, cls, label]) => `<tr><td><b>${id}</b></td><td>${who}</td><td class="hide-s">${date}</td><td>${amount}</td><td><span class="pill ${cls}">${label}</span></td></tr>`)
    .join('\n')
const table = (n) => `<div class="tbl"><table>
<thead><tr><th>Invoice</th><th>Customer</th><th class="hide-s">Due</th><th>Amount</th><th>Status</th></tr></thead>
<tbody>
${rows(n)}
</tbody></table></div>`

const kpis = [['Revenue', '$48,230', '+12% this month'], ['Outstanding', '$9,880', '6 invoices'], ['Overdue', '$5,120', '1 invoice'], ['Paid this month', '$31,400', '+8% on February']]
const kpiRow = () => `<div class="cards4">${kpis.map(([a, b, c]) => `<div class="card"><small>${a}</small><b>${b}</b><em>${c}</em></div>`).join('')}</div>`
const chart = () => `<div class="card"><h2>Revenue by week</h2><div class="chart"><i style="height:38%"></i><i style="height:52%"></i><i style="height:44%"></i><i style="height:70%"></i><i style="height:60%"></i><i style="height:88%" class="hi"></i><i style="height:76%"></i><i style="height:64%"></i></div></div>`

const NEW_BTN = 'style="background:#ffffff;color:#334155;border:1px solid #cbd5e1;padding:8px 14px;font-size:14px"'

const boards = []
const add = (name, title, width, height, section, page, body, extra = '', cls = '') => boards.push({ name, title, width, height, section, page, html: wrap(title, width, height, body, extra, cls) })

add('Dashboard', 'Dashboard', 1100, 700, 'core-screens', 'app', `${side('Dashboard')}
<div class="main">
<div class="top"><h1>Dashboard</h1><span class="btn prim">New invoice</span></div>
<div class="content">
${kpiRow()}
${chart()}
<div><h2 style="margin-bottom:12px">Recent invoices</h2>${table(4)}</div>
</div></div>`, MEDIA)

add('Invoices', 'Invoices', 1100, 700, 'core-screens', 'app', `${side('Invoices')}
<div class="main">
<div class="top"><h1>Invoices</h1><span class="btn ghost" data-part="new-invoice" ${NEW_BTN}>New invoice</span></div>
<div class="content">
<div class="cards"><div class="card"><small>Outstanding</small><b>$9,880</b></div><div class="card"><small>Overdue</small><b>$5,120</b></div><div class="card"><small>Paid in March</small><b>$31,400</b></div></div>
${table(6)}
</div></div>`)

add('InvoiceDetail', 'Invoice detail', 1100, 700, undefined, 'app', `${side('Invoices')}
<div class="main">
<div class="top"><div><h1>INV-1040</h1><div style="color:var(--muted);margin-top:4px">Halden Legal</div></div><span class="pill late">Overdue</span></div>
<div class="content">
<div class="cards"><div class="card"><small>Amount</small><b>$5,120.00</b></div><div class="card"><small>Issued</small><b>Mar 01</b></div><div class="card"><small>Due</small><b>Mar 12</b></div></div>
<div class="tbl"><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>
<tr><td>Contract review</td><td>12 h</td><td>$240.00</td><td>$2,880.00</td></tr>
<tr><td>Filing preparation</td><td>6 h</td><td>$240.00</td><td>$1,440.00</td></tr>
<tr><td>Court fees</td><td>1</td><td>$800.00</td><td>$800.00</td></tr>
</tbody></table></div>
<div style="display:flex;gap:12px"><span class="btn prim">Send reminder</span><span class="btn ghost">Download PDF</span></div>
</div></div>`)

add('Settings', 'Settings', 1100, 700, undefined, 'app', `${side('Settings')}
<div class="main">
<div class="top"><h1>Settings</h1></div>
<div class="content" style="max-width:720px">
<div class="card"><h2>Business profile</h2><div style="display:grid;gap:12px;margin-top:14px"><div><small style="color:var(--muted)">Company name</small><div class="tbl" style="padding:11px 14px;margin-top:6px">Ledgerly Demo Studio</div></div><div><small style="color:var(--muted)">Billing email</small><div class="tbl" style="padding:11px 14px;margin-top:6px">billing@demo-studio.example</div></div></div></div>
<div class="card"><h2>Payment reminders</h2><p style="color:var(--sub);margin:8px 0 0">Send a reminder 3 days before the due date and again 2 days after.</p></div>
<div><span class="btn prim">Save changes</span></div>
</div></div>`)

add('DashboardMobile', 'Dashboard mobile', 390, 800, 'mobile', 'app', `<div class="main">
<div class="top"><div style="display:flex;align-items:center;gap:12px"><div class="hamb" style="display:block"></div><h1 style="font-size:20px">Dashboard</h1></div><span class="logo" style="padding:0"><i></i></span></div>
<div class="content" style="padding:16px">
<div class="cards4" style="grid-template-columns:repeat(2,1fr);gap:12px">${kpis.map(([a, b]) => `<div class="card" style="padding:14px"><small>${a}</small><b style="font-size:22px">${b}</b></div>`).join('')}</div>
${chart().replace('height:170px', 'height:110px')}
<h2>Recent invoices</h2>
${invoices.slice(0, 3).map(([id, who, , amount, cls, label]) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:14px"><div><b style="font-size:16px;margin:0">${id}</b><small>${who}</small></div><div style="text-align:right"><div style="font-weight:600">${amount}</div><span class="pill ${cls}">${label}</span></div></div>`).join('')}
</div></div>`)

add('InvoicesMobile', 'Invoices mobile', 390, 800, 'mobile', 'app', `<div class="main">
<div class="top"><div style="display:flex;align-items:center;gap:12px"><div class="hamb" style="display:block"></div><h1 style="font-size:20px">Invoices</h1></div><span class="btn prim" style="padding:8px 14px;font-size:14px">New</span></div>
<div class="content" style="padding:16px;gap:12px">
${invoices.map(([id, who, , amount, cls, label]) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:14px"><div><b style="font-size:16px;margin:0">${id}</b><small>${who}</small></div><div style="text-align:right"><div style="font-weight:600">${amount}</div><span class="pill ${cls}">${label}</span></div></div>`).join('')}
</div></div>`)

const mTop = (active) => `<div class="top" style="padding:20px 64px"><div class="logo" style="padding:0"><i></i><span>Ledgerly</span></div><div style="display:flex;gap:32px;align-items:center;font-weight:500;color:var(--sub)"><span style="${active === 'Home' ? 'color:var(--accent);font-weight:600' : ''}">Product</span><span style="${active === 'Pricing' ? 'color:var(--accent);font-weight:600' : ''}">Pricing</span><span>Docs</span><span class="btn ghost" style="padding:8px 16px">Sign in</span></div></div>`

add('Home', 'Home', 1100, 700, 'site', 'marketing', `<div class="main">
${mTop('Home')}
<div style="padding:50px 64px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:24px;background:linear-gradient(#f8fafc,#fff)">
<span class="pill due" style="font-size:15px">Invoicing for small studios</span>
<h1 style="margin:0;font-size:56px;letter-spacing:-2px;line-height:1.05;max-width:900px">Get paid faster, with invoices people enjoy opening.</h1>
<p style="margin:0;font-size:22px;color:var(--sub);max-width:680px">Ledgerly sends the invoice, nudges at the right time and shows you what is still outstanding.</p>
<div style="display:flex;gap:14px;margin-top:10px"><span class="btn prim" style="padding:16px 30px;font-size:18px">Start free</span><span class="btn ghost" style="padding:16px 30px;font-size:18px">See a demo</span></div>
</div>
<div style="padding:0 64px"><div class="cards" style="gap:20px"><div class="card"><h2>Send in seconds</h2><p style="color:var(--sub)">Pick a customer, add items, send.</p></div><div class="card"><h2>Automatic reminders</h2><p style="color:var(--sub)">Polite nudges before and after the due date.</p></div><div class="card"><h2>Clear reports</h2><p style="color:var(--sub)">Revenue and overdue totals at a glance.</p></div></div></div>
</div>`, '', 'col')

const plan = (name, price, items, hi) => `<div class="card" style="padding:28px;display:flex;flex-direction:column;gap:14px;${hi ? 'border:2px solid var(--accent);' : ''}"><h2>${name}</h2><div style="font-size:44px;font-weight:700;letter-spacing:-1px">${price}<span style="font-size:16px;font-weight:500;color:var(--muted)"> / month</span></div>${items.map((i) => `<div style="color:var(--sub)">${i}</div>`).join('')}<span class="btn ${hi ? 'prim' : 'ghost'}" style="text-align:center;margin-top:8px">Choose ${name}</span></div>`
add('Pricing', 'Pricing', 1100, 700, 'site', 'marketing', `<div class="main">
${mTop('Pricing')}
<div style="padding:40px 64px;display:flex;flex-direction:column;align-items:center;gap:36px">
<h1 style="margin:0;font-size:48px;letter-spacing:-1.5px">Simple pricing</h1>
<div class="cards" style="gap:24px;width:100%">${plan('Starter', '$0', ['5 invoices a month', 'Email reminders'], false)}${plan('Studio', '$19', ['Unlimited invoices', 'Reminders and reports', 'Custom branding'], true)}${plan('Agency', '$49', ['Everything in Studio', 'Five team members', 'Priority support'], false)}</div>
</div></div>`, '', 'col')

add('SignIn', 'Sign in', 1100, 700, 'site', 'marketing', `<div class="main" style="align-items:center;justify-content:center;background:var(--bg)">
<div class="card" style="width:440px;padding:36px;display:flex;flex-direction:column;gap:18px">
<div class="logo" style="padding:0"><i></i><span>Ledgerly</span></div>
<h1 style="margin:0;font-size:28px">Sign in to your account</h1>
<div><small style="color:var(--muted)">Email</small><div class="tbl" style="padding:12px 14px;margin-top:6px">you@studio.example</div></div>
<div><small style="color:var(--muted)">Password</small><div class="tbl" style="padding:12px 14px;margin-top:6px">••••••••••</div></div>
<span class="btn prim" style="text-align:center;padding:13px">Sign in</span>
</div></div>`, '', 'col')

const place = (name, x, y) => ({ name, x, y })
const positions = {
  Dashboard: [0, 0],
  Invoices: [1300, 0],
  InvoiceDetail: [0, 860],
  Settings: [1300, 860],
  DashboardMobile: [0, 2000],
  InvoicesMobile: [560, 2000],
  Home: [0, 0],
  Pricing: [1300, 0],
  SignIn: [2600, 0],
}

export async function writeDemo(dir) {
  await mkdir(dir, { recursive: true })
  for (const board of boards) await writeFile(join(dir, `${board.name}.dc.html`), board.html)
  const pages = [
    {
      id: 'app',
      title: 'App',
      icon: 'layout-dashboard',
      sections: [
        { id: 'core-screens', title: 'Core screens', color: 'blue' },
        { id: 'mobile', title: 'Mobile', color: 'green' },
      ],
    },
    { id: 'marketing', title: 'Marketing', icon: 'layout-dashboard', sections: [{ id: 'site', title: 'Website', color: 'blue' }] },
  ]
  for (const page of pages) {
    page.boards = boards
      .filter((board) => board.page === page.id)
      .map((board) => ({
        name: board.name,
        title: board.title,
        x: positions[board.name][0],
        y: positions[board.name][1],
        width: board.width,
        height: board.height,
        section: board.section,
      }))
  }
  await writeFile(join(dir, 'canvas.json'), `${JSON.stringify({ version: 1, pages, overrides: { colors: {}, radius: {}, type: {} }, bindings: {} }, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await writeDemo(process.argv[2])
}
