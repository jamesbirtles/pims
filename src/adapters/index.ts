import { ModelCtor } from '../model';

export const adapterKey = Symbol('Model Adapter');

export type QueryPredicate = (...args: any[]) => any;
export interface QueryOptions {
    predicate?: QueryPredicate;
}

export interface GetOptions extends QueryOptions {
    index?: string;
}

export interface JoinOptions {
    predicate?: (row) => void;
}

export interface Adapter {
    ensure(): Promise<void>;
    save<M>(model: M): Promise<M>;
    delete<M>(model: M): Promise<void>;
    all<T>(ctor: ModelCtor<T>, opts?: QueryOptions): Promise<T[]>;
    find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: QueryOptions,
    ): Promise<T[]>;
    findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: QueryOptions,
    ): Promise<T>;
    get<T>(ctor: ModelCtor<T>, value: any, opts?: GetOptions): Promise<T[]>;
    getOne<T>(ctor: ModelCtor<T>, value: any, opts?: GetOptions): Promise<T>;
    join<M>(model: M, relationshipKey: string, opts?: JoinOptions): Promise<M>;
    count<M>(model: M, predicate: (model: M) => boolean): Promise<number>;
}

export namespace Adapter {
    export function fromModel<T extends Adapter>(model: any): T {
        return model[adapterKey] || model.constructor[adapterKey];
    }
}
