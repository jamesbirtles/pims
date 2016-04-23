export function Email(input: string) {
  const valid = /^.*@.*$/.test(input);
  return {
    valid, input,
    error: valid ? undefined : {
      message: "email.invalid"
    }
  };
}