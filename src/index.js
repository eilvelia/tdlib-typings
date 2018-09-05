// @flow

import fs from 'fs'
import { EOL } from 'os'
import { tldoc, type Parameter, type TdClass } from 'tldoc'

const arg = process.argv[2]
const filepath = (arg !== '--ts' && arg) || 'td_api.tl'
const TS = process.argv.includes('--ts')

const VERSION = '1.3.0'

const source = fs.readFileSync(filepath).toString()
  .replace(/^ *vector.+$/mg, '') // XXX

// console.log(JSON.stringify(tldoc(source), null, '  '))

const { baseClasses, classes } = tldoc(source)

const baseClassesDesc = baseClasses
  .reduce((acc, { name, description }) =>
    acc.set(name, description), (new Map(): Map<string, string>))

type JSParameter = {
  name: string,
  type: string,
  description: string
}

function paramaterTypeToJS ({ vector, type }: Parameter): string {
  const f = str => str + '[]'.repeat(vector)
  switch (type) {
    case 'double': return f('number')
    case 'string': return f('string')
    case 'int32': return f('number')
    case 'int53': return f('number')
    case 'int64': return f('(number | string)')
    case 'Bool': return f('boolean')
    case 'bytes': return f('string')
    default: return f(type)
  }
}

const parameterToJS = (param: Parameter): JSParameter => ({
  name: param.name,
  type: paramaterTypeToJS(param),
  description: param.description
})

const last = arr => arr[arr.length - 1]
const concatLast = (el, arr) => { arr[arr.length - 1] = last(arr) + el; return arr }

function formatDesc (desc: string): string {
  let length = 0

  const strings = desc
    .split('')
    .reduce((acc, e, i) => {
      length++
      if (length > 80 && e === ' ')
        { acc.push(e); length = 0; return acc }
      else
        { concatLast(e, acc); return acc }
    }, [''])

  if (strings.length > 1) {
    const str = strings
      .map(e => ' * ' + e.trim())
      .join(EOL)
    return `/**${EOL}${str}${EOL} */`
  }

  return `/** ${strings.join(EOL)} */`
}

const addIdent = (n: number, str: string) => str
  .split(EOL)
  .map(e => ' '.repeat(n) + e)
  .join(EOL)

const primitiveTypes = ['string', 'number', 'boolean', '(number | string)']
const addOptional = (str: string) => {
  let vector = 0
  const withoutArr =
    str.replace(/\[\]/g, () => { vector++; return '' })
  return primitiveTypes.includes(withoutArr)
    ? str
    : withoutArr + 'Optional' + '[]'.repeat(vector)
}

const o = (x: boolean, str = 'Optional') => x ? str : ''

const createObjectType = (name, description, params, opt = false, optName = false) =>
  [
    description && formatDesc(description),
    `export type ${name}${o(optName)} = {` + o(opt && !TS, '|'),
    `  _: '${name}',`,
    params
      .map(({ description, name, type }) =>
        addIdent(2, formatDesc(description)) + EOL
        + `  ${name}${o(opt, '?')}: ${opt ? addOptional(type) : type},`)
      .join(EOL),
    o(opt && !TS, '|') + '}'
  ]
  .filter(Boolean)
  .join(EOL)

const createUnion = (
  typename: string,
  types: string[],
  description?: string,
  opt: boolean = false
): string =>
  [
    description && formatDesc(description),
    `export type ${typename}${o(opt)} =`,
    types
      .map(name => `  | ${name}${o(opt)}`)
      .join(EOL)
  ]
  .filter(Boolean)
  .join(EOL)

const createFunctionType = (
  name: string,
  pattern: string,
  classes: TdClass[]
): string =>
  `export type ${name} =\n` +
  classes
    .map(({ name, result }) =>
      `  & ((query: ${name}) => ${pattern.replace('{name}', result)})`)
    .join(EOL)

const createUnions = classes => {
  const map = classes
    .filter(e => e.kind === 'constructor')
    .reduce((acc, { name, result }) => {
      const arr = acc.get(result)
      if (arr) { arr.push(name); return acc }
      else { return acc.set(result, [name]) }
    }, (new Map(): Map<string, string[]>))

  const strings = Array.from(map.entries())
    .map(([key, value]) =>
      [
        createUnion(key, value, baseClassesDesc.get(key)),
        '',
        createUnion(key, value, baseClassesDesc.get(key), true)
      ]
      .join(EOL))

  return strings
    .join(EOL + EOL)
}

const uniq = list => {
  const output = []
  const set = new Set()
  list.forEach(e => {
    if (set.has(e)) return
    set.add(e)
    output.push(e)
  })
  return output
}

const objects = classes
  .map(cl => {
    const params = cl.parameters.map(parameterToJS)
    if (cl.kind === 'function')
      return createObjectType(cl.name, cl.description, params, true)
    const str =
      createObjectType(cl.name, cl.description, params)
    const strOptional =
      createObjectType(cl.name, cl.description, params, true, true)
    return [str, '', strOptional].join(EOL)
  })
  .join(EOL + EOL)

const unions = createUnions(classes)

const funcs = classes.filter(e => e.kind === 'function')

const baseClassNames = uniq(classes.map(e => e.result))

const functionUnion = createUnion('TDFunction', funcs.map(e => e.name))
const objectUnion = createUnion('TDObject', baseClassNames)
const objectOptUnion = createUnion('TDObject', baseClassNames, '', true)

const invoke =
  createFunctionType('Invoke', 'Promise<{name}>', funcs)
const execute =
  createFunctionType('Execute', '{name} | error | null', funcs)
const invokeFuture =
  createFunctionType('InvokeFuture', 'Future<error, {name}>', funcs)

const { log } = console

if (!TS) {
  log('// @flow')
  log()
}
log(`// TDLib ${VERSION}`)
log()
log(objects)
log()
log('// ----')
log()
log(unions)
log()
log(functionUnion)
log()
log(objectUnion)
log()
log(objectOptUnion)
log()
log('// ----')
log()
log(invoke)
log()
log(execute)
log()
log('/*')
log('// Future<Left, Right>')
log(!TS
  ? 'import type { Future } from \'fluture\''
  : 'import { Future } from \'fluture\'')
log()
log(invokeFuture)
log('*/')

// console.log(`
// type $DeepShape<T: Object> = $Shape<
//   $ObjMap<T,
//     & (<X: Object>(X) => $DeepShape<X>)
//     & (<X: any[]>(X) => $TupleMap<X, <Y>(Y) => $DeepShape<Y>>)
//     & (<X>(X) => X)
//   >
// >;
// `)
