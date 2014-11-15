vendors
=======

vendor stuff formatted with my own style

when using stuff (lib, framework, polyfill) from vendors, i keep it a habit that:

1. use it in the source mode when developing
2. format it in my own style

but i don't format them with any tools, i format them manually (with a bit of regular expressions though).

i don't add or remove any logical code, but will remove some that is not needed.

# code manual formatting

## step 1 - change indent from space to tab

there're 4-2 spaces for a tab in some open source.
1. replace: `\n {4|2}` --> `\n\t` (run only once)
2. replace `\t {4|2}` --> `\t\t` (run until there's no more replacements)

### `<space>{4}` open sources

- moment.js
- knockout.js

### `<space>{2}` open sources

- underscore.js
- zepto.js
- backbone.js

## step 2 - add missing indents

replace `\n\n(\t+)(\S)` ➔ `\n$1\n$1$2`

## step 3 - extra indents

find `\n(\t+)var .*,\n\1\t\t`

## possble missing brackets
`(if|for|while) ?\(.*[^\{]$`

## find possibly unneeded `else` clause

find: `(return|throw|continue|break).*;\n\t*\} ?else`

## unnecessary parenthese

- find `instanceof(...)` and `typeof(...)`
- find `new\(([^\)]+)\)`
- find `return \(.*\);`

## trailing tab/space

find `[^\*/\s][\t ]+$`

## extra white line

`\n[\t ]*\n[\t ]*\n`
`\{(//.*)?\n[\t ]*\n`
`\n[\t ]*\n[\t ]*\}`
