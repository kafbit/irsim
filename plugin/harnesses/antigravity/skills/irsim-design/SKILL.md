---
name: irsim-design
description: The file formats of an irsim design folder: board files and design/canvas.json. Load it before you create or edit a board file or design/canvas.json, or when a project has a design folder of boards.
---

# irsim design files

Load this before you write a board file or `design/canvas.json`. For the order of work on a screen change (board first, user confirms, then code) follow the `irsim-workflow` skill.

## Where things live

- `.irsim.json` at the project root names the design folder: `{ "designDir": "design" }`. The default is `design`.
- `<designDir>/<Name>.html` is one board.
- `<designDir>/canvas.json` places boards on pages and in sections.
- `<designDir>/shared/` holds `*.css` (injected into every board), `*.js` and `*.mjs` (modules, reached as `shared.<name>`), and images and fonts (referenced as `./shared/<path>`). Names that start with `.` are ignored.
- `.irsim/` holds generated files (checks, screenshots, port). Never edit or commit it.

## A board file

- The file name is `<Name>.html`. `Name` matches `^[A-Za-z][A-Za-z0-9]*$`, for example `LeadsTable`.
- A legacy `<Name>.dc.html` is still read. Do not create new ones. When both exist, `<Name>.html` wins.
- A `.html` file is a board only when it contains `<x-dc>` or a `<script type="text/x-dc">`. Any other `.html` file in the folder is ignored.
- Parts of a board file:
  - `<title>`: the board title shown on the canvas.
  - `<script src="./support.js">` in the head. Leave it as written, the canvas serves the runtime under that name.
  - `<x-dc>`: the template. Its children are rendered as written. `<helmet>` inside it holds the `<link>` and `<style>` elements that belong in the head.
  - `<script type="text/x-dc" data-dc-script data-props='...'>`: the props as JSON in single quotes, then `class Component extends DCLogic` with `renderVals()` returning the values the template uses.
  - `$preview` inside `data-props` is the board size `{ "width": n, "height": n }`. It is not a prop. Without it the size is 1440 by 900.
- A hole is `{{a.b.c}}`, a dotted lookup in what `renderVals()` returns. There are no operators or calls. `<sc-if value="{{x}}">` and `<sc-for list="{{xs}}" as="item">` are the only control tags.
- `<dc-import name="Other" prop="value" ...>` mounts the board `Other` of the same folder. Every other attribute is a prop of it. `hint-size` and `hint-placeholder-*` are dropped. Write it as a pair with no content.
- `data-props` entries are `{ "editor": "text", "enum" or "number", "default": ..., "options": [...] }`, or `{ "editor": null }` for a prop only a parent passes.

A complete minimal board:

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<title>Greeting: dark</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>body{margin:0}</style>
</helmet>
<dc-import name="Greeting" theme="{{theme}}" hint-size="480px,240px"></dc-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"theme":{"editor":"enum","default":"dark","options":["light","dark"]},"$preview":{"width":480,"height":240}}'>
class Component extends DCLogic {
  renderVals() {
    return { theme: this.props.theme }
  }
}
</script>
</body>
</html>
```

## Props and state boards

- The canvas has no prop switcher. Draw each state as its own board: a wrapper of the base board with fixed props, named `<Board><State>` (`GreetingDark`), with its own title, placed on a page.
- A wrapper is the example above: one `<dc-import>` with the fixed props, the `theme` prop passed down as `theme="{{theme}}"`, and the same `$preview` size as the base.
- Do not copy the base markup into a state board.
- Every board has a `theme` prop, `light` or `dark`, when the project has both themes.

## Tokens

- Colors, radius and type come from the project's token files (this repo: `app/src/app/ui-tokens.css` and `globals.css`). Write `var(--token)` and never a close value. If a value is missing, ask.
- Put styles that many boards share in `<designDir>/shared/*.css`.
- English boards set `<html lang="en" dir="ltr">` and the same on the root element. A project in another language sets its own `lang` and `dir`.

## design/canvas.json

Top level: `{ "version": 1, "pages": [...], "overrides": {...}, "bindings": {...} }`. `overrides` and `bindings` are required. The canvas writes them, so leave their content as it is. A new file starts with `"overrides": {"colors": {}, "radius": {}, "type": {}}` and `"bindings": {}`. `irsim lint` reports an error when either is missing or malformed.

Page:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Used in the route `/p/<id>`. Lowercase kebab-case. |
| `title` | string | yes | Shown in the sidebar. At most 120 characters. |
| `icon` | string | no | A Lucide icon name in kebab-case. Give every page one. |
| `sections` | array | no | Section entries, below. |
| `boards` | array | yes | Board entries, below. |

Board entry:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | The board file name without `.html`. A name with no file is dropped. |
| `title` | string | filled | Read from `<title>`. Never write it by hand. |
| `width`, `height` | number | filled | Read from `$preview`. Never write them by hand. A size under 240 x 160 gets a lint warning and is fine for a small part. |
| `x`, `y` | number | filled | Canvas position. Leave out for a new board, it is placed below the others. Do not place by hand. |
| `section` | string | no | The `id` of the innermost section of the same page. |
| `interactive` | boolean | no | Overrides the guess whether the board is a prototype. |
| `expand` | string | no | `"fill"` makes it a web page in full screen play. |
| `variantOf`, `variantLabel` | string | no | Written by the Variants feature. Do not write them. |
| `baseHash` | string | no | Written by the canvas. Do not write it. |

Section entry:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique on the page. |
| `title` | string | yes | Shown as the section label. |
| `parent` | string | no | The `id` of another section of the page. At most 3 levels, no cycle. |
| `color` | string | no | `gray` (default), `blue`, `green`, `amber`, `purple` or `red`. |
| `x`, `y`, `width`, `height` | number | no | A stored area. All four or none. Written by the canvas. |
| `layout` | object | no | `{ "mode": "wrap", "gap": 0 to 400 }`. Written by the canvas. |
| `variantOf`, `baseSection` | string | no | Written by the Variants feature. Do not write them. |

A complete 2-page example (the fields marked filled are left out on purpose):

```json
{
  "version": 1,
  "pages": [
    {
      "id": "onboarding",
      "title": "Onboarding",
      "icon": "hand",
      "sections": [
        { "id": "greeting", "title": "Greeting" },
        { "id": "greeting-states", "title": "States", "parent": "greeting", "color": "red" }
      ],
      "boards": [
        { "name": "Greeting", "section": "greeting" },
        { "name": "GreetingDark", "section": "greeting-states" }
      ]
    },
    {
      "id": "settings",
      "title": "Settings",
      "icon": "settings",
      "boards": [{ "name": "SettingsForm" }]
    }
  ],
  "overrides": { "colors": {}, "radius": {}, "type": {} },
  "bindings": {}
}
```

`irsim build` fills `title`, `width`, `height`, `x` and `y` from the board files, adds boards that no page lists to the `unsorted` page, and drops entries whose file is gone. A file that has no entry yet shows up on the `unsorted` page.

## Finish

1. Run `irsim lint`. Fix every error and read every warning. `design_canvas {action: "lint"}` returns the same list.
2. Run `irsim build` to fill `canvas.json`. Never hand-write `title`, `width` or `height`. `irsim lint --fix` runs the build too and also renames legacy `.dc.html` files to `.html`.
3. Run `design_canvas {action: "check", page: "<id>"}` and look at the screenshots. `check` also lists every lint error first, under `Format problems:`, and the warnings of the checked boards. It counts the other warnings, and `design_canvas {action: "lint"}` lists them.
4. Report the board routes `/p/<page>?board=<Board>`.
