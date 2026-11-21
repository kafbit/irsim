# 01 · Board runtime

What `apps/design/public/runtime/` must do, read off the 181 boards themselves. It replaces
the `./support.js` Claude's canvas serves; that file is not in this repository.

## File anatomy

```html
<!doctype html>
<html lang="ar" dir="rtl"><head>
  <title>…</title><script src="./support.js"></script>
</head><body>
<x-dc>
  <helmet><!-- <link>, <style> that belong in the head --></helmet>
  <!-- template -->
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"label":{"editor":"text","default":"…"},"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic { renderVals() { … } }
</script>
</body></html>
```

- `x-dc` and `helmet` are wrappers, not elements: their children move to the body and the
  head. Everything else in the template is rendered as written.
- `data-props` describes the props. An entry is either `{editor, default, options}` or
  `{editor: null}`, which means the prop has no default and is only ever passed by a parent.
  `$preview` (`{width, height}`) is the frame size, not a prop. `editor` is design-time
  metadata: it is not part of the value.
- The script always declares `class Component extends DCLogic` and returns an object from
  `renderVals()`. Template holes resolve against that object only.
- The board's own `data-props` defaults are the root props. `?` overrides come from the
  canvas env (none in v1).

## Holes

A hole is `{{a.b.c}}`; 0 of the 5,000+ holes contain an operator, a call or a literal, so a
dotted lookup is the whole language.

| Where the hole is | Rule |
| --- | --- |
| The whole attribute value (`value="{{label}}"`, `disabled="{{yes}}"`) | The raw value, not a string: `false` omits the attribute, `true` sets `""`, an object/array is kept as the prop value |
| A mixed attribute (`style="width: {{w}}; color: {{c}}"`) | Interpolated, each value stringified |
| A text node (`<span>{{label}}</span>`) | Interpolated; `null`/`undefined` render as the empty string |

## Tags

| Tag | Behaviour |
| --- | --- |
| `sc-if value="{{x}}"` | Renders children when `x` is truthy. No `else`. 767 uses |
| `sc-for list="{{xs}}" as="a"` | Renders children per item, `a` in scope; also `{{$index}}`. 442 uses |
| `dc-import name="Sidebar" …` | Mounts `design/Sidebar.html` as a child component. Every other attribute is a prop; `hint-size` and `hint-placeholder-*` are canvas hints and are dropped. 640 uses, always a paired tag, always empty content |

`dc-import` resolves a sibling file: `name` → `<name>.html`, whatever the importer. The legacy name
`<name>.dc.html` is still read when no `<name>.html` board exists. The import graph has a maximum depth of 18 (`UIKit`). A missing target renders a visible marker
and reports the board and the name.

## Props of an imported component

The child's `data-props` defaults are applied first, then the attributes from the import
override them. A raw value keeps its type. A string is coerced by the declared type: a
boolean default parses `"true"`/`"false"`, a numeric default goes through `Number`, anything
else stays a string. This is what keeps `disabled="{{no}}"` from becoming the string
`"false"`.

## Logic

`DCLogic` provides exactly three members: `this.props`, `this.state`, `this.setState(next)`.
The boards add their own fields (`this.raf`, `this.embla`, `this.audio`) and their own helper
methods; nothing else is inherited.

- `constructor(props)` is optional (66 boards have one) and calls `super(props)`.
- `renderVals()` is called on every render and returns the template scope.
- `setState` merges into `state`, then re-renders that component subtree (`componentDidUpdate`).
- `componentWillUnmount()` runs when a rendered subtree is discarded.
- `ref="{{fn}}"` calls `fn(element)` after mount; 3 uses, all for measuring.
- `onClick`, `onChange`, `onInput`, `onKeyDown`, `onPointerDown/Move/Up/Cancel`,
  `onMouseEnter/Leave`, `onFocus`, `onBlur`, `onScroll`, `onDoubleClick` bind the function in
  the scope. `onClick="{{fn}}"` is the common form.

Re-render reuses a child instance when its import position and props are unchanged, so a
parent `setState` does not reset an imported table's column widths or an open menu. A child
whose props changed is re-rendered in place, not remounted.

## Environment

`window.__CANVAS_ENV__` is injected before the runtime:

```json
{
  "board": "Leads",
  "locale": "ar",
  "rev": 12,
  "tokens": { "#14161a": "#14161a", "#e4e4e0": "#d0d0c8" },
  "strings": { "العملاء": "properties.leads.title" },
  "values": { "ar": { "properties.leads.title": "العملاء" }, "en": { "properties.leads.title": "Leads" } }
}
```

1. **Tokens** replace on the board source before parsing: every key hex, case-insensitive,
   whole match, so a change reaches `<style>`, inline `style` and a component's JS colour
   arrays alike. Radius and font size are replaced by property-scoped patterns
   (`border-radius: 14px`, `font-size: 12px`), never by bare `14px`.
