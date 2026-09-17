import ts from 'typescript';
import type { OpenApiSchema, OpenApiTypeInfo } from './openapi';

function typeId(type: ts.Type): string {
    return String((type as ts.Type & { id?: number }).id ?? type.symbol?.name ?? 'anonymous');
}

function isUndefined(type: ts.Type): boolean {
    return (type.flags & ts.TypeFlags.Undefined) !== 0;
}

function isNull(type: ts.Type): boolean {
    return (type.flags & ts.TypeFlags.Null) !== 0;
}

function schemaForType(
    checker: ts.TypeChecker,
    type: ts.Type,
    seen: Set<string> = new Set()
): OpenApiSchema {
    if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) return {};
    if (type.flags & ts.TypeFlags.Never || type.flags & ts.TypeFlags.Void) return {};
    if (type.flags & ts.TypeFlags.StringLike) return { type: 'string' };
    if (type.flags & ts.TypeFlags.NumberLike) return { type: 'number' };
    if (type.flags & ts.TypeFlags.BooleanLike) return { type: 'boolean' };
    if (type.flags & ts.TypeFlags.BigIntLike) return { type: 'integer', format: 'int64' };
    if (type.flags & ts.TypeFlags.Null) return { nullable: true };

    if (type.isUnion()) {
        const members = type.types.filter((member) => !isUndefined(member) && !isNull(member));
        const nullable = type.types.some(isNull) || type.types.some(isUndefined);
        if (members.length === 1) {
            return { ...schemaForType(checker, members[0], seen), ...(nullable ? { nullable: true } : {}) };
        }
        return {
            oneOf: members.map((member) => schemaForType(checker, member, seen)),
            ...(nullable ? { nullable: true } : {}),
        };
    }

    if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const elementType = checker.getTypeArguments(type as ts.TypeReference)[0];
        return { type: 'array', items: elementType ? schemaForType(checker, elementType, seen) : {} };
    }

    const symbolName = type.aliasSymbol?.name || type.symbol?.name;
    if (symbolName === 'Date') return { type: 'string', format: 'date-time' };
    if (symbolName === 'Promise' && checker.getTypeArguments(type as ts.TypeReference)[0]) {
        return schemaForType(checker, checker.getTypeArguments(type as ts.TypeReference)[0], seen);
    }

    const id = typeId(type);
    if (seen.has(id)) return { type: 'object' };
    seen.add(id);

    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];
    for (const property of checker.getPropertiesOfType(type)) {
        const declaration = property.valueDeclaration || property.declarations?.[0];
        if (!declaration) continue;
        const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
        properties[property.name] = schemaForType(checker, propertyType, seen);
        if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
    }

    seen.delete(id);
    if (!Object.keys(properties).length) return { type: 'object' };
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
    };
}

function methodName(node: ts.MethodDeclaration): string | undefined {
    return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
}

export function inferOpenApiTypes(sourceFiles: string[]): OpenApiTypeInfo {
    const program = ts.createProgram(sourceFiles, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        skipLibCheck: true,
        noEmit: true,
    });
    const checker = program.getTypeChecker();
    const methods = new Map<string, ts.MethodDeclaration>();

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        ts.forEachChild(sourceFile, (node) => {
            if (!ts.isClassDeclaration(node) || !node.name) return;
            const controllerName = node.name.text.replace(/Controller$/, '');
            for (const member of node.members) {
                if (!ts.isMethodDeclaration(member)) continue;
                const name = methodName(member);
                if (name) methods.set(`${controllerName}:${name}`, member);
            }
        });
    }

    const result: OpenApiTypeInfo = {};
    for (const [key, method] of methods) {
        const signature = checker.getSignatureFromDeclaration(method);
        const routeInfo: { response?: OpenApiSchema; body?: OpenApiSchema } = {};
        if (signature) routeInfo.response = schemaForType(checker, checker.getReturnTypeOfSignature(signature));

        const bodyParameter = method.parameters.find((parameter) =>
            ts.getDecorators(parameter)?.some((decorator) => decorator.getText().startsWith('@Body'))
        );
        if (bodyParameter) routeInfo.body = schemaForType(checker, checker.getTypeAtLocation(bodyParameter));
        result[key] = routeInfo;
    }
    return result;
}
