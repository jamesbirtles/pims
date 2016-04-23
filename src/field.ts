export function Field(...validators: any[]) {
  return function (target: any, key: string, descriptor: any) {
    target._schema = target._schema || {};
    
    const type = Reflect.getMetadata("design:type", target, key);
    const validation = { type, validators };
    
    target._schema[key] = validation;
    
    return target;
  }
}