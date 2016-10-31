export function UpperCase(input: string, target: any) {
    return {
        transform: true,
        value: input ? input.toUpperCase() : input
    };
}
