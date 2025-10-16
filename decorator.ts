import 'reflect-metadata';
import {registerController} from "./registry";
import {Container} from './container';
import {MiddlewareHandler} from "./middleware";

const ROUTES_KEY = Symbol('routes');

export function Service(): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata('service', true, target);
    };
}

export function Controller(prefix = ''): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata('prefix', prefix, target);

        if (!Reflect.hasMetadata(ROUTES_KEY, target)) {
            Reflect.defineMetadata(ROUTES_KEY, [], target);
        }

        const controllerInstance = Container.resolve(target);
        registerController(controllerInstance);
    };
}

const MIDDLEWARES_KEY = Symbol('middlewares');

export function Middleware(...middlewares: MiddlewareHandler[]) {
    return function (target: any, propertyKey: string) {
        const existing = Reflect.getMetadata(MIDDLEWARES_KEY, target, propertyKey) || [];
        Reflect.defineMetadata(MIDDLEWARES_KEY, [...existing, ...middlewares], target, propertyKey);
    };
}

export function getMiddlewares(target: any, propertyKey: string): MiddlewareHandler[] {
    return Reflect.getMetadata(MIDDLEWARES_KEY, target, propertyKey) || [];
}

function createRouteDecorator(method: string, defaultStatus: number) {
    return (path = ''): MethodDecorator => {
        return (target, propertyKey) => {
            const routes = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];

            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            routes.push({
                method,
                path: normalizedPath,
                handler: propertyKey,
                status: defaultStatus,
            });

            Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
        };
    };
}

export const Get = createRouteDecorator('GET', 200);
export const Post = createRouteDecorator('POST', 201);
export const Put = createRouteDecorator('PUT', 200);
export const Patch = createRouteDecorator('PATCH', 200);
export const Delete = createRouteDecorator('DELETE', 204);

export function getRoutes(target: any) {
    return Reflect.getMetadata(ROUTES_KEY, target);
}
