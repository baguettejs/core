import 'reflect-metadata';

const PARAMS_KEY = Symbol('params');

type ParamType = 'req' | 'res' | 'body' | 'param' | 'query';

function saveParam(
    target: any,
    propertyKey: string | symbol,
    index: number,
    type: ParamType,
    name?: string
) {
    const existing =
        Reflect.getMetadata(PARAMS_KEY, target, propertyKey) || [];
    existing.push({ index, type, name });
    Reflect.defineMetadata(PARAMS_KEY, existing, target, propertyKey);
}

export function Req(): ParameterDecorator {
    return (t, k, i) => saveParam(t, k!, i, 'req');
}
export function Res(): ParameterDecorator {
    return (t, k, i) => saveParam(t, k!, i, 'res');
}
export function Body(): ParameterDecorator {
    return (t, k, i) => saveParam(t, k!, i, 'body');
}
export function Param(name?: string): ParameterDecorator {
    return (t, k, i) => saveParam(t, k!, i, 'param', name);
}
export function Query(name?: string): ParameterDecorator {
    return (t, k, i) => saveParam(t, k!, i, 'query', name);
}

export function getParamsMetadata(target: any, key: string | symbol) {
    return Reflect.getMetadata(PARAMS_KEY, target, key) || [];
}
