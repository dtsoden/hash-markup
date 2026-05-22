<!--
  Hash Markup feature test document. Cover everything the editor is
  expected to render in WYSIWYG mode AND keep intact in Markdown mode.
  HTML comments should be invisible in WYSIWYG; this whole block
  should not appear on screen there.
-->

# H1 Heading

## H2 Heading

### H3 Heading

#### H4 Heading

##### H5 Heading

###### H6 Heading

---

## Paragraph and inline formatting

This is a plain paragraph with **bold**, *italic*, ***bold italic***,
~~strikethrough~~, and `inline code`.

Spell-check probe (these are intentionally misspelled in prose so they
should get red underlines): recieve, occured, seperate, definately.
The same words inside `recieve occured` should NOT be flagged because
they're inline code.

A line break via two spaces\
appears here.

## Links

* Inline link: [OpenAI](https://openai.com)

* Autolink (angle brackets): <https://example.com>

* Bare URL autolink (GFM): <https://github.com/dtsoden/hash-markup>

* Link with title: [Hover me](https://example.com "Tooltip text")

## Blockquote

> "The best way to predict the future is to invent it." Alan Kay
>
> Blockquotes can span multiple lines and contain **formatting**, `code`,
> and even other blocks.

## Lists

### Unordered

* Apples

* Oranges

  * Valencia

  * Blood

* Bananas

* recieve (misspelled in a list item, should be underlined)

### Ordered

1. First
2. Second

   1. Second.a
   2. Second.b
3. Third

### Task list

* [x] Write the editor

* [x] Live-preview WYSIWYG

* [ ] Ship v0.2.0

* [ ] Celebrate

## Table

| Column A | Column B | Numeric |
| :------- | :------: | ------: |
| left     |  center  |     100 |
| foo      |    bar   |   1,234 |
| lorem    |   ipsum  |      42 |

## Horizontal rule

Above this line is a paragraph.

***

Below the rule is another paragraph.

## Code

Inline: use `editor.getMarkdown()` to retrieve.

Fenced (no language) — misspellings inside should NOT be flagged by
spell check:

```
plain text recieve occured seperate definately
no highlighting
```

Fenced JavaScript:

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet('world'));
```

Fenced TypeScript:

```typescript
interface User { id: number; name: string }
const users: User[] = [{ id: 1, name: 'Ada' }];
```

Fenced Python:

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

Fenced Bash:

```bash
#!/usr/bin/env bash
for f in *.md; do
  wc -l "$f"
done
```

## Images

![Placeholder image](https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/120px-Placeholder_view_vector.svg.png)

## Highlight (==text==)

You can ==highlight text== inline with double equals signs. In WYSIWYG
the ==marker characters== are hidden and the content gets a yellow
background; in the raw mode and saved file, the source stays as
literal `==text==`. PDF/HTML export renders `<mark>` tags.

A sentence with ==multiple== ==highlighted== ==spans==.

## Subscript and superscript (HTML tag form, current toolbar output)

Chemical formulas: H<sub>2</sub>O, CO<sub>2</sub>, C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>.

Math: x<sup>2</sup> + y<sup>2</sup> = z<sup>2</sup>, E = mc<sup>2</sup>, 2<sup>10</sup> = 1024.

The toolbar Subscript / Superscript buttons write `<sub>` / `<sup>` tags
(this is the canonical form). Toggle from one to the other on selected
text and it swaps cleanly (clear-first behavior, no nested mess).

## Subscript and superscript (legacy Pandoc form, still rendered)

Older files that used the single-tilde / single-caret form still render
correctly so you don't lose old content: H~2~O, x^2^.

## Definition lists

Pandoc-style. Term on its own line, definitions prefixed with `:` on
following lines. Renders as `<dl><dt><dd>` in HTML / PDF.

Markdown
: A lightweight markup language for plain-text formatting.
: Created by John Gruber in 2004.

Hash Markup
: A cross-platform editor for Markdown built on Electron + Milkdown.

## Footnotes

Body text with a reference[^1]. Another reference[^longer-label] inline.
The references show as superscripted blue `[1]` markers in WYSIWYG and
become real footnote links in the exported PDF / HTML.

[^1]: This is the first footnote, defined at the bottom of the document.

[^longer-label]: Footnotes can use named labels instead of numbers.
    Multi-line continuation is supported when the line is indented.

## Emoji shortcodes

Inline emojis render via shortcode while the markdown source keeps the
text intact: :smile: :heart: :fire: :rocket: :tada: :thumbsup: :eyes: :pray:

A whole sentence with emojis :wave: hello :coffee: morning :pizza: lunch.

Inside `code blocks :smile: should NOT render` and stay as text.

## HTML comments (invisible in WYSIWYG)

<!-- secret note: should not appear on screen -->

Above this line is a comment that should NOT render.

## HTML inline (only when sanitizer is OFF)

<span>plain inline HTML</span>

## Heading IDs (auto-generated)

The headings above each get an `id` attribute auto-derived from the
heading text (e.g. `## My Section` -> `id="my-section"`). Useful for
deep-linking anchors in exported HTML and PDF output.

## Disabling auto-URL

Wrap the URL in backticks to keep it as plain text without auto-linking:
`https://example.com`. Versus the bare form: <https://example.com> (which
becomes a link).

## Nested / combined

> A blockquote with a list:
>
> * one
>
> * two
>
>   * nested
>
> * three
>
> ...and some `code` in it.

## Escaping

Literal asterisks: \*not italic\*. Literal backticks: \`not code\`.
