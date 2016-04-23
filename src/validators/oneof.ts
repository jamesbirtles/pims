export function OneOf(...args: string[]) {
  return function (input: string) {
    return args.indexOf(input) > -1;
  }
}