/// <reference path="../../node_modules/reflect-metadata/reflect-metadata.d.ts" />

import * as pluralise from "pluralize";
import * as _ from "lodash";
import { Model } from "./model";

export function Field(...validators: any[]): PropertyDecorator  {
  return function (target: any, key: string) {
    target._schemaRaw = target._schemaRaw || {};
    
    const type = Reflect.getMetadata("design:type", target, key);
    target._schemaRaw[key] = [ type, ...validators ];
    
    return target;
  }
}

/**
 * NOTE: Explicity setting the value of a computed field will freeze the field to that value.
 */
export function ComputedField<T extends Model>(func: (model: T) => any): PropertyDecorator {
  return function (target: any, key: string) {
    target._computedFields = target._computedFields || {};
    target._computedFields[key] = func;
    return target;
  }
}

export interface LinkedFieldOptions {
  field?: string;
  model?: () => typeof Model;
}

export function LinkedField(modelName: string): PropertyDecorator  {
  return function (target: any, key: string) {
    target._relations = target._relations || {};
    
    const type = Reflect.getMetadata("design:type", target, key) === Array ? "hasMany" : "belongsTo";
    console.log("Name", target.constructor.name);
    const targetName = _.camelCase(target.constructor.name);
    target._relations[key] = {
      modelName, type,
      field: type === "hasMany" ? targetName + "Id" : key + "Id",
    };
    
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