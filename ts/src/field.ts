import * as _ from 'lodash';

import { Model } from './model';

export function Field(...operations: any[]): PropertyDecorator    {
    return (target: any, key: string) => {
        target._schemaRaw = target._schemaRaw || {};

        const type = Reflect.getMetadata('design:type', target, key);
        target._schemaRaw[key] = [ type, ...operations ];

        return target;
    };
}

/**
 * NOTE: Explicitly setting the value of a computed field will freeze the field to that value.
 */
export function ComputedField<T extends Model>(func: (model: T) => any): PropertyDecorator {
    return (target: any, key: string) => {
        target._computedFields = target._computedFields || {};
        target._computedFields[key] = func;
        return target;
    };
}

export interface LinkedFieldOptions<T extends Model> {
    model?: (model: T) => typeof Model | string;
}

export function LinkedField<T extends Model>(opts: string | LinkedFieldOptions<T>): PropertyDecorator {
    return (target: any, key: string) => {
        target._relations = target._relations || {};

        const isManyRelation = Reflect.getMetadata('design:type', target, key) === Array;
        const targetName = _.camelCase(target.constructor.name);

        let field = targetName + 'Id';
        let type = 'hasMany';
        if (!isManyRelation) {
            if (Reflect.hasMetadata('design:type', target, key + 'Id')) {
                type = 'belongsTo';
                field = key + 'Id';
            } else {
                type = 'hasOne';
            }
        }

        target._relations[key] = {
            type, field
        };

        if (_.isString(opts)) {
            target._relations[key].modelName = opts;
        } else {
            target._relations[key].modelFactory = opts.model;
        }

        return target;
    };
}

export function FieldTag(...tags: string[]): PropertyDecorator    {
    return (target: any, key: string) => {
        target._tags = target._tags || {};
        target._tags[key] = tags;

        return target;
    };
}
