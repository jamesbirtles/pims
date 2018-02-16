export function set(
    dest: { [index: string]: any },
    keyPath: string,
    value: any,
) {
    const path = keyPath.split('.');
    path.forEach((key, index) => {
        // Is this the last path
        if (index === path.length - 1) {
            dest[key] = value;
            return;
        }

        dest[key] = dest[key] || {};
    });
}
