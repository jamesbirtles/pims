export function Email(input: string) {
  return /^.*@.*$/.test(input);
}