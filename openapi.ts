import 'reflect-metadata';
import { getRegisteredControllers } from './registry';
import { getRoutes } from './decorator';
import type { RouteDefinition } from './decorator';
import { getParamsMetadata } from './param';
import type { ParameterMetadata } from './param';

export type OpenApiSchema = Record<string, unknown>;

export interface OpenApiSchemaProvider {
    toOpenApi(): OpenApiSchema;
}

export type OpenApiSchemaInput = OpenApiSchema | OpenApiSchemaProvider;

export interface OpenApiRouteTypeInfo {
    response?: OpenApiSchema;
    body?: OpenApiSchema;
}

export type OpenApiTypeInfo = Record<string, OpenApiRouteTypeInfo>;

export interface OpenApiOptions {
    path?: string;
    docsPath?: string;
    title?: string;
    version?: string;
    description?: string;
    servers?: Array<{ url: string; description?: string }>;
    /** Set to false when only the JSON document should be exposed. */
    ui?: boolean;
}

export interface OpenApiDocument {
    openapi: '3.0.3';
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{ url: string; description?: string }>;
    tags?: Array<{ name: string }>;
    paths: Record<string, OpenApiPathItem>;
}

interface OpenApiPathItem {
    [method: string]: OpenApiOperation;
}

interface OpenApiOperation {
    operationId: string;
    tags: string[];
    summary: string;
    description?: string;
    parameters?: OpenApiParameter[];
    requestBody?: {
        required: boolean;
        content: Record<string, { schema: OpenApiSchema }>;
    };
    responses: Record<string, {
        description: string;
        content?: Record<string, { schema: OpenApiSchema }>;
    }>;
}

interface OpenApiParameter {
    name: string;
    in: 'path' | 'query';
    required: boolean;
    schema: OpenApiSchema;
}

function resolveSchema(schema: OpenApiSchemaInput | undefined): OpenApiSchema | undefined {
    if (!schema) return undefined;
    if ('toOpenApi' in schema && typeof schema.toOpenApi === 'function') return schema.toOpenApi();
    return schema as OpenApiSchema;
}

