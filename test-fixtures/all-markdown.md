<!--
  This is an HTML comment. It should NOT appear in the WYSIWYG preview.
  If you see this sentence on screen outside of Markdown mode, rendering
  is broken.
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

A link: [OpenAI](https://openai.com). An autolink: <https://example.com>.

A line break via two spaces  
appears here.

## Blockquote

> "The best way to predict the future is to invent it." — Alan Kay
>
> Blockquotes can span multiple lines and contain **formatting**.

## Lists

### Unordered

- Apples
- Oranges
  - Valencia
  - Blood
- Bananas

### Ordered

1. First
2. Second
   1. Second.a
   2. Second.b
3. Third

### Task list

- [x] Write the editor
- [x] Wire Toast UI
- [ ] Ship v1
- [ ] Celebrate

## Table

| Column A | Column B | Numeric |
| :------- | :------: | ------: |
| left     | center   |     100 |
| foo      | bar      |   1,234 |
| lorem    | ipsum    |      42 |

## Horizontal rule

Above this line is a paragraph.

---

Below the rule is another paragraph.

## Code

Inline: use `editor.setMarkdown(...)` to replace.

Fenced (no language):

```
plain text
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

## Images

![Tiny pixel](https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/120px-Placeholder_view_vector.svg.png)

## HTML comments (should be invisible in WYSIWYG)

<!-- secret note: delete before publishing -->

Above this line is a comment that should NOT render.

## UML (plugin)

```uml
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
@enduml
```

## Chart (plugin)

```chart
,category1,category2
Jan,21,23
Feb,31,17
Mar,9,40

type: column
title: Monthly Revenue
x.title: Month
y.title: Amount
```

## Color (plugin)

<span style="color: #e11d48">Red text</span> and
<span style="color: #0ea5e9">blue text</span> via the color picker.

## Nested / combined

> A blockquote with a list:
>
> - one
> - two
>   - nested
> - three
>
> …and some `code` in it.

## Escaping

Literal asterisks: \*not italic\*. Literal backticks: \`not code\`.
