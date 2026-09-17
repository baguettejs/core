import type { HttpMethod } from './decorator';
import type { Request } from './middleware';

export type RouteHandler = (request: Request) => globalThis.Response | Promise<globalThis.Response>;

export interface MatchedRoute<T = RouteHandler> {
    handler: T;
    params: Record<string, string>;
}

interface RegisteredRoute<T> {
    method: HttpMethod;
    path: string;
    parts: string[];
    dynamic: boolean;
    handler: T;
}

function normalizePath(path: string): string {
    const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

function splitPath(path: string): string[] {
    return path === '/' ? [] : path.slice(1).split('/');
}

function pathnameFromUrl(url: string): string {
    const queryStart = url.indexOf('?');
    const value = queryStart === -1 ? url : url.slice(0, queryStart);
    const protocolEnd = value.indexOf('://');
    const pathnameStart = protocolEnd === -1 ? -1 : value.indexOf('/', protocolEnd + 3);
    const pathname = pathnameStart === -1 && protocolEnd !== -1
        ? '/'
        : pathnameStart === -1 ? value : value.slice(pathnameStart);
    return pathname || '/';
}

/** Small router: exact routes use a Map, dynamic routes are compiled once. */
export class Router<T = RouteHandler> {
    private readonly staticRoutes = new Map<HttpMethod, Map<string, RegisteredRoute<T>>>();
    private readonly dynamicRoutes = new Map<HttpMethod, RegisteredRoute<T>[]>();

    clear(): void {
        this.staticRoutes.clear();
        this.dynamicRoutes.clear();
    }

    register(method: HttpMethod, path: string, handler: T): void {
        const normalizedPath = normalizePath(path);
        const compiled: RegisteredRoute<T> = {
            method,
            path: normalizedPath,
            parts: splitPath(normalizedPath),
            dynamic: normalizedPath.split('/').some((part) => part.startsWith(':')),
            handler,
        };

        if (compiled.dynamic) {
            const routes = this.dynamicRoutes.get(method);
            if (routes) routes.push(compiled);
            else this.dynamicRoutes.set(method, [compiled]);
        } else {
            const routes = this.staticRoutes.get(method);
            if (routes) routes.set(normalizedPath, compiled);
            else this.staticRoutes.set(method, new Map([[normalizedPath, compiled]]));
        }
    }

    match(method: HttpMethod | undefined, url: string): MatchedRoute<T> | null {
        if (!method) return null;

        const rawPathname = pathnameFromUrl(url);
        const pathname = rawPathname.length > 1 && rawPathname.endsWith('/')
            ? rawPathname.slice(0, -1)
            : rawPathname;
        const exact = this.staticRoutes.get(method)?.get(pathname);
        if (exact) return { handler: exact.handler, params: {} };

        const requestParts = splitPath(normalizePath(pathname));
        for (const route of this.dynamicRoutes.get(method) || []) {
            if (route.parts.length !== requestParts.length) continue;

            const params: Record<string, string> = {};
            let matches = true;
            for (let i = 0; i < route.parts.length; i++) {
                const routePart = route.parts[i];
                const requestPart = requestParts[i];
                if (routePart.startsWith(':')) {
                    try {
                        params[routePart.slice(1)] = decodeURIComponent(requestPart);
                    } catch {
                        matches = false;
                        break;
                    }
                } else if (routePart !== requestPart) {
                    matches = false;
                    break;
                }
            }
            if (matches) return { handler: route.handler, params };
        }

        return null;
    }

    /** Compatibility helper for users who use the router directly. */
    handle(request: Request): globalThis.Response | Promise<globalThis.Response> {
        const route = this.match(request.method as HttpMethod | undefined, request.url);
        if (route && typeof route.handler === 'function') {
            return (route.handler as RouteHandler)(request);
        }
        return new globalThis.Response(`Route ${request.method} ${new URL(request.url).pathname} not found`, { status: 404 });
    }
}
