// Serializa BigInt a number para JSON responses
export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? Number(v) : v
  ))
}
