import { scanControllers } from '@baguettejs/utils';
import { getRegisteredControllers, registerController } from './registry';
import { getMiddlewares, getRoutes } from './decorator';
import type { HttpMethod, RouteDefinition } from './decorator';
import { getParamsMetadata } from './param';
import type { ParameterMetadata } from './param';
import type { MiddlewareHandler, Request, ResponseWriter } from './middleware';
import { Router } from './router';
import { buildOpenApiDocument, buildOpenApiDocumentWithTypes, swaggerUiHtml } from './openapi';
import type { OpenApiDocument, OpenApiOptions } from './openapi';
import { getErrorStatusCode, HttpError, NotFoundError, isHttpError } from './error';

export interface AppOptions {
    /** Maximum JSON body size. Protects the process from accidental or hostile large payloads. */
    bodyLimit?: number;
}

export interface AppServer {
    readonly port: number | undefined;
    stop(closeActiveConnections?: boolean): Promise<void>;
}

interface CompiledRoute {
    controller: any;
    definition: RouteDefinition;
    params: ParameterMetadata[];
    middlewares: MiddlewareHandler[];
    needsBody: boolean;
    needsQuery: boolean;
}

class BunResponseWriter implements ResponseWriter {
    statusCode: number;
    writableEnded = false;
    readonly headers = new Headers();
    private body: BodyInit | null = null;

    constructor(statusCode: number) {
        this.statusCode = statusCode;
    }

    setHeader(name: string, value: string | number | readonly string[]): void {
        this.headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    }

    getHeader(name: string): string | null {
        return this.headers.get(name);
    }

    removeHeader(name: string): void {
        this.headers.delete(name);
    }

    end(body: BodyInit | null = null): void {
        if (this.writableEnded) return;
        this.body = body;
        this.writableEnded = true;
    }

    toResponse(): globalThis.Response {
        return new globalThis.Response(this.body, {
            status: this.statusCode,
            headers: this.headers,
        });
    }
}

