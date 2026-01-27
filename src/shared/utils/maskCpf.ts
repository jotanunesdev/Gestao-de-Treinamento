export function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)

  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 9)
  const part4 = digits.slice(9, 11)

  let masked = part1
  if (part2) masked += `.${part2}`
  if (part3) masked += `.${part3}`
  if (part4) masked += `-${part4}`

  return masked
}

export function maskCpfRestricted(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)

  if (digits.length <= 3) {
    return digits
  }

  const part1 = digits.slice(0, 3)
  const part4 = digits.slice(9, 11)

  if (digits.length < 11) {
    return `${part1}.***.***-**`
  }

  return `${part1}.***.***-${part4}`
}