function normalizePath(path: string): string {
    const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

function openApiPath(path: string): string {
    return normalizePath(path).replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function controllerName(controller: any): string {
    return controller.constructor?.name?.replace(/Controller$/, '') || 'Default';
}

function schemaForType(type: unknown): OpenApiSchema {
    if (type === String) return { type: 'string' };
    if (type === Number) return { type: 'number' };
    if (type === Boolean) return { type: 'boolean' };
    if (type === Array) return { type: 'array', items: { type: 'object' } };
    return { type: 'object' };
}

function statusDescription(status: number): string {
    const descriptions: Record<number, string> = {
        200: 'Success',
        201: 'Created',
        202: 'Accepted',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        500: 'Internal Server Error',
    };
    return descriptions[status] || 'Response';
}

function getParameterTypes(controller: any, handler: string | symbol): unknown[] {
    return Reflect.getMetadata('design:paramtypes', controller, handler) || [];
}

function buildParameters(
    path: string,
    params: ParameterMetadata[],
    parameterTypes: unknown[]
): OpenApiParameter[] {
    const parameters: OpenApiParameter[] = [];
    const known = new Set<string>();
    const add = (parameter: OpenApiParameter): void => {
        const key = `${parameter.in}:${parameter.name}`;
        if (known.has(key)) return;
        known.add(key);
        parameters.push(parameter);
    };

    for (const match of path.matchAll(/:([A-Za-z0-9_]+)/g)) {
        const name = match[1];
        const metadata = params.find((param) => param.type === 'param' && param.name === name);
        add({
            name,
            in: 'path',
            required: true,
            schema: schemaForType(metadata ? parameterTypes[metadata.index] : String),
        });
    }

    for (const metadata of params) {
        if (metadata.type !== 'query' || !metadata.name) continue;
        add({
            name: metadata.name,
            in: 'query',
            required: false,
            schema: schemaForType(parameterTypes[metadata.index]),
        });
    }

    return parameters;
}

function buildOperation(
    controller: any,
    definition: RouteDefinition,
    fullPath: string,
    usedOperationIds: Set<string>,
    typeInfo: OpenApiTypeInfo
): OpenApiOperation {
    const params = getParamsMetadata(controller, definition.handler);
    const parameterTypes = getParameterTypes(controller, definition.handler);
    const tag = controllerName(controller);
    const options = definition.options || {};
    const inferredTypes = typeInfo[`${tag}:${String(definition.handler)}`] || {};
    const baseOperationId = options.operationId || `${definition.method.toLowerCase()}${String(definition.handler)}`;
    let operationId = baseOperationId;
    let suffix = 2;
    while (usedOperationIds.has(operationId)) operationId = `${baseOperationId}${suffix++}`;
    usedOperationIds.add(operationId);

    const parameters = buildParameters(fullPath, params, parameterTypes);
    const operation: OpenApiOperation = {
        operationId,
        tags: options.tags?.length ? options.tags : [tag],
        summary: options.summary || `${definition.method} ${fullPath}`,
        description: options.description,
        responses: {
            [definition.status]: {
                description: statusDescription(definition.status),
                ...(definition.status === 204
                    ? {}
                    : { content: { 'application/json': { schema: { type: 'object' } } } }),
            },
        },
    };
    if (!operation.description) delete operation.description;
    if (parameters.length) operation.parameters = parameters;

    const bodyMetadata = params.find((param) => param.type === 'body');
    if (bodyMetadata || options.body) {
        const body = options.body || {};
        operation.requestBody = {
            required: body.required ?? true,
            content: {
                [body.contentType || 'application/json']: {
                    schema: resolveSchema(body.schema)
                        || inferredTypes.body
                        || schemaForType(bodyMetadata ? parameterTypes[bodyMetadata.index] : Object),
                },
            },
        };
    }

    const responseOptions = options.responses || {};
    const defaultResponse = options.response;
    const responseStatuses = new Set([String(definition.status), ...Object.keys(responseOptions)]);
    operation.responses = {};
    for (const status of responseStatuses) {
        const statusNumber = Number(status);
        const response = responseOptions[status] || (statusNumber === definition.status ? defaultResponse : undefined);
        const contentType = response?.contentType || 'application/json';
        operation.responses[status] = {
            description: response?.description || statusDescription(statusNumber),
                ...(statusNumber === 204
                    ? {}
                    : {
                        content: {
                            [contentType]: {
                                schema: resolveSchema(response?.schema)
                                    || (statusNumber === definition.status ? inferredTypes.response : undefined)
                                    || { type: 'object' },
                            },
                        },
                    }),
        };
    }

    return operation;
}

export function buildOpenApiDocument(
    options: OpenApiOptions = {},
    typeInfo: OpenApiTypeInfo = {}
): OpenApiDocument {
    const document: OpenApiDocument = {
        openapi: '3.0.3',
        info: {
            title: options.title || 'BaguetteJS API',
            version: options.version || '1.0.0',
            description: options.description,
        },
        servers: options.servers,
        paths: {},
    };
    if (!document.info.description) delete document.info.description;
    if (!document.servers?.length) delete document.servers;

    const tags = new Set<string>();
    const usedOperationIds = new Set<string>();
    for (const controller of getRegisteredControllers()) {
        const constructor = controller.constructor;
        const tag = controllerName(controller);
        tags.add(tag);
        const prefix = Reflect.getMetadata('prefix', constructor) || '';

        for (const definition of getRoutes(constructor)) {
            const fullPath = normalizePath(`${prefix}/${definition.path}`);
            const path = openApiPath(fullPath);
            document.paths[path] = {
                ...(document.paths[path] || {}),
                [definition.method.toLowerCase()]: buildOperation(
                    controller,
                    definition,
                    fullPath,
                    usedOperationIds,
                    typeInfo
                ),
            };
        }
    }

    if (tags.size) document.tags = Array.from(tags, (name) => ({ name }));
    return document;
}

export async function buildOpenApiDocumentWithTypes(
    options: OpenApiOptions = {},
    sourceFiles: string[] = []
): Promise<OpenApiDocument> {
    if (!sourceFiles.length) return buildOpenApiDocument(options);

    try {
        const { inferOpenApiTypes } = await import('./openapi-types');
        return buildOpenApiDocument(options, inferOpenApiTypes(sourceFiles));
    } catch (error) {
        console.warn('OpenAPI type inference unavailable; using runtime metadata only.', error);
        return buildOpenApiDocument(options);
    }
}

export function swaggerUiHtml(documentPath: string, title: string): string {
    const safePath = JSON.stringify(documentPath).replace(/</g, '\\u003c');
    const safeTitle = title.replace(/[<&>"']/g, (character) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]!);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
    <script>window.onload = () => SwaggerUIBundle({ url: ${safePath}, dom_id: '#swagger-ui', deepLinking: true });</script>
  </body>
</html>`;
}
