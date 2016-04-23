function isSchema(arg: ValidatorType | SchemaFunc): arg is SchemaFunc {
  return typeof arg === "function";
}

function addError(key: string, targetError: SchemaError, sourceError: SchemaError) {
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
  return function (input: any): SchemaError {
    const errors: SchemaError = {
      input,
      valid: true,
      errors: []
    }

    const schemaKeys = Object.keys(schema);
    for (let i = 0, len = schemaKeys.length; i < len; i++) {
      let key = schemaKeys[i];
      let value: ValidatorType | SchemaFunc = schema[key];

      if (isSchema(value)) {
        let res: SchemaError = value(input[key]);
        if (!res.valid) {
          console.log("Invalid schema", key);
          addError(key, errors, res);
        }
      } else {
        const [type, ...validators] = value;

        // TODO: Validate type

        for (let j = 0, lenj = validators.length; j < lenj; j++) {
          let res = validators[j](input[key]);
          if (!res.valid) {
            addError(key, errors, res);
          }
        }
      }
    }

    return errors;
  }
}

export interface SchemaError {
  key?: string;
  valid: boolean;
  input: any;
  error?: {
    message: string;
    args?: any[]
  }
  errors?: SchemaError[];
}

export interface SchemaType {
  [key: string]: any | SchemaFunc;
}

export interface ValidatorType extends Array<(input: string) => SchemaError> {
  0: any;
}

export type SchemaFunc = (schema: SchemaType) => SchemaError;
