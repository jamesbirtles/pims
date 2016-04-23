export function OneOf(...args: string[]) {
  return function (input: string) {
    const valid = input == null || args.indexOf(input) > -1;
    return {
      valid, input,
      error: valid ? undefined : {
        message: "oneof.invalid",
        args: [args]
      }
    };
  }
}