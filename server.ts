import http from 'http';
import {getRoutes} from "./decorator";

export class App {
    private controllers: any[] = [];

    register(controller: any) {
        this.controllers.push(controller);
    }

    listen(port: number) {
        const server = http.createServer(async (req, res) => {
            const { url, method } = req!;
            for (const Controller of this.controllers) {
                const prefix = Reflect.getMetadata('prefix', Controller.constructor);
                const routes = getRoutes(Controller.constructor);

                for (const route of routes) {
                    if (method === route.method && url === `${prefix}${route.path}`) {
                        const result = await Controller[route.handler](req, res);
                        if (!res.writableEnded) res.end(result);
                        return;
                    }
                }
            }

            res.statusCode = 404;
            res.end('Not Found');
        });

        server.listen(port, () => {
            console.log(`🚀 Server running on http://localhost:${port}`);
        });
    }
}
