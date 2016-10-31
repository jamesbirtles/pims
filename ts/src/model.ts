import { cloneDeep, intersection, isEqual, isPlainObject, isString, reduce } from 'lodash';
import { Term } from 'rethinkdbdash';

import { RethinkConnection } from './connection';
import { OperatorResponse, SchemaFunc } from './validators/schema';

export interface RelationMap {
    [key: string]: {
        type: string;
        field: string;
        modelName?: string;
        modelFactory: (model: Model) => typeof Model | string;
    }
}

export interface TagMap {
    [key: string]: string[];
}

export class Model {
    public _prev;
    public _computedFields;
    public _relations: RelationMap;
    public _schemaRaw;
    public _schema: SchemaFunc;
    public _conn: RethinkConnection;
    public _pk: string;
    public _table: string;
    public _db: string;
    public _tags: TagMap;

    constructor(data: any = {}, isNew = true) {
        this._defineProperties();
        if (isNew) {
            this._prev = cloneDeep(this.getRaw());
            this.assign(data);
        } else {
            this.assign(data);
            this._prev = cloneDeep(this.getRaw());
        }
    }

    public static all<T extends Model>(): Promise<T[]> {
        return this.prototype.query().run()
            .map(res => new this(res, false));
    }

    public static get<T extends Model>(id: any | any[], opts?: string | CollectionOpts): Promise<T> {
        let q: any = this.prototype.query();
        const options: CollectionOpts = this._getCollectionOptions(opts);

        if (options.index) {
            q = q.getAll(id, {index: options.index});
            if (options.predicate) {
                q = options.predicate(q);
            }

            q = q.run().then(data => data[0]);
        } else {
            q = q.get(id).run();
        }

        return q.then(data => data ? new this(data, false) : null);
    }

    public static getAll<T extends Model>(id: any | any[], opts?: string | CollectionOpts): Promise<T[]> {
        let q: any = this.prototype.query();
        const options: CollectionOpts = this._getCollectionOptions(opts);

        q = q.getAll(id, {index: options.index});
        if (options.predicate) {
            q = options.predicate(q);
        }

        return q.run().map(res => new this(res, false));
    }

    public static find<T extends Model>(query: any, limit?: number): Promise<T[]> {
        let q = this.prototype.query().filter(query);
        if (limit) {
            q = q.limit(limit);
        }
        return q.run().map(res => new this(res, false));
    }

    public static changes<T extends Model>(opts: ChangesOpts = {}): Promise<ChangesFeed<T>> {
        return this.prototype.query().changes(opts).run();
    }

    private static _getCollectionOptions(opts: string | CollectionOpts) {
        const options: CollectionOpts = {};
        if (isString(opts)) {
            const index: string = opts;
            options.index = index;
        } else if (isPlainObject(opts)) {
            Object.assign(options, opts);
        }

        return options;
    }

    public query(): Term {
        return this._conn.r.db(this._db).table(this._table);
    }

    public save(): Promise<this> {
        const validation = this.validate();
        if (!validation.valid) {
            return Promise.reject(validation);
        }

        const changes = this.getChangedKeys();
        if (changes.length === 0) {
            return Promise.resolve(this);
        }

        const changed = {};
        changes.forEach(change => {
            this._prev[change] = cloneDeep(this[change]);
            changed[change] = this[change];
        });

        changed[this._pk] = this[this._pk];

        return this.query().insert(changed, { conflict: 'update' }).run()
            .then(doc => {
                if (doc.generated_keys) {
                    this[this._pk] = doc.generated_keys[0];
                }
                return this;
            });
    }

    public delete(): Promise<this> {
        return this.query().get(this[this._pk]).delete().run();
    }

    public join(key: string, mapFunction: (model: Model) => Model | Promise<Model> = model => model): Promise<this> {
        if (!this._relations) {
            return Promise.reject(new Error(`No relation found for '${key}'`));
        }

        const relation = this._relations[key];
        return Promise.resolve()
            .then(() => {
                if (!relation) {
                    return Promise.reject(new Error(`No relation found for '${key}'`));
                }

                let model;
                if (relation.modelFactory) {
                    model = relation.modelFactory(this);
                    if (isString(model)) {
                        model = this._conn.getModel(model);
                    }
                } else {
                    model = this._conn.getModel(relation.modelName);
                }

                if (relation.type === 'hasMany') {
                    return model.getAll(this[this._pk], relation.field).map(mapFunction);
                } else if (relation.type === 'belongsTo') {
                    return model.get(this[relation.field]).then(mapFunction);
                }

                return Promise.reject(new Error(`Unknown relation type '${relation.type}'`));
            })
            .then(res => {
                this[key] = res;
                return this;
            });
    }