function normalizeRoutePath(prefix: string, routePath: string): string {
    const path = `/${prefix}/${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return path || '/';
}

function isJsonContentType(contentType: string | null): boolean {
    return !contentType || contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function jsonResponse(body: unknown, status: number): globalThis.Response {
    return globalThis.Response.json(body, {
        status,
        headers: { 'cache-control': 'no-store' },
    });
}

export class App {
    private readonly router = new Router<CompiledRoute>();
    private readonly globalMiddlewares: MiddlewareHandler[] = [];
    private readonly bodyLimit: number;
    private bootstrapPromise?: Promise<void>;
    private server?: AppServer;
    private swaggerOptions?: OpenApiOptions;
    private openApiDocument?: OpenApiDocument;
    private controllerFiles: string[] = [];

    constructor(options: AppOptions = {}) {
        this.bodyLimit = options.bodyLimit ?? 1_048_576;
        if (!Number.isSafeInteger(this.bodyLimit) || this.bodyLimit <= 0) {
            throw new Error('bodyLimit must be a positive safe integer');
        }
    }

    /** Loads controllers once. `listen()` waits for this promise before routing traffic. */
    bootstrap(controllersPath = 'src/controllers'): Promise<void> {
        this.bootstrapPromise = scanControllers(controllersPath).then(async (files) => {
            this.controllerFiles = files;
            this.compileRoutes();
            if (this.swaggerOptions) {
                this.openApiDocument = await buildOpenApiDocumentWithTypes(this.swaggerOptions, files);
            }
        });
        return this.bootstrapPromise;
    }

    use(...middlewares: MiddlewareHandler[]): this {
        this.globalMiddlewares.push(...middlewares);
        return this;
    }

    /** Enables automatic OpenAPI JSON and Swagger UI endpoints. */
    swagger(options: OpenApiOptions = {}): this {
        this.swaggerOptions = options;
        this.openApiDocument = undefined;
        if (this.server) this.compileRoutes();
        return this;
    }

    /** Alias for projects that prefer the OpenAPI name. */
    openapi(options: OpenApiOptions = {}): this {
        return this.swagger(options);
    }

    register(controller: any): this {
        registerController(controller);
        this.openApiDocument = undefined;
        this.compileRoutes();
        return this;
    }

    /** Kept for compatibility with the original public helper. */
    matchRoute(requestUrl: string, routePath: string): Record<string, string> | null {
        const probe = new Router<true>();
        probe.register('GET', routePath, true);
        return probe.match('GET', requestUrl)?.params ?? null;
    }

    private compileRoutes(): void {
        this.router.clear();

        for (const controller of getRegisteredControllers()) {
            const constructor = controller.constructor;
            const prefix = Reflect.getMetadata('prefix', constructor) || '';

            for (const definition of getRoutes(constructor)) {
                const params = getParamsMetadata(controller, definition.handler);
                this.router.register(definition.method, normalizeRoutePath(prefix, definition.path), {
                    controller,
                    definition,
                    params,
                    middlewares: getMiddlewares(controller, definition.handler),
                    needsBody: params.some((param) => param.type === 'body'),
                    needsQuery: params.some((param) => param.type === 'query'),
                });
            }
        }

        if (this.swaggerOptions && !this.openApiDocument) {
            this.openApiDocument = buildOpenApiDocument(this.swaggerOptions);
        }
    }

    private async readJsonBody(request: Request): Promise<unknown> {
        const contentLength = Number(request.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > this.bodyLimit) {
            throw new HttpError(413, 'Request body too large');
        }
        if (!isJsonContentType(request.headers.get('content-type'))) {
            throw new HttpError(415, 'Content-Type must be application/json');
        }

        const reader = request.body?.getReader();
        if (!reader) return null;

        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > this.bodyLimit) {
                    await reader.cancel();
                    throw new HttpError(413, 'Request body too large');
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        if (size === 0) return null;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }

        try {
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            throw new HttpError(400, 'Invalid JSON body');
        }
    }

    private async executeMiddlewares(
        middlewares: MiddlewareHandler[],
        request: Request,
        response: ResponseWriter,
        finalHandler: () => Promise<void>
    ): Promise<void> {
        let lastIndex = -1;
        const dispatch = async (index: number): Promise<void> => {
            if (index <= lastIndex) {
                throw new Error('next() called multiple times in the same middleware chain');
            }
            lastIndex = index;
            if (index < middlewares.length) {
                await middlewares[index](request, response, () => dispatch(index + 1));
            } else {
                try {
                    await finalHandler();
                } catch (error) {
                    // Set the status before the middleware stack starts unwinding.
                    response.statusCode = getErrorStatusCode(error);
                    throw error;
                }
            }
        };
        try {
            await dispatch(0);
        } catch (error) {
            // Set the status before middleware `finally` blocks run, so logging
            // middleware reports the actual error status.
            response.statusCode = getErrorStatusCode(error);
            throw error;
        }
    }

    private async toResponse(response: BunResponseWriter, result: unknown): Promise<globalThis.Response> {
        if (result instanceof globalThis.Response) return result;
        if (response.writableEnded) return response.toResponse();
        if (response.statusCode === 204 || response.statusCode === 304) {
            response.removeHeader('content-type');
            response.end();
            return response.toResponse();
        }
        if (result === undefined) {
            response.end();
            return response.toResponse();
        }
        if (typeof result === 'string') {
            if (!response.getHeader('content-type')) response.setHeader('content-type', 'text/plain; charset=utf-8');
            response.end(result);
            return response.toResponse();
        }

        if (!response.getHeader('content-type')) response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(result));
        return response.toResponse();
    }

    private errorResponse(error: unknown): globalThis.Response {
        const statusCode = getErrorStatusCode(error);
        if (statusCode >= 500) console.error('Internal error:', error);
        if (isHttpError(error)) {
            return jsonResponse({
                status: statusCode,
                error: error.message,
                ...(error.code ? { code: error.code } : {}),
                ...(error.details === undefined ? {} : { details: error.details }),
            }, statusCode);
        }
        return jsonResponse({ status: statusCode, error: 'Internal Server Error' }, statusCode);
    }

    private documentationResponse(request: Request): globalThis.Response | null {
        if (!this.swaggerOptions || request.method !== 'GET') return null;
        const pathname = new URL(request.url).pathname;
        const openApiPath = normalizeRoutePath('', this.swaggerOptions.path || '/openapi.json');
        const docsPath = normalizeRoutePath('', this.swaggerOptions.docsPath || '/docs');
        if (pathname === openApiPath) {
            return jsonResponse(
                this.openApiDocument || buildOpenApiDocument(this.swaggerOptions),
                200
            );
        }
        if (this.swaggerOptions.ui !== false && pathname === docsPath) {
            return new globalThis.Response(
                swaggerUiHtml(openApiPath, this.swaggerOptions.title || 'BaguetteJS API'),
                { headers: { 'content-type': 'text/html; charset=utf-8' } }
            );
        }
        return null;
    }

    private async handleRequest(request: Request): Promise<globalThis.Response> {
        const documentation = this.documentationResponse(request);
        if (documentation) return documentation;

        const route = this.router.match(request.method as HttpMethod | undefined, request.url);
        if (!route) return this.errorResponse(new NotFoundError());

        const { controller, definition, params, middlewares, needsBody, needsQuery } = route.handler;
        const response = new BunResponseWriter(definition.status);
        try {
            const body = needsBody ? await this.readJsonBody(request) : null;
            const query = needsQuery
                ? Object.fromEntries(new URL(request.url).searchParams)
                : undefined;
            const args: any[] = [];

            for (const param of params) {
                if (param.type === 'req') args[param.index] = request;
                else if (param.type === 'res') args[param.index] = response;
                else if (param.type === 'body') args[param.index] = body;
                else if (param.type === 'param') args[param.index] = param.name ? route.params[param.name] : route.params;
                else if (param.type === 'query') args[param.index] = param.name ? query?.[param.name] : query;
            }

            let result: unknown;
            await this.executeMiddlewares(
                this.globalMiddlewares.length
                    ? this.globalMiddlewares.concat(middlewares)
                    : middlewares,
                request,
                response,
                async () => {
                    if (!response.writableEnded) result = await controller[definition.handler](...args);
                }
            );
            return this.toResponse(response, result);
        } catch (error) {
            if (response.writableEnded) return response.toResponse();
            response.statusCode = getErrorStatusCode(error);
            return this.errorResponse(error);
        }
    }

    listen(port: number): AppServer {
        if (this.server) throw new Error('App is already listening');
        this.compileRoutes();

        const ready = this.bootstrapPromise;
        const server: AppServer = Bun.serve({
            port,
            fetch: async (request) => {
                try {
                    if (ready) await ready;
                    return await this.handleRequest(request);
                } catch (error) {
                    return this.errorResponse(error);
                }
            },
            error: (error) => this.errorResponse(error),
        });
        this.server = server;
        console.log(`BaguetteJS listening on http://localhost:${server.port}`);
        return server;
    }

    close(): Promise<void> {
        return this.server?.stop() ?? Promise.resolve();
    }
}
