import { aql, Database } from 'arangojs';
import { AqlQuery, join } from 'arangojs/aql';
import { CollectionMetadata, CollectionType } from 'arangojs/collection';
import { AdapterBase, AdapterOptions, GetOptions, Model, ModelCtor, QueryOptions } from 'pims';

import { set } from './utils';

export interface ArangoAdapterOptions extends AdapterOptions {
    username: string;
    password: string;
    host: string;
    port: number;

    // Default database used if the model doesn't specify one
    database?: string;
}

interface PimCollectionMetaData extends CollectionMetadata {
    database: string;
}

export class ArangoAdapter extends AdapterBase {
    public dbs = new Map<string, Database>();
    private collections: PimCollectionMetaData[] = [];
    private defaultDatabase?: string;

    constructor(opts: ArangoAdapterOptions) {
        super(opts);

        this.defaultDatabase = opts.database;

        const dbConnection = new Database({
            url: `http://${opts.host}:${opts.port}`,
            auth: {
                username: opts.username,
                password: opts.password,
            },
        });

        for (const model of opts.models) {
            const dbName =
                Model.getInfo(model).database || this.defaultDatabase;
            if (!dbName) {
                throw new Error(
                    `No database specified for model ${
                        model.name
                    } and no default was set.`,
                );
            }

            if (this.dbs.has(dbName)) {
                continue;
            }

            const dbPool = dbConnection.database(dbName);
            this.dbs.set(dbName, dbPool);
        }
    }

    public db(name: string): Database {
        if (!name && this.defaultDatabase) {
            name = this.defaultDatabase;
        }

        if (!this.dbs.has(name)) {
            throw new Error(`Unknown database ${name}`);
        }

        return this.dbs.get(name)!;
    }

    public async ensure(): Promise<void> {
        for (const db of this.dbs.values()) {
            const cols = await db.listCollections(true);
            this.collections.push(
                ...cols.map(col => ({ ...col, database: db.name })),
            );
        }

        return super.ensure();
    }

    public async all<T>(ctor: ModelCtor<T>, opts?: QueryOptions): Promise<T[]> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const db = this.db(modelInfo.database);

        const cursor = await db.query(this.createBaseQuery(modelInfo.table));

        const rows: any[] = await cursor.all();
        return rows.map(row => this.mapToModel(ctor, row));
    }

    public async find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        _opts: QueryOptions = {},
    ): Promise<T[]> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const db = this.db(modelInfo.database);

        const cursor = await db.query(this.createBaseQuery(modelInfo.table, this.createFilterQuery(ctor, filter)));

        const rows: any[] = await cursor.all();
        return rows.map(row => this.mapToModel(ctor, row));
    }

    public async findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        _opts: QueryOptions = {},
    ): Promise<T> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const db = this.db(modelInfo.database);

        const cursor = await db.query(this.createBaseQuery(modelInfo.table, this.createFilterQuery(ctor, filter, 1)));

        return this.mapToModel(ctor, await cursor.next());
    }

    public get<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T[]> {
        const filter = this.getFilterForIndex(
            ctor,
            opts.index || '_key',
            value,
        );

        return this.find(ctor, filter, opts);
    }

    public getOne<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T> {
        const filter = this.getFilterForIndex(
            ctor,
            opts.index || '_key',
            value,
        );

        return this.findOne(ctor, filter, opts);
    }

    protected async ensureTable(ctor: ModelCtor<any>): Promise<void> {
        const modelInfo = Model.getInfo(ctor);

        const collection = this.db(modelInfo.database).collection(modelInfo.table);
        const dbName = modelInfo.database || this.defaultDatabase;

        if (
            this.collections.find(
                c =>
                    c.database === dbName &&
                    c.name === modelInfo.table,
            ) == null
        ) {
            await collection.create({ type: CollectionType.DOCUMENT_COLLECTION });
        }

        await Promise.all(
            modelInfo.indexes.map(index =>
                collection.ensureIndex({
                    type: 'persistent',
                    fields: index.keys,
                    deduplicate: true,
                    estimates: true,
                }),
            ),
        );
    }

    protected async updateStore(model: any, payload: any, replace: boolean) {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);
        const key = model[modelInfo.primaryKey];

        // todo(birtles): Possibly check if we retrieved the document or not.
        if (key == null) {
            // Create the document
            const res = await this.db(modelInfo.database)
                .collection(modelInfo.table)
                .save(payload);

            // Update model with the generated id
            model[modelInfo.primaryKey] = res._key;

            return;
        }

        delete payload[modelInfo.primaryKey];
        const document = this.db(modelInfo.database)
            .collection(modelInfo.table);

        // Handle replacing or updating a document.
        if (replace) {
            await document.replace(key, payload);
        } else {
            await document.update(key, payload);
        }
    }

    protected async deleteFromStore(model: any): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        await this.db(modelInfo.database)
            .collection(modelInfo.table)
            .remove(model[modelInfo.primaryKey]);
    }

    private mapToModel(ctor: ModelCtor<any>, row: any): any {
        if (row == null) {
            return null;
        }

        const modelInfo = Model.getInfo(ctor);

        const key = row._key;
        delete row._key;
        delete row._id;
        delete row._rev;

        const model = Model.construct(ctor, {
            ...row,
            [modelInfo.primaryKey]: key,
        });
        Model.notify(model, 'afterRetrieve');
        return model;
    }

    private thisOrKey(ctor: ModelCtor<any>, key: string) {
        const modelInfo = Model.getInfo(ctor);
        if (key === modelInfo.primaryKey) {
            return '_key';
        }

        return `${key}`;
    }

    private createBaseQuery(collection: string, filter: AqlQuery | null = null): AqlQuery {
        const collQuery = aql`FOR d IN @@coll`;

        let query =  aql`
            ${collQuery}

            RETURN d
        `;

        if (filter != null) {
            query = aql`
                ${collQuery}
                ${filter}

                RETURN d
            `;
        }

        query.bindVars = {
            '@coll': collection,
            ...filter?.bindVars,
        };

        return query;
    }

    private createFilterQuery(ctor: ModelCtor<any>, filter: object, limit: number | null = null): AqlQuery {
        const filters = [];

        for (const dest of Object.keys(filter)) {
            filters.push(aql`FILTER d.${this.thisOrKey(ctor, dest)} == ${(filter as any)[dest]}`);
        }

        if (limit != null && !isNaN(limit) && limit > 0) {
            filters.push(aql`LIMIT ${limit}`);
        }

        return join(filters);
    }

    private getFilterForIndex(
        ctor: ModelCtor<any>,
        index: string,
        value: any,
    ): object {
        const modelInfo = Model.getInfo(ctor);
        const filter: object = {};

        if (index === '_key' || index === modelInfo.primaryKey) {
            (filter as any)['_key'] = value;
        } else {
            const indexInfo = modelInfo.indexes.find(
                info => info.name === index,
            );
            const values = Array.isArray(value) ? value : [value];
            indexInfo!.keys.forEach((key, i) => set(filter, key, values[i]));
        }

        return filter;
    }
}
