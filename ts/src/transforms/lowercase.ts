export function LowerCase(input: string, target: any) {
  return {
    transform: true,
    value: input ? input.toLowerCase() : input
  };
}