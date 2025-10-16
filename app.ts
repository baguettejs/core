import http from 'http';
import { scanControllers } from "@baguettejs/utils";
import { ControllerRegistry } from "./registry";
import {getMiddlewares, getRoutes} from "./decorator";
import { getParamsMetadata } from "./param";
import {MiddlewareHandler} from "./middleware";

export class App {
    bootstrap(controllersPath = 'src/controllers') {
        console.log('🧠 Scanning controllers...');
        scanControllers(controllersPath);
    }

    matchRoute(requestUrl: string, routePath: string) {
        const [path] = requestUrl.split('?');
        const reqParts = path.split('/').filter(Boolean);
        const routeParts = routePath.split('/').filter(Boolean);

        if (reqParts.length !== routeParts.length) return null;

        const params: Record<string, string> = {};

        for (let i = 0; i < routeParts.length; i++) {
            const part = routeParts[i];
            if (part.startsWith(':')) {
                const key = part.slice(1);
                params[key] = decodeURIComponent(reqParts[i]);
            } else if (part !== reqParts[i]) {
                return null;
            }
        }

        return params;
    }

    private async executeMiddlewares(
        middlewares: MiddlewareHandler[],
        req: any,
        res: any,
        finalHandler: () => Promise<void> | void
    ) {
        let index = -1;

        const next = async () => {
            index++;
            if (index < middlewares.length) {
                await middlewares[index](req, res, next);
            } else {
                await finalHandler();
            }
        };

        await next();
    }

    listen(port: number) {
        const server = http.createServer(async (req, res) => {
            try {
                const { url, method } = req!;
                let body: any = null;

                // 🔍 Auto-parsing JSON pour POST, PUT, PATCH
                if (['POST', 'PUT', 'PATCH'].includes(method || '')) {
                    const chunks: Buffer[] = [];
                    for await (const chunk of req) chunks.push(chunk);
                    const rawBody = Buffer.concat(chunks).toString();
                    if (rawBody) {
                        try {
                            body = JSON.parse(rawBody);
                        } catch {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                            return;
                        }
                    }
                }

                for (const controller of ControllerRegistry) {
                    const prefix = Reflect.getMetadata('prefix', controller.constructor);
                    const routes = getRoutes(controller.constructor);

                    for (const route of routes) {
                        const fullPath = (prefix + route.path)
                            .replace(/\/{2,}/g, '/')
                            .replace(/\/$/, '');

                        const matchedParams = this.matchRoute(url || '', fullPath);
                        if (method === route.method && matchedParams) {
                            const query = Object.fromEntries(
                                new URL(req.url!, `http://${req.headers.host}`).searchParams
                            );

                            const paramsMeta = getParamsMetadata(controller, route.handler);
                            const args: any[] = [];

                            for (const { index, type, name } of paramsMeta) {
                                if (type === 'req') args[index] = req;
                                else if (type === 'res') args[index] = res;
                                else if (type === 'body') args[index] = body;
                                else if (type === 'param')
                                    args[index] = name ? matchedParams[name] : matchedParams;
                                else if (type === 'query')
                                    args[index] = name ? query[name] : query;
                            }

                            const middlewares = getMiddlewares(controller, route.handler);

                            await this.executeMiddlewares(middlewares, req, res, async () => {
                                const result = await controller[route.handler](...args);

                                if (res.writableEnded) return;

                                res.statusCode = route.status ?? 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(
                                    typeof result === 'string' ? result : JSON.stringify(result)
                                );
                            });

                            return;
                        }
                    }
                }

                res.statusCode = 404;
                res.end(JSON.stringify({ status: 404, error: 'Not Found' }));
            } catch (err: any) {
                console.error('❌ Internal error:', err.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ status: 500, error: 'Internal Server Error' }));
            }
        });

        server.listen(port, () => {
            console.log(`✅ Server running on http://localhost:${port}`);
        });
    }
}
