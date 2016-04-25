/// <reference path="../../node_modules/reflect-metadata/reflect-metadata.d.ts" />

import {Model} from "./model";

export function Field(...validators: any[]): PropertyDecorator  {
  return function (target: any, key: string) {
    target._schemaRaw = target._schemaRaw || {};
    
    const type = Reflect.getMetadata("design:type", target, key);
    target._schemaRaw[key] = [ type, ...validators ];
    
    return target;
  }
}

export function ComputedField<T extends Model>(func: (model: T) => any): PropertyDecorator {
  return function (target: any, key: string) {
    target._computedFields[key] = func;
    return target;
  }
}