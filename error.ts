export interface HttpErrorOptions {
    code?: string;
    details?: unknown;
}

export class HttpError extends Error {
    readonly code?: string;
    readonly details?: unknown;

    constructor(
        readonly statusCode: number,
        message: string,
        options: HttpErrorOptions = {}
    ) {
        super(message);
        this.name = 'HttpError';
        this.code = options.code;
        this.details = options.details;
    }
}

export class BadRequestError extends HttpError {
    constructor(message = 'Bad Request', options?: HttpErrorOptions) {
        super(400, message, options);
        this.name = 'BadRequestError';
    }
}

export class NotFoundError extends HttpError {
    constructor(message = 'Not Found', options?: HttpErrorOptions) {
        super(404, message, options);
        this.name = 'NotFoundError';
    }
}

export interface ValidationIssue {
    path: string;
    message: string;
    expected?: string;
    received?: string;
}

export class ValidationError extends BadRequestError {
    constructor(issues: ValidationIssue[]) {
        super('Validation failed', {
            code: 'VALIDATION_ERROR',
            details: issues,
        });
        this.name = 'ValidationError';
    }
}

export function isHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError;
}

export function getErrorStatusCode(error: unknown): number {
    const candidate = isHttpError(error)
        ? error.statusCode
        : typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : 500;
    return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}
