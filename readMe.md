# 🥖 BaguetteJS

> Le framework TypeScript **léger, croustillant et 100 % français 🇫🇷**

BaguetteJS est un framework backend minimaliste écrit en **TypeScript**, inspiré de NestJS et Spring,  
mais conçu pour être **léger**, **rapide** et **sans dépendances lourdes**.

> 🧠 Un décorateur, un contrôleur, une injection : votre serveur est prêt à lever !

---

## 🚀 Installation

```bash
npm install baguettejs reflect-metadata
```

> ⚠️ Vous devez activer les décorateurs et les métadonnées dans votre `tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "strict": true
  }
}
```

---

## ⚙️ Exemple rapide

```ts
import 'reflect-metadata';
import { App, Controller, Get, Post, Req, Res, Body } from 'baguettejs';
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
app.bootstrap('src/controllers');
app.listen(3000);
```

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

## 🧰 À venir

- [ ] Middlewares globaux et par route
- [ ] Gestion d’erreurs personnalisée
- [ ] Guards (auth, rôles, permissions)
- [ ] Validation automatique du `@Body()`
- [ ] Génération SDK client automatique (OpenAPI-like)

---

## 💻 Développement

### Lancer le projet en local

```bash
npm install
npm run dev
```

### Compiler le framework

```bash
npm run build
```

### Publier sur npm

```bash
npm login
npm publish --access public
```

---

## 📄 Licence

MIT © 2025 — Fait avec ❤️ par **Cyprien Tertrais**
