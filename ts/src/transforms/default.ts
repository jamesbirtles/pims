import * as _ from "lodash";

export function Default(value: any) {
  return function (input: any, target: any) {
    let res = input;
    if (_.isUndefined(res)) {
      if (_.isFunction(value)) {
        // TODO: support promises
        res = value(target);
      } else {
        res = value;
      }
    }
    return {
      transform: true,
      value: res
    };
  }
}
