import { ColumnInfo } from './column';
import { assignWithArrays, pick as _pick } from './utils';
import { Hooks } from './hooks';
import { RelationshipInfo } from './relationships';

export const modelInfoKey = Symbol('model info');

export interface ModelCtor<T> {
    new (): T;
}

export interface IndexInfo {
    name: string;
    keys: string[];
    options?: {
        multi?: boolean;
        geo?: boolean;
        unique?: boolean;
    };
}

export interface ModelInfo {
    database: string;
    table: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    primaryKey: string;
    tags: Map<string, Set<string>>;
    relationships: RelationshipInfo[];
}

export function createModelInfo(
    target: ModelCtor<any>,
    ...objs: Partial<ModelInfo>[]
): ModelInfo {
    return ((target as any)[modelInfoKey] = assignWithArrays(
        <Partial<ModelInfo>>{
            columns: [],
            indexes: [],
            relationships: [],
            primaryKey: 'id',
            tags: new Map<string, Set<string>>(),
        },
        (target as any)[modelInfoKey],
        ...objs,
    ));
}

/**
 * Model decorator
 */
export function Model(info: Partial<ModelInfo>): ClassDecorator {
    return (target: any) => {
        const modelInfo = createModelInfo(target, info);

        target.prototype.toJSON = function() {
            return [...modelInfo.columns, ...modelInfo.relationships]
                .filter(column => this[column.key] !== undefined)
                .reduce(
                    (t, column) => ({ ...t, [column.key]: this[column.key] }),
                    {},
                );
        };
    };
}

function getKeys(
    ctor: ModelCtor<any>,
    tagsOrKeys: string[] | string,
): string[] {
    const modelTags = Model.getInfo(ctor).tags;

    let keys: string[];
    if (Array.isArray(tagsOrKeys)) {
        keys = tagsOrKeys;
    } else {
        keys = [tagsOrKeys];
    }

    return keys.reduce<string[]>((keys, tagOrKey) => {
        if (modelTags.has(tagOrKey)) {
            return [...keys, ...modelTags.get(tagOrKey)!];
        }

        return [...keys, tagOrKey];
    }, []);
}

export namespace Model {
    export function construct<M>(ctor: ModelCtor<M>, data: Partial<M>): M {
        return Model.assign(new ctor(), data);
    }

    export function assign<M>(model: M, ...sources: Partial<M>[]): M {
        return Object.assign(<any>model, ...sources);
    }

    export function pickAssign<M>(
        model: M,
        tagsOrKeys: string[] | string,
        ...sources: Partial<M>[]
    ): M {
        const ctor = <ModelCtor<M>>model.constructor;
        const keys = getKeys(ctor, tagsOrKeys) as Array<keyof M>;

        return Model.assign<M>(
            model,
            ...sources.map(source => _pick(source, ...keys)),
        );
    }

    export function pick<M>(model: M, ...tagsOrKeys: string[]): Partial<M> {
        const ctor = <ModelCtor<M>>model.constructor;
        const modelTags = Model.getInfo(ctor).tags;

        const data = tagsOrKeys.reduce((target, tagOrKey) => {
            if (modelTags.has(tagOrKey)) {
                return {
                    ...target,
                    ..._pick<M, any>(model, ...modelTags.get(tagOrKey)!),
                };
            }

            return { ...target, [tagOrKey]: (model as any)[tagOrKey] };
        }, {});

        return Model.construct(ctor, data);
    }

    export function without<M>(model: M, ...tagsOrKeys: string[]): Partial<M> {
        const ctor = <ModelCtor<M>>model.constructor;

        const keys = getKeys(ctor, tagsOrKeys);

        const pickKeys = Object.keys(model).filter(key => !keys.includes(key));

        return Model.construct<M>(ctor, <any>_pick<M, any>(model, ...pickKeys));
    }

    export function getInfo(ctor: ModelCtor<any>): ModelInfo {
        return (ctor as any)[modelInfoKey];
    }

    export function notify(model: any, hook: Hooks, ...args: any[]): any {
        if (model[hook]) {
            return model[hook](...args);
        }
    }
}
