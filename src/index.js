// @flow

import fs from 'fs'

import {
  parseSource,
  makeInheritedByMap,
  isPrimitiveType,
  toJSType,
  isTdFunction,
  type TdClass,
  type TdBaseClass
} from './base'

const arg = process.argv[2]
const filepath = (arg !== '--ts' && arg) || 'td__api_8.h'

const TS = process.argv.includes('--ts')

const source = fs.readFileSync(filepath).toString()

const createParams = (cl: TdClass, optional: boolean = false): string =>
  `  _: '${cl.name}',` + (cl.params.length ? '\n' : '') +
  cl.params.map(param => [
    '  ',
    param.name,
    optional ? '?' : '',
    ': ',
    isPrimitiveType(toJSType(param.cppType).jstype, t =>
      optional ? `${t}Optional` : t),
    '[]'.repeat(toJSType(param.cppType).vector),
    ','
  ].join(''))
  .join('\n')

const { tdClasses, baseClasses } = parseSource(source)

const classesStr = tdClasses
  .map(cl => [
    `export type ${cl.name} = {${(isTdFunction(cl) && !TS) ? '|' : ''}\n`,
    //`export type ${cl.name} = {\n`,
      createParams(cl, isTdFunction(cl)),
    `\n${(isTdFunction(cl) && !TS) ? '|' : ''}}`,
    //`\n}\n\n`,
    //`export type ${cl.name}Optional = { ...$Shape<${cl.name}>, _: '${cl.name}' }`),
    isTdFunction(cl)
      ? ''
      : (`\n\nexport type ${cl.name}Optional = {${TS ? '' : '|'}\n` +
          createParams(cl, true) +
        `\n${TS ? '' : '|'}}`),
    (cl.returnType
      ? `\n\nexport type ${cl.name}ReturnType = ${cl.returnType}`
      : '')
    ].join(''))
  .join('\n\n')

const inheritedByMap = makeInheritedByMap(tdClasses, baseClasses)

if (!TS) {
  console.log('// @flow')
  console.log()
}
console.log(classesStr)

console.log()
console.log('// -----------')

const createUnion = (
  typename: string,
  types: string[],
  optional: boolean = false
): string =>
  `\nexport type ${typename}${optional ? 'Optional' : ''} =\n` +
  types
    .map(name => `  | ${name}${optional ? 'Optional' : ''}`)
    .join('\n')

for (const [baseClass, tdClasses] of inheritedByMap.entries()) {
  const baseClassName = baseClass.name
  const tdClassNames = tdClasses.map(cl => cl.name)

  const str = createUnion(baseClassName, tdClassNames)

  console.log(str)

  if (baseClassName === 'TDFunction') continue

  const strOptional = createUnion(baseClassName, tdClassNames, true)

  console.log(strOptional)
}

console.log()
console.log('// -----------')
console.log()

const createFunctionType = (
  name: string,
  returnType: string,
  tdClasses: TdClass[]
): string =>
  `export type ${name} =\n` +
  tdClasses
    .filter(isTdFunction)
    .map(cl =>
      `  & ((query: ${cl.name}) => ${returnType.replace('{name}', cl.name)})`)
    .join('\n')

const createInvokeType = (tdClasses: TdClass[]): string =>
  createFunctionType('Invoke', 'Promise<{name}ReturnType>', tdClasses)

const createExecuteType = (tdClasses: TdClass[]): string =>
  createFunctionType('Execute', '{name}ReturnType | error | null', tdClasses)

const createInvokeFutureType = (tdClasses: TdClass[]): string =>
  createFunctionType('InvokeFuture', 'Future<error, {name}ReturnType>', tdClasses)

console.log(createInvokeType(tdClasses))
console.log()

console.log(createExecuteType(tdClasses))
console.log()

console.log('/*')

console.log('// Future<Left, Right>')
console.log(!TS
  ? 'import type { Future } from \'fluture\''
  : 'import { Future } from \'fluture\'')
console.log()
console.log(createInvokeFutureType(tdClasses))

console.log('*/')

// console.log(
// `type $DeepShape<O: Object> = Object & $Shape<
//   $ObjMap<O, (<V: Object>(V) => $DeepShape<V>) & (<V>(V) => V)>
// >`)
