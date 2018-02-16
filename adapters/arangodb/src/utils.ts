export function set(dest: object, keyPath: string, value: any) {
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
