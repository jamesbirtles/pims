function isSchema(arg: OperationType | SchemaFunc): arg is SchemaFunc {
  return typeof arg === "function";
}

function addError(key: string, targetError: OperatorResponse, sourceError: OperatorResponse) {
  targetError.valid = false;
  if (sourceError.errors != null) {
    for (let i = 0, len = sourceError.errors.length; i < len; i++) {
      let error = sourceError.errors[i];
      targetError.errors.push(Object.assign({}, error, {key: `${key}.${error.key}`}));
    }
  } else {
    targetError.errors.push(Object.assign({}, sourceError, {key: `${key}`}));
  }
}

export function Schema(schema: SchemaType) {
  return function (input: any, target: any): OperatorResponse {
    const errors: OperatorResponse = {
      input,
      valid: true,
      errors: []
    }

    const schemaKeys = Object.keys(schema);
    for (let i = 0, len = schemaKeys.length; i < len; i++) {
      let key = schemaKeys[i];
      let value: OperationType | SchemaFunc = schema[key];

      if (isSchema(value)) {
        let res: OperatorResponse = value(input[key], target[key]);
        if (!res.valid) {
          console.log("Invalid schema", key);
          addError(key, errors, res);
        }
      } else {
        const [type, ...operations] = value;

        // TODO: Validate type

        for (let j = 0, lenj = operations.length; j < lenj; j++) {
          let res = operations[j](input[key], target);
          if (res.transform) {
            target[key] = res.value;
            input[key] = res.value;
          } else if (!res.valid) {
            addError(key, errors, res);
          }
        }
      }
    }

    return errors;
  }
}

export interface OperatorResponse {
  transform?: boolean;
  value?: any;

  key?: string;
  valid?: boolean;
  input?: any;
  error?: {
    message: string;
    args?: any[]
  }
  errors?: OperatorResponse[];
}

export interface SchemaType {
  [key: string]: any | SchemaFunc;
}

export interface OperationType extends Array<(input: string, model?: any) => OperatorResponse> {
  0: any;
}

export type SchemaFunc = (schema: SchemaType, target: any) => OperatorResponse;
