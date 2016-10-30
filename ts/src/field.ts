import * as _ from "lodash";
import { Model } from "./model";

export function Field(...operations: any[]): PropertyDecorator  {
  return function (target: any, key: string) {
    target._schemaRaw = target._schemaRaw || {};
    
    const type = Reflect.getMetadata("design:type", target, key);
    target._schemaRaw[key] = [ type, ...operations ];
    
    return target;
  }
}

/**
 * NOTE: Explicitly setting the value of a computed field will freeze the field to that value.
 */
export function ComputedField<T extends Model>(func: (model: T) => any): PropertyDecorator {
  return function (target: any, key: string) {
    target._computedFields = target._computedFields || {};
    target._computedFields[key] = func;
    return target;
  }
}

export interface LinkedFieldOptions<T extends Model> {
  model?: (model: T) => typeof Model | string;
}

export function LinkedField<T extends Model>(opts: string | LinkedFieldOptions<T>): PropertyDecorator  {
  return function (target: any, key: string) {
    target._relations = target._relations || {};
    
    const type = Reflect.getMetadata("design:type", target, key) === Array ? "hasMany" : "belongsTo";
    const targetName = _.camelCase(target.constructor.name);
    target._relations[key] = {
      type,
      field: type === "hasMany" ? targetName + "Id" : key + "Id",
    };
    
    if (_.isString(opts)) {
      target._relations[key].modelName = opts;
    } else {
      target._relations[key].modelFactory = opts.model;
    }
    
    return target;
  }
}

export function FieldTag(...tags: string[]): PropertyDecorator  {
  return function (target: any, key: string) {
    target._tags = target._tags || {};
    target._tags[key] = tags;
    
    return target;
  }
}