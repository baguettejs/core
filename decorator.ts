import 'reflect-metadata';
import { registerController } from './registry';
import { Container } from './container';
import type { MiddlewareHandler } from './middleware';
import type { OpenApiSchemaInput } from './openapi';

const ROUTES_KEY = Symbol('routes');

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface RouteBodyOptions {
    schema?: OpenApiSchemaInput;
    required?: boolean;
    contentType?: string;
}

export interface RouteResponseOptions {
    description?: string;
    schema?: OpenApiSchemaInput;
    contentType?: string;
}

export interface RouteOptions {
    status?: number;
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    body?: RouteBodyOptions;
    response?: RouteResponseOptions;
    responses?: Record<string | number, RouteResponseOptions>;
}

export interface RouteDefinition {
    method: HttpMethod;
    path: string;
    handler: string | symbol;
    status: number;
    options?: RouteOptions;
}

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

export function Middleware(...middlewares: MiddlewareHandler[]): MethodDecorator {
    return function (target: object, propertyKey: string | symbol) {
        const existing = Reflect.getMetadata(MIDDLEWARES_KEY, target, propertyKey) || [];
        Reflect.defineMetadata(MIDDLEWARES_KEY, [...existing, ...middlewares], target, propertyKey);
    };
}

export function getMiddlewares(target: any, propertyKey: string | symbol): MiddlewareHandler[] {
    return Reflect.getMetadata(MIDDLEWARES_KEY, target, propertyKey) || [];
}

function createRouteDecorator(method: HttpMethod, defaultStatus: number) {
    return (path = '', options: RouteOptions = {}): MethodDecorator => {
        return (target, propertyKey) => {
            const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];

            const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '/';
            routes.push({
                method,
                path: normalizedPath,
                handler: propertyKey,
                status: options.status ?? defaultStatus,
                options,
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

export function getRoutes(target: any): RouteDefinition[] {
    return Reflect.getMetadata(ROUTES_KEY, target) || [];
}
