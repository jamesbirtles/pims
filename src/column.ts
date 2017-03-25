import { createModelInfo, ModelInfo, modelInfoKey } from './model';

export interface ColumnInfo {
    modelKey: string;
    key: string;
    tags: string[];
    primary?: boolean;
    secondary?: boolean;
    computed?: boolean;
}

export function Column(info?: Partial<ColumnInfo>): any {
    return (target: any, key: string, descriptor: PropertyDescriptor) => {
        let computed = false;

        if (descriptor) {
            if (!descriptor.get) {
                throw new Error('Cannot apply colum decorator to methods');
            }

            computed = true;
        }

        const columnInfo: ColumnInfo = {
            modelKey: String(key),
            key: String(key),
            tags: [],
            computed,
            ...info,
        };

        const modelInfo: ModelInfo = createModelInfo(<any> target.constructor, {
            columns: [columnInfo],
            tags: new Map(columnInfo.tags.map<[string, Set<string>]>(tag => [tag, new Set([columnInfo.key])])),
        });
        columnInfo.secondary && modelInfo.indexes.push({ name: columnInfo.key, keys: [columnInfo.key] });
        columnInfo.primary && (modelInfo.primaryKey = columnInfo.key);
    }
}