2. **Strings** replace on the rendered DOM: a text node whose trimmed value equals a bound
   Arabic literal, or an attribute value that equals one, becomes `values[locale][key]`.
   Attribute names `class`, `id`, `style` and `d` are skipped. An unmapped literal stays as it
   is and is counted.
3. `lang` and `dir` on `<html>` become the env's locale and direction; a hole-driven
   `dir="{{dir}}"` already follows the component's own props.
4. When the locale is `ar`, every `values.ar[key]` is the literal itself, so AR is a no-op
   that also proves the mapping.

The runtime posts `{type:'ready'|'error'|'strings', board, details}` to `parent`; the canvas
uses `ready` to stop the loading skeleton and `strings` to fill the coverage panel.

## Shared folder

`<design>/shared/` holds files that every board frame can use.
The name is fixed and there is no config.

1. Every `*.css` file, in path order, is injected as one `<style data-irsim-shared>` right after the opening `<head>` tag of each frame.
2. Every `*.js` and `*.mjs` file is loaded with `import()` before the boards render.
   The module namespace reaches each board script as `shared.<name>`.
   The name is the camelCase of the path without its extension, split on `/`, `-`, `_` and `.`.
   `table-sort.js` becomes `shared.tableSort` and `ui/format.js` becomes `shared.uiFormat`.
   A module that fails to load is reported as a `shared` problem and skipped.
3. Any other file is served at `/b/shared/<path>`, so a board references it as `./shared/<path>`.
4. Files and folders whose name starts with `.` are ignored.
5. A change in the folder reloads every open frame and refreshes every thumbnail.
6. `irsim export` copies the folder to `b/shared` and injects the same style and module list.

## Sections

`canvas.json` can group a page's boards in `sections`.
Each section has an `id` and a `title`.
An optional `parent` names the `id` of another section, and sections nest at most 3 levels.
An optional `color` is one of `gray` (the default), `blue`, `green`, `amber`, `purple` and `red`.
A board's `section` names its innermost section.
A section can also store its area as `x`, `y`, `width` and `height` (all four, in canvas units), which the canvas writes when the user resizes or moves it.
Without them the section fits its boards. The drawn area always holds its boards and sub-sections, so a stored area can only be larger than that fit.

## Play

A board whose own markup binds an `onX` handler or links to another board is a prototype: it
gets a blue dot and a Play chip (Play on canvas, Play full screen). `"interactive": true|false` on
the board's entry in `canvas.json` overrides that guess. The toolbar's Play menu lists every board
of the page, prototypes first, and plays the pick full screen. `/p/<page>?board=<B>&play=canvas|full`
opens a board already playing.

In full screen play, a web page fills the window and scrolls like a site; every other board keeps
its size and scrolls when it is larger than the window. `"expand": "fill"` on the board's entry in `canvas.json` makes it a
page, and any other `expand` value does not. Without `expand`, a board at least 1024 px wide whose
root element (the first one after `<helmet>`) has no `width: <n>px` in its inline style is a page.

Inside a played board, `<a href="Cart.html">` (relative, or from the root as
`/sub/Cart.html`) moves Play to `Cart`: in place on the canvas, or in the full screen view. A
board on another page opens on that page. `href="#id"` scrolls inside the board, and an `https:`,
`mailto:` or `tel:` link opens a new tab. Each board keeps its own `state`. Esc, Stop or "Back to
canvas" ends Play.

Every board has a full screen Play view, whether or not it is a prototype. Its header picks the
viewport the board lays out for, so the board's media queries answer to it: Fit window, Phone
390 x 844, Large phone 430 x 932, Tablet 768 x 1024, Laptop 1280 x 800, Desktop 1440 x 900, Board
size, or Responsive, where the edges of the frame are dragged and the width and height boxes accept
a size from 200 to 20000. Rotate swaps width and height. The board is shown at 100% and a board
larger than the stage scrolls inside it; the zoom menu next to the percentage switches to Fit width
(the width fills the stage) or Contain (the whole board shrinks to fit). The choices are kept in the
browser. The
Comment button (or C) picks an element in the frame. The comment stores a `view` with the viewport
size, its preset and the scroll position of the frame. A comment card with a `view` shows the
viewport as a chip, and shows "Viewing at ..." while Play is at that size. Clicking such a card on
the canvas opens the board in Play at the stored viewport and scrolls to the element. Esc leaves
comment mode first, then ends Play.

## Limits, deliberately

- No `else` branch, no expression language, no host component protocol beyond the five tags.
- `rgba()` shadows and `1px` borders are not variables.
- The board is read-only: a click runs the board's own handlers, and a form control changes
  its own DOM state, but nothing is persisted.
- External requests the boards make on their own (the Embla CDN script in `Motion`) are
  allowed; an offline machine loses the carousel and nothing else.
