# 🥖 BaguetteJS

> Le framework TypeScript **léger, croustillant et 100 % français 🇫🇷**

BaguetteJS est un framework backend minimaliste écrit en **TypeScript**, inspiré de NestJS et Spring,  
mais conçu pour être **léger**, **rapide** et **sans dépendances lourdes**.

> 🧠 Un décorateur, un contrôleur, une injection : votre serveur est prêt à lever !

---

## 🚀 Installation

```bash
bun add @baguettejs/core reflect-metadata
```

> ⚠️ Vous devez activer les décorateurs et les métadonnées dans votre `tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

---

## ⚙️ Exemple rapide

```ts
import 'reflect-metadata';
import { App, Controller, Get, Post, Req, Res, Body } from '@baguettejs/core';
import { UserService } from './services/user.service';

@Controller('/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getAll() {
    return this.userService.findAll();
  }

  @Post()
  create(@Body() body: any, @Res() res: any) {
    const user = this.userService.create(body);
    res.statusCode = 201;
    return user;
  }
}

const app = new App();
app.use(async (_req, _res, next) => {
  await next();
});
await app.bootstrap('src/controllers');
app.listen(3000);
```

## 📚 Documentation Swagger automatique

Les routes et les paramètres décorés sont automatiquement exposés en OpenAPI :

```ts
const app = new App().swagger({
  title: 'Users API',
  version: '1.0.0',
});

await app.bootstrap('src/controllers');
app.listen(3000);
```

- `GET /openapi.json` retourne le document OpenAPI 3.0.3 ;
- `GET /docs` affiche Swagger UI ;
- le deuxième argument de `@Get()`, `@Post()`, `@Patch()`, etc. enrichit les informations que TypeScript ne peut pas déduire seul, sans annotation supplémentaire.
- un schéma `v.object(...)` peut servir à la fois pour valider les données et décrire le modèle dans OpenAPI ;
- avec Swagger activé, le core analyse automatiquement les types TypeScript des signatures de contrôleurs (TypeScript doit être disponible dans le projet).

```ts
@Post('/', {
  summary: 'Create a user',
  tags: ['Users'],
  response: { description: 'User created' },
})
create(@Body() body: Omit<User, 'id'>): User {}
```

Le modèle de réponse et le body sont générés à partir des types TypeScript de la signature. Les options `body.schema` et `response.schema` restent disponibles pour les cas particuliers ou les types impossibles à analyser.

### Validation et erreurs HTTP

Le core fournit une validation légère sans dépendance externe :

```ts
import { BadRequestError, NotFoundError, v } from '@baguettejs/core';

const UserInput = v.object({
  name: v.string({ minLength: 2, trim: true }),
  email: v.string({ format: 'email', trim: true, lowercase: true }),
});

const input = UserInput.parse(body); // lance ValidationError si invalide
if (!user) throw new NotFoundError('User not found');
throw new BadRequestError('Invalid request');
```

Les erreurs HTTP sont centralisées par `App` et renvoient un JSON homogène avec `status`, `error`, `code` et `details` si nécessaire.

---

## 🧩 Principes clés

### 1. **Décorateurs de routage**

| Décorateur | Description | Exemple |
|-------------|-------------|----------|
| `@Controller('/users')` | Définit la base du contrôleur | `class UserController {}` |
| `@Get('/profile')` | Route GET | `/users/profile` |
| `@Post()` | Route POST | `/users` |
| `@Put('/:id')` | Route PUT | `/users/:id` |
| `@Delete('/:id')` | Route DELETE | `/users/:id` |

---

### 2. **Injection de dépendances**

```ts
import { Service } from 'baguettejs';

@Service()
export class UserService {
  findAll() {
    return [{ id: 1, name: 'Alice' }];
  }
}
```

> Les dépendances sont injectées automatiquement via le constructeur.

---

### 3. **Décorateurs de paramètres**

| Décorateur | Description |
|-------------|-------------|
| `@Req()` | Objet `req` natif |
| `@Res()` | Objet `res` natif |
| `@Body()` | Corps JSON de la requête |
| `@Param('id')` | Paramètre d’URL |
| `@Query('search')` | Paramètre de query string |

---

## 🧠 Exemple complet

```ts
@Controller('/users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }
}

@Service()
export class UserService {
  private users = [{ id: 1, name: 'Alice' }];

  findOne(id: string) {
    return this.users.find(u => u.id === Number(id));
  }

  create(data: any) {
    const user = { id: Date.now(), ...data };
    this.users.push(user);
    return user;
  }
}
```

---

## 🧱 Structure recommandée

```
src/
 ├── core/
 │   ├── app.ts
 │   ├── container.ts
 │   ├── decorator.ts
 │   └── param.ts
 ├── controllers/
 │   └── user.controller.ts
 ├── services/
 │   └── user.service.ts
 └── main.ts
```

---

## 💡 Pourquoi BaguetteJS ?

- 🥖 **Léger et croustillant** : aucun runtime framework lourd
- 🧩 **Modulaire** : chaque partie est indépendante
- 💉 **Injection de dépendances automatique**
- 🎯 **Basé sur les décorateurs TypeScript**
- 💬 **Lisible, élégant et extensible**

---

## 🧰 Inclus dans le runtime

- [x] Middlewares globaux et par route
- [x] Routage précompilé (lookup direct pour les routes statiques)
- [x] Limite de taille des corps JSON

## 🧰 À venir

- [ ] Gestion d’erreurs personnalisée
- [ ] Guards (auth, rôles, permissions)
- [ ] Validation automatique du `@Body()`
- [ ] Génération SDK client automatique (OpenAPI-like)

---

## 💻 Développement

### Lancer le projet en local

```bash
bun install
bun run dev
```

### Compiler le framework

```bash
bun run build
```

### Publier

```bash
bun publish
```

---

## 📄 Licence

MIT © 2025 — Fait avec ❤️ par **Cyprien Tertrais**
