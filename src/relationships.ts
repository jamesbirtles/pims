import { createModelInfo } from './model';

export enum Relationship {
    HasMany,
    BelongsTo,
    HasOne,
}

export interface RelationshipInfo {
    kind: Relationship;
    key: string;
    foreignKey: string;
    model: (model: any) => any,
}

export function HasMany(model: (model: any) => any, foreignKey: string): PropertyDecorator {
    return RelationshipDecorator(Relationship.HasMany, model, foreignKey);
}

export function HasOne(model: (model: any) => any, foreignKey: string): PropertyDecorator {
    return RelationshipDecorator(Relationship.HasOne, model, foreignKey);
}

export function BelongsTo(model: (model: any) => any, localKey: string): PropertyDecorator {
    return RelationshipDecorator(Relationship.BelongsTo, model, localKey);
}

function RelationshipDecorator(kind: Relationship, model: (model: any) => any, foreignKey: string): PropertyDecorator {
    return (target, key) => {
        const relationship: RelationshipInfo = {
            kind,
            model,
            key: <string> key,
            foreignKey,
        };

        createModelInfo(<any> target.constructor, {
            relationships: [relationship]
        });
    }
}
