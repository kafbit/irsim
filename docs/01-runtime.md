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
| `dc-import name="Sidebar" …` | Mounts `design/Sidebar.dc.html` as a child component. Every other attribute is a prop; `hint-size` and `hint-placeholder-*` are canvas hints and are dropped. 640 uses, always a paired tag, always empty content |

`dc-import` resolves a sibling file: `name` → `<name>.dc.html`, whatever the importer. The
import graph has a maximum depth of 18 (`UIKit`). A missing target renders a visible marker
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

## Limits, deliberately

- No `else` branch, no expression language, no host component protocol beyond the five tags.
- `rgba()` shadows and `1px` borders are not variables.
- The board is read-only: a click runs the board's own handlers, and a form control changes
  its own DOM state, but nothing is persisted.
- External requests the boards make on their own (the Embla CDN script in `Motion`) are
  allowed; an offline machine loses the carousel and nothing else.
