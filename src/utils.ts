export function assignWithArrays(target: any, ...sources: any[]) {
    sources.filter(source => source != null).forEach(source => {
        Object.keys(source)
            .filter(key => source[key] !== undefined)
            .forEach(key => {
                target[key] = merge(target[key], source[key]);
            });
    });

    return target;
}

function merge(a: any, b: any): any {
    if (Array.isArray(a) && Array.isArray(b)) {
        return [...a, ...b];
    }

    if (a instanceof Map && b instanceof Map) {
        return mergeMap(a, b);
    }

    if (a instanceof Set && b instanceof Set) {
        return mergeSet(a, b);
    }

    return b;
}

function mergeMap<A, B>(a: Map<A, B>, b: Map<A, B>): Map<A, B> {
    const aEntries = Array.from(a);
    const bEntries = Array.from(b);

    const overrides: any[] = bEntries
        .filter(entryB => aEntries.some(entryA => entryA[0] === entryB[0]))
        .map(entryB => {
            const entryA = aEntries.find(entryA => entryA[0] === entryB[0]);
            return [entryB[0], merge(entryA[1], entryB[1])];
        });

    return new Map<A, B>([...aEntries, ...bEntries, ...overrides]);
}

function mergeSet<T>(a: Set<T>, b: Set<T>): Set<T> {
    const aValues = Array.from(a);
    const bValues = Array.from(b);

    return new Set<T>([...aValues, ...bValues]);
}

export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
    return <Pick<T, K>>keys.reduce(
        (target, key) => ({ ...target, [key as any]: obj[key] }),
        {},
    );
}
