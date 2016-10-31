export function Email(input: string) {
    const valid = input == null || /^.+@.+$/.test(input);
    return {
        valid, input,
        error: valid ? null : {
            message: 'email.invalid'
        }
    };
}
