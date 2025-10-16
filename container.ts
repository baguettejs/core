import 'reflect-metadata';

export class Container {
    private static instances = new Map<any, any>();

    static resolve<T>(target: new (...args: any[]) => T): T {
        if (!target) {
            throw new Error('❌ Attempt to resolve undefined target');
        }

        if (Container.instances.has(target)) {
            return Container.instances.get(target);
        }

        console.log(`🧩 Resolving: ${target.name}`);

        // Récupère les types des paramètres du constructeur
        const paramTypes: any[] =
            Reflect.getMetadata('design:paramtypes', target) || [];

        // Résout récursivement les dépendances
        const dependencies = paramTypes.map((dep) => {
            if (!dep) {
                throw new Error(`❌ Missing dependency metadata for ${target.name}`);
            }
            console.log(`  ↳ Dependency: ${dep.name}`);
            return Container.resolve(dep);
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