    /**
     * Returns a new instance of the Model without fields with the tag specified.
     * NOTE: This will freeze computed fields.
     */
    public withoutFields(...excludedTags: string[]): this {
        if (!this._tags) {
            throw new Error('Not tags defined');
        }

        const fields = this.getFields(true);

        const returnData = {};
        fields.forEach(field => {
            const tags = this._tags[field];

            // If this field does not have the tag.
            if (!tags || intersection(tags, excludedTags).length === 0) {
                returnData[field] = this[field];
            }
        });

        return <this> new (<typeof Model> this.constructor)(returnData);
    }

    /**
     * Returns a new instance of the Model only with the fields with the tag specified.
     * NOTE: This will freeze computed fields.
     */
    public withFields(...includedTags: string[]): this {
        if (!this._tags) {
            throw new Error('Not tags defined');
        }

        const fields = this.getFields(true);

        const returnData = {};
        fields.forEach(field => {
            const tags = this._tags[field];

            // If this field has the tag.
            if (tags && intersection(tags, includedTags).length > 0) {
                returnData[field] = this[field];
            }
        });

        return <this> new (<typeof Model> this.constructor)(returnData);
    }

    public getTaggedFields(...includedTags: string[]) {
        if (!this._tags) {
            throw new Error('Not tags defined');
        }

        const fields = this.getFields(true);
        return fields.filter(field => {
            const tags = this._tags[field] || [];
            return intersection(tags, includedTags).length > 0;
        });
    }

    public validate(): OperatorResponse {
        return this._schema(this.getRaw(), this);
    }

    public getRaw() {
        const raw = {};
        const keys = Object.keys(this._schemaRaw);
        keys.forEach(key => {
            raw[key] = this[key];
        });
        return raw;
    }

    public getChangedKeys() {
        return reduce(
            this._prev,
            (result, value, key) => {
                return isEqual(value, this[key]) ? result : result.concat(key);
            },
            []
        );
    }

    public getFields(includeComputed: boolean = false) {
        const fields = Object.keys(this._schemaRaw);

        if (this._relations) {
            fields.push(...Object.keys(this._relations));
        }

        if (includeComputed && this._computedFields) {
            fields.push(...Object.keys(this._computedFields));
        }

        return fields;
    }

    public assign(data: any) {
        const fields = this.getFields(true);

        Object.keys(data).forEach(key => {
            if (fields.indexOf(key) > -1 && data[key] != null) {
                this[key] = data[key];
            }
        });
    }

    private _defineProperties() {
        if (this._computedFields) {
            Object.keys(this._computedFields).forEach(key => {
                this._defineComputedField(key, this._computedFields[key])
            });
        }

        this._defineProperty('_prev', null);
    }

    private _defineProperty(key: string, initialValue) {
        let value = initialValue;
        Object.defineProperty(this, key, {
            get: () => value,
            set: (newValue) => value = newValue,
            enumerable: false,
            configurable: false
        });
    }

    private _defineComputedField(key: string, func: (model: this) => any) {
        let frozenValue;
        let isFrozen = false;
        Object.defineProperty(this, key, {
            get: () => {
                if (isFrozen) {
                    return frozenValue;
                }
                return func(this);
            },
            set: (value) => {
                isFrozen = true;
                frozenValue = value;
            },
            enumerable: true
        });
    }
}

Model.prototype._pk = 'id';

export interface CollectionOpts {
    index?: string;
    predicate?: (q: any) => any;
}

export interface ChangesOpts {
    squash?: boolean | number;
    changefeed_queue_size?: number;
    include_initial?: boolean;
    include_states?: boolean;
    include_offsets?: boolean;
    include_types?: boolean;
}

export interface ChangesFeed<T extends Model> {
    each: (callback: (err: Error, cursor: DocumentCursor<T>) => any) => any;
}

export interface DocumentCursor<T extends Model> {
    old_val: T;
    new_val: T;
    state?: string;
}
