export type Request = globalThis.Request;

export interface ResponseWriter {
    statusCode: number;
    writableEnded: boolean;
    headers: Headers;
    setHeader(name: string, value: string | number | readonly string[]): void;
    getHeader(name: string): string | null;
    removeHeader(name: string): void;
    end(body?: BodyInit | null): void;
}

/** Response facade kept for `@Res()` and existing middleware code. */
export type Response = ResponseWriter;

export type NextFunction = () => Promise<void> | void;

export type MiddlewareHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void> | void;
