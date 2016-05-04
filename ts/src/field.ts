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

export interface LinkedFieldOptions {
  field?: string;
  model?: typeof Model;
}

export function LinkedField(options: LinkedFieldOptions = {}): PropertyDecorator  {
  return function (target: any, key: string) {
    let {field, model} = options;
    let propertyType = Reflect.getMetadata("design:type", target, key);
    let relationType = propertyType === Array ? "hasMany" : "belongsTo";
    
    field = field || key + "Id";
    model = model || propertyType;
    
    if (model as any === Array) {
      throw new Error("Linked field was an array, you must specify the model, e.g. @LinkedField({model: MyModel}) ...");
    } else if (!(model.prototype instanceof Model)) {
      throw new Error("Linked field type must extend Model, or specify a model, e.g. @LinkedField({model: MyModel}) ...");
    }
    
    target._relations[key] = {
      type: relationType,
      field, model
    };
    
    return target;
  }
}