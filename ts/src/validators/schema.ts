function isSchema(arg: OperationType | SchemaFunc): arg is SchemaFunc {
    return typeof arg === 'function';
}

function addError(key: string, targetError: OperatorResponse, sourceError: OperatorResponse) {
    targetError.valid = false;
    if (sourceError.errors) {
        sourceError.errors.forEach(error => {
            targetError.errors.push(Object.assign({}, error, {key: `${key}.${error.key}`}));
        });
        return;
    }

    targetError.errors.push(Object.assign({}, sourceError, {key: `${key}`}));
}

export function Schema(schema: SchemaType): (input: any, target: any) => OperatorResponse {
    return (input: any, target: any) => {
        const errors: OperatorResponse = {
            input,
            valid: true,
            errors: []
        };

        Object.keys(schema).forEach(key => {
            const value: OperationType | SchemaFunc = schema[key];

            if (isSchema(value)) {
                const res: OperatorResponse = value(input[key], target[key]);
                if (!res.valid) {
                    addError(key, errors, res);
                }
                return;
            }

            const [, ...operations] = value;

            // TODO: Validate type

            operations.forEach(operation => {
                const res = operation(input[key], target);
                if (res.transform) {
                    target[key] = res.value;
                    input[key] = res.value;
                } else if (!res.valid) {
                    addError(key, errors, res);
                }
            });
        });

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
    };
    errors?: OperatorResponse[];
}

export interface SchemaType {
    [key: string]: any | SchemaFunc;
}

export interface OperationType extends Array<(input: string, model?: any) => OperatorResponse> {
    0: any;
}

export type SchemaFunc = (schema: SchemaType, target: any) => OperatorResponse;
