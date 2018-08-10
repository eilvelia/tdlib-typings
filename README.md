## tdlib-typings

Generates Flow and TypeScript typings from `td_api.tl` file.

---

### Installation

```sh
git clone https://github.com/Bannerets/tdlib-typings.git tdlib-typings
npm install
npm run build
```

### Usage

```console
$ node dist [path/to/tl/file]
```

#### Flow

```console
$ node dist > filename.js
```

#### TypeScript

```console
$ node dist --ts > filename.ts
```
