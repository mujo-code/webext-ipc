export const shallowEqual = (a: object, b: object) => {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)

  if (aKeys.length !== bKeys.length) {
    return false
  }

  for (const key of aKeys) {
    // @ts-ignore
    if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}
