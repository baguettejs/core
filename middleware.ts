export type Request = any;
export type Response = any;
export type NextFunction = () => Promise<void> | void;

export type MiddlewareHandler = (req: Request, res: Response, next: NextFunction) => any;
