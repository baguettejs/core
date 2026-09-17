import { ValidationError, type ValidationIssue } from './error';
import type { OpenApiSchema } from './openapi';

type Parser<T> = (value: unknown, path: string, issues: ValidationIssue[]) => T | undefined;

export type InferSchema<T extends Schema<unknown>> = T extends Schema<infer Value> ? Value : never;

export class Schema<T> {
    constructor(
        private readonly parser: Parser<T>,
        private readonly openApiSchema: OpenApiSchema,
        readonly isOptional = false
    ) {}

    _parse(value: unknown, path: string, issues: ValidationIssue[]): T | undefined {
        return this.parser(value, path, issues);
    }

    parse(value: unknown): T {
        const issues: ValidationIssue[] = [];
        const result = this._parse(value, '$', issues);
        if (issues.length) throw new ValidationError(issues);
        return result as T;
    }

    optional(): Schema<T | undefined> {
        return new Schema(
            (value, path, issues) => value === undefined
                ? undefined
                : this._parse(value, path, issues),
            this.openApiSchema,
            true
        );
    }

    toOpenApi(): OpenApiSchema {
        return this.openApiSchema;
    }
}

export interface StringSchemaOptions {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    trim?: boolean;
    lowercase?: boolean;
}

export interface NumberSchemaOptions {
    minimum?: number;
    maximum?: number;
    integer?: boolean;
}

function receivedType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function issue(
    issues: ValidationIssue[],
    path: string,
    message: string,
    expected: string,
    value: unknown
): void {
    issues.push({ path, message, expected, received: receivedType(value) });
}

export function string(options: StringSchemaOptions = {}): Schema<string> {
    const openApiSchema: OpenApiSchema = {
        type: 'string',
        ...(options.minLength === undefined ? {} : { minLength: options.minLength }),
        ...(options.maxLength === undefined ? {} : { maxLength: options.maxLength }),
        ...(options.pattern === undefined ? {} : { pattern: options.pattern }),
        ...(options.format === undefined ? {} : { format: options.format }),
    };

    return new Schema((value, path, issues) => {
        if (typeof value !== 'string') {
            issue(issues, path, 'Expected a string', 'string', value);
            return undefined;
        }

        let result = options.trim ? value.trim() : value;
        if (options.lowercase) result = result.toLowerCase();
        if (options.minLength !== undefined && result.length < options.minLength) {
            issue(issues, path, `Must contain at least ${options.minLength} characters`, 'string', value);
        }
        if (options.maxLength !== undefined && result.length > options.maxLength) {
            issue(issues, path, `Must contain at most ${options.maxLength} characters`, 'string', value);
        }
        if (options.pattern !== undefined && !new RegExp(options.pattern).test(result)) {
            issue(issues, path, 'Has an invalid format', 'string', value);
        }
        if (options.format === 'email' && !/^\S+@\S+\.\S+$/.test(result)) {
            issue(issues, path, 'Must be a valid email', 'email', value);
        }
        return result;
    }, openApiSchema);
}

export function number(options: NumberSchemaOptions = {}): Schema<number> {
    const openApiSchema: OpenApiSchema = {
        type: options.integer ? 'integer' : 'number',
        ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
        ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
    };

    return new Schema((value, path, issues) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            issue(issues, path, 'Expected a finite number', 'number', value);
            return undefined;
        }
        if (options.integer && !Number.isInteger(value)) {
            issue(issues, path, 'Expected an integer', 'integer', value);
        }
        if (options.minimum !== undefined && value < options.minimum) {
            issue(issues, path, `Must be at least ${options.minimum}`, 'number', value);
        }
        if (options.maximum !== undefined && value > options.maximum) {
            issue(issues, path, `Must be at most ${options.maximum}`, 'number', value);
        }
        return value;
    }, openApiSchema);
}

export function boolean(): Schema<boolean> {
    return new Schema((value, path, issues) => {
        if (typeof value !== 'boolean') {
            issue(issues, path, 'Expected a boolean', 'boolean', value);
            return undefined;
        }
        return value;
    }, { type: 'boolean' });
}

export function array<T>(itemSchema: Schema<T>): Schema<T[]> {
    return new Schema((value, path, issues) => {
        if (!Array.isArray(value)) {
            issue(issues, path, 'Expected an array', 'array', value);
            return undefined;
        }
        return value.map((item, index) => itemSchema._parse(item, `${path}[${index}]`, issues)) as T[];
    }, { type: 'array', items: itemSchema.toOpenApi() });
}

export type ObjectShape = Record<string, Schema<unknown>>;
export type ObjectOutput<Shape extends ObjectShape> = {
    [Key in keyof Shape]: InferSchema<Shape[Key]>;
};

export function object<Shape extends ObjectShape>(shape: Shape): Schema<ObjectOutput<Shape>> {
    const properties = Object.fromEntries(
        Object.entries(shape).map(([key, schema]) => [key, schema.toOpenApi()])
    );
    const required = Object.entries(shape)
        .filter(([, schema]) => !schema.isOptional)
        .map(([key]) => key);
    const openApiSchema: OpenApiSchema = {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
    };

    return new Schema((value, path, issues) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            issue(issues, path, 'Expected an object', 'object', value);
            return undefined;
        }

        const input = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const [key, schema] of Object.entries(shape)) {
            const parsed = schema._parse(input[key], `${path}.${key}`, issues);
            if (parsed !== undefined) output[key] = parsed;
        }
        return output as ObjectOutput<Shape>;
    }, openApiSchema);
}

export const coerce = {
    number(options: NumberSchemaOptions = {}): Schema<number> {
        const schema = number(options);
        return new Schema((value, path, issues) => {
            const coerced = typeof value === 'string' && value.trim() ? Number(value) : value;
            return schema._parse(coerced, path, issues);
        }, schema.toOpenApi());
    },
    integer(options: Omit<NumberSchemaOptions, 'integer'> = {}): Schema<number> {
        return coerce.number({ ...options, integer: true });
    },
};

export const v = {
    string,
    number,
    integer: (options: Omit<NumberSchemaOptions, 'integer'> = {}) => number({ ...options, integer: true }),
    boolean,
    array,
    object,
    coerce,
};
