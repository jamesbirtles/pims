import {
    Adapter,
    adapterKey,
    QueryOptions,
    GetOptions,
    JoinOptions,
} from './index';
import { Model, ModelCtor, ModelInfo } from '../model';
import { Relationship } from '../relationships';
import { Column } from '../column';

export interface AdapterOptions {
    models: ModelCtor<any>[];
}

function getHasAndBelongsName(leftName: string, rightName: string) {
    if (leftName < rightName) {
        return `${leftName}_${rightName}`;
    }
    return `${rightName}_${leftName}`;
}

export abstract class AdapterBase implements Adapter {
    private models: ModelCtor<any>[];

    constructor(opts: AdapterOptions) {
        this.models = opts.models;
        const tableNames = new Map<
            string,
            { leftModel: ModelInfo; rightModel: ModelInfo }
        >();

        opts.models.forEach(model => {
            (model as any)[adapterKey] = this;
            const modelInfo = Model.getInfo(model);
            const relations = modelInfo.relationships.filter(
                relation => relation.kind === Relationship.HasAndBelongsToMany,
            );
            relations.forEach(relation => {
                const relatedModel = Model.getInfo(relation.model(model));
                let tableName = getHasAndBelongsName(
                    modelInfo.table,
                    relatedModel.table,
                );
                tableNames.set(tableName, {
                    leftModel: modelInfo,
                    rightModel: relatedModel,
                });
            });
        });

        Array.from(tableNames.entries()).forEach(
            ([tableName, { leftModel, rightModel }]) => {
                @Model({
                    database: leftModel.database,
                    table: tableName,
                })
                class LinkedModel {}

                Column({ primary: true })(LinkedModel.prototype, 'id');
                Column({ secondary: true })(
                    LinkedModel.prototype,
                    `${leftModel.table}_id`,
                );
                Column({ secondary: true })(
                    LinkedModel.prototype,
                    `${rightModel.table}_id`,
                );

                this.models.push(LinkedModel);
            },
        );
    }

    /**
     * Ensures all tables exist, and waits for them to be ready.
     */
    public ensure(): Promise<void> {
        return Promise.all(this.models.map(this.ensureTable, this)).then(
            () => undefined,
        );
    }

    /**
     * Save the model to the Database.
     * 
     * If replace is set to true, the entire model will be **replaced**. Otherwise
     * default action would be to update the document.
     */
    public async save<M>(model: M, replace: boolean = false): Promise<M> {
        const ctor = <ModelCtor<M>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        Model.notify(model, 'beforeSave');

        // todo(birtles): Actually figure out what changed.
        const changed = modelInfo.columns.filter(col => !col.computed).reduce(
            (doc, col) => ({
                ...doc,
                [col.key]: (model as any)[col.modelKey],
            }),
            {},
        );

        await this.updateStore(model, changed, replace);

        Model.notify(model, 'afterSave');

        return model;
    }

    public async delete<M>(model: M): Promise<void> {
        const ctor = <ModelCtor<M>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        Model.notify(model, 'beforeDelete');

        if (!(model as any)[modelInfo.primaryKey]) {
            throw new Error(
                'Cannot delete model without a populated primary key.',
            );
        }

        await this.deleteFromStore(model);

        Model.notify(model, 'afterDelete');
    }

    public async join<M>(
        model: M,
        relationshipKey: string,
        opts: JoinOptions = {},
    ): Promise<M> {
        const ctor = <ModelCtor<M>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        const relationship = modelInfo.relationships.find(
            relationship => relationship.key === relationshipKey,
        );
        if (!relationship) {
            throw new Error(`No relationship found for ${relationshipKey}`);
        }

        Model.notify(model, 'beforeJoin', relationship);

        let joinData: any;
        const relationshipModel = relationship.model(model);
        const relationshipModelInfo = Model.getInfo(relationshipModel);
        switch (relationship.kind) {
            case Relationship.HasMany:
                joinData = await this.get(
                    relationshipModel,
                    (model as any)[modelInfo.primaryKey],
                    { index: relationship.foreignKey },
                );
                if (opts.predicate) {
                    await Promise.all(joinData.map(opts.predicate));
                }
                break;
            case Relationship.BelongsTo:
                joinData = await this.getOne(
                    relationshipModel,
                    (model as any)[relationship.foreignKey!],
                );
                if (opts.predicate) {
                    await opts.predicate(joinData);
                }
                break;
            case Relationship.HasOne:
                joinData = await this.getOne(
                    relationshipModel,
                    (model as any)[modelInfo.primaryKey],
                    { index: relationship.foreignKey },
                );
                if (opts.predicate) {
                    await opts.predicate(joinData);
                }
                break;
            case Relationship.HasAndBelongsToMany:
                const linkedModels = await this.get(
                    this.getModelByName(
                        getHasAndBelongsName(
                            modelInfo.table,
                            relationshipModelInfo.table,
                        ),
                    ),
                    (model as any)[modelInfo.primaryKey],
                    { index: `${modelInfo.table}_id` },
                );
                joinData = await Promise.all(
                    linkedModels.map(model =>
                        this.getOne(
                            relationshipModel,
                            (model as any)[`${relationshipModelInfo.table}_id`],
                        ),
                    ),
                );
                break;
            default:
                throw new Error(
                    `Unhandled relationship type ${relationship.kind}`,
                );
        }

        (model as any)[relationship.key] = joinData;

        Model.notify(model, 'afterJoin', relationship);

        return model;
    }

    private getModelByName<T>(name: string): ModelCtor<T> {
        return this.models.find(model => Model.getInfo(model).table === name)!;
    }

    public abstract all<T>(
        ctor: ModelCtor<T>,
        opts?: QueryOptions,
    ): Promise<T[]>;
    public abstract find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: QueryOptions,
    ): Promise<T[]>;
    public abstract findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: QueryOptions,
    ): Promise<T>;
    public abstract get<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts?: GetOptions,
    ): Promise<T[]>;
    public abstract getOne<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts?: GetOptions,
    ): Promise<T>;

    protected abstract ensureTable(ctor: ModelCtor<any>): Promise<void>;
    protected abstract updateStore(model: any, payload: any, replace: boolean): Promise<void>;
    protected abstract deleteFromStore(model: any): Promise<void>;
}
