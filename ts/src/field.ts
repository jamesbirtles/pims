export function Field(...validators: any[]): PropertyDecorator  {
  return function (target: any, key: string | symbol) {
    target._schemaRaw = target._schemaRaw || {};
    
    const type = Reflect.getMetadata("design:type", target, key);
    target._schemaRaw[key] = [ type, ...validators ];
    
    return target;
  }
}