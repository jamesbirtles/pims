import * as _ from 'lodash';

function is(type: any, value: any) {
    switch (type) {
        case String:
            return _.isString(value);
        case Number:
            return _.isNumber(value);
        case Date:
            return _.isDate(value);
        case Boolean:
            return _.isBoolean(value);
        default:
            return value instanceof type || typeof value === type;
    }
}

export function Type(type: any) {
    return (input: any) => {
        const valid = input == null || is(type, input);
        return {
            valid, input,
            error: valid ? null : {
                message: 'type.invalid'
            }
        };
    };
}
