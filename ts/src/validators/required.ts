export function Required(input: any) {
  const valid = input != null;
  return {
    valid, input,
    error: valid ? undefined : {
      message: "required.invalid"
    }
  };
}