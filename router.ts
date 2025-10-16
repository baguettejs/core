import { IncomingMessage, ServerResponse } from 'http';

type HttpMethod = 'GET' | 'POST';
type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;

export class Router {
    private routes: Record<string, Record<HttpMethod, RouteHandler>> = {};

    register(method: HttpMethod, path: string, handler: RouteHandler) {
        if (!this.routes[path]) this.routes[path] = {} as Record<HttpMethod, RouteHandler>;
        this.routes[path][method] = handler;
    }

    handle(req: IncomingMessage, res: ServerResponse) {
        const method = req.method as HttpMethod;
        const url = req.url || '/';

        const route = this.routes[url]?.[method];
        if (route) {
            route(req, res);
        } else {
            res.statusCode = 404;
            res.end(`Route ${method} ${url} not found`);
        }
    }
}
