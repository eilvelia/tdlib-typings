// @flow

export type TdParam = {
  cppType: string,
  name: string
}

export type TdClassName = string
export type TdClass = {
  name: TdClassName,
  params: TdParam[],
  inheritsName: TdBaseClassName,
  returnType?: ?string
}

export type TdBaseClassName = string
export type TdBaseClass = {
  name: TdBaseClassName,
  inheritsName: TdBaseClassName
}

const removeUnderscore = (param: TdParam): TdParam =>
  param.name[param.name.length - 1] === '_'
    ? { ...param, name: param.name.slice(0, -1) }
    : param

const primitiveTypes = [
  'any', 'string', 'number', 'boolean'/*, '(number | string)'*/
]
export const isPrimitiveType =
  <T: string, V>(t: T, ifFalse: (t: T) => V): V | T =>
    primitiveTypes.includes(t)
      ? t
      : ifFalse(t)

const parseVectors = (cppType: string, vector: number = 0) => {
  const match = cppType.match(/^std::vector<(.+?)>$/)
  return (!match || !match[1])
    ? { parsedType: cppType, vector }
    : parseVectors(match[1], vector + 1)
}

export const toJSType = (cppType: string) => {
  const { parsedType, vector } = parseVectors(cppType)

  const f = jstype => ({
    jstype,
    vector
  })

  switch (parsedType) {
    case 'std::string': return f('string')
    case 'bool': return f('boolean')
    case 'std::int32_t': return f('number')
    case 'std::int64_t': return f('number')//f('(number | string)')
    case 'double': return f('number')
  }

  const match = parsedType.match(/^object_ptr<(.+?)>$/)

  if (match && match[1]) {
    return f(match[1])
  }

  return f('any')
}

export const isTdFunction = (tdClass: TdClass): boolean %checks =>
  tdClass.inheritsName === 'TDFunction'

const findParams = (body: string): TdParam[] => {
  const params = []

  const regexp = /(\S+?) (\S+?_);/g
  let result

  while (result = regexp.exec(body)) {
    const [, cppType, name]: string[] = result
    params.push({ cppType, name })
  }

  return params
}

const findReturnType = (body: string): string | null => {
  const regexp = /using ReturnType = (.+?);$/m

  const match = body.match(regexp)

  if (match && match[1]) {
    const { jstype, vector } = toJSType(match[1])
    return jstype + '[]'.repeat(vector)
  }

  return null
}

export const parseClasses = (str: string): TdClass[] => {
  const tdClasses: TdClass[] = []

  const regexp = /class ([a-z]\S+?) final : public (\S+?) {([\S\s]+?)};/g
  let result

  while (result = regexp.exec(str)) {
    const [, className, inheritsName, body]: string[] = result
    const params = findParams(body)
      .map(removeUnderscore)
    const returnType = findReturnType(body)
    tdClasses.push({
      name: className,
      params,
      inheritsName: renameBaseClass(inheritsName),
      returnType
    })
  }

  return tdClasses
}

const renameBaseClass = (name: TdBaseClassName): TdBaseClassName => {
  switch (name) {
    case 'Object': return 'TDObject'
    case 'Function': return 'TDFunction'
    default: return name
  }
}

export const parseBaseClasses = (str: string): TdBaseClass[] => {
  const regexp = /class ([A-Z]\S+?): public (\S+?) {\s+?public:\s*?};/g
  let result

  const baseClasses: TdBaseClass[] = []

  while (result = regexp.exec(str)) {
    const [, className, inheritsName, body]: string[] = result
    baseClasses.push({
      name: renameBaseClass(className),
      inheritsName: renameBaseClass(inheritsName)
    })
  }

  return baseClasses
}

export const parseSource = (source: string) =>
  ({
    tdClasses: parseClasses(source),
    baseClasses: parseBaseClasses(source)
  })

export type InheritedByMap = Map<TdBaseClass, (TdClass | TdBaseClass)[]>

type MakeInheritedByMap =
  (classes: TdClass[], baseClasses: TdBaseClass[]) => InheritedByMap
export const makeInheritedByMap: MakeInheritedByMap =
  (classes, baseClasses) => {
    const inheritedByMap: InheritedByMap = new Map()

    const allClasses = classes.concat(baseClasses)

    baseClasses.forEach(cl => {
      const inheritedBy = allClasses.filter(e => e.inheritsName === cl.name)
      if (inheritedBy.length === 0) return
      inheritedByMap.set(cl, inheritedBy)
    })

    return inheritedByMap
  }
