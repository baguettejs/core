import 'reflect-metadata';

export class Container {
    private static instances = new Map<any, any>();

    static resolve<T>(target: new (...args: any[]) => T, resolving: any[] = []): T {
        if (!target) {
            throw new Error('Attempted to resolve an undefined dependency');
        }

        if (Container.instances.has(target)) {
            return Container.instances.get(target);
        }

        if (resolving.includes(target)) {
            const chain = [...resolving, target].map((item) => item.name || '<anonymous>').join(' -> ');
            throw new Error(`Circular dependency detected: ${chain}`);
        }

        const paramTypes: any[] =
            Reflect.getMetadata('design:paramtypes', target) || [];

        const dependencies = paramTypes.map((dep, index) => {
            if (!dep) {
                throw new Error(`Missing dependency metadata for ${target.name} (argument ${index})`);
            }
            if ([Object, Array, Function, String, Number, Boolean].includes(dep)) {
                throw new Error(
                    `Cannot inject ${dep.name} into ${target.name} (argument ${index}). ` +
                    'Use a concrete class as the dependency type.'
                );
            }
            return Container.resolve(dep, [...resolving, target]);
        });
        const instance = new target(...dependencies);
        Container.instances.set(target, instance);

        return instance;
    }

    static get<T>(target: new (...args: any[]) => T): T | undefined {
        return Container.instances.get(target);
    }

    static clear() {
        Container.instances.clear();
    }
}
