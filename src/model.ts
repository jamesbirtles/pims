import { ColumnInfo } from './column';
import { assignWithArrays, pick as _pick } from './utils';
import { RethinkAdapter } from './adapter';

export const modelInfoKey = Symbol('rethink model info');

export interface ModelCtor<T> {
    new(): T;
}

export interface IndexInfo {
    name: string;
    keys: string[];
}

export interface ModelInfo {
    database: string;
    table: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    primaryKey: string;
    tags: Map<string, Set<string>>;
}

export function createModelInfo(target: ModelCtor<any>, ...objs: Partial<ModelInfo>[]) {
    return target[modelInfoKey] = assignWithArrays(<Partial<ModelInfo>> {
        columns: [],
        indexes: [],
        primaryKey: 'id',
        tags: new Map<string, Set<string>>(),
    }, target[modelInfoKey], ...objs);
}

/**
 * Model decorator
 */
export function Model(info: Partial<ModelInfo>): ClassDecorator {
    return (target: ModelCtor<any>) => {
        const modelInfo = createModelInfo(target, info);
    };
}

export namespace Model {
    export function construct<M>(ctor: ModelCtor<M>, data: Partial<M>): M {
        return Object.assign(new ctor(), data);
    }

    export function pick<M>(model: M, ...tagsOrKeys: string[]): Partial<M> {
        const ctor = <ModelCtor<M>> model.constructor;
        const modelTags = Model.getInfo(ctor).tags;

        const data = tagsOrKeys.reduce((target, tagOrKey) => {
            if (modelTags.has(tagOrKey)) {
                return { ...target, ..._pick<M, any>(model, ...modelTags.get(tagOrKey)) };
            }

            return { ...target, [tagOrKey]: model[tagOrKey] };
        }, {});

        return Model.construct(ctor, data);
    }

    export function without<M>(model: M, ...tagsOrKeys: string[]): Partial<M> {
        const ctor = <ModelCtor<M>> model.constructor;
        const modelTags = Model.getInfo(ctor).tags;

        const keys = tagsOrKeys.reduce((keys, tagOrKey) => {
            if (modelTags.has(tagOrKey)) {
                return [...keys, ...modelTags.get(tagOrKey)];
            }

            return [...keys, tagOrKey];
        }, []);

        const pickKeys = Object.keys(model)
            .filter(key => !keys.includes(key));

        return Model.construct(ctor, _pick<M, any>(model, ...pickKeys));
    }

    export function getInfo(ctor: ModelCtor<any>): ModelInfo {
        return ctor[modelInfoKey];
    }
}
