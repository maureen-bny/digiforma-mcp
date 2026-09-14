# Digiforma MCP Server

Un serveur [MCP](https://modelcontextprotocol.io) qui expose l'API GraphQL de
[Digiforma](https://www.digiforma.com) (apprenants, sessions de formation,
et accès GraphQL générique) à un client compatible MCP (Claude Desktop,
Claude Code, etc.).

> ⚠️ Ce n'est pas un connecteur officiel Digiforma — c'est un serveur MCP
> maison construit sur leur API GraphQL publique.

## Outils exposés

- `digiforma_graphql` — exécute n'importe quelle requête/mutation GraphQL
  (idéal pour tout ce qui n'est pas déjà couvert ci-dessous).
- `digiforma_introspect_schema` — liste les types du schéma GraphQL Digiforma,
  pour explorer ce qui est disponible.
- `digiforma_list_trainees` — liste les apprenants.
- `digiforma_get_trainee` — détail d'un apprenant + ses sessions.
- `digiforma_list_training_sessions` — liste les sessions de formation.

## Prérequis

- Node.js ≥ 18
- Un compte Digiforma avec l'accès API GraphQL activé sur votre plan
  (à vérifier dans les options avancées de votre compte, ou en contactant
  le support Digiforma).
- Un token d'API Digiforma :
  1. Connectez-vous à votre compte Digiforma.
  2. Allez dans la page de configuration de l'API (*Paramètres avancés → API*).
  3. Cliquez sur "Générer un token".
  4. Copiez le token généré — vous ne pourrez le revoir qu'une fois.

Documentation officielle : [GraphQL, l'API Digiforma](https://help.digiforma.com/fr/articles/11439399-graphql-l-api-digiforma)

## Installation

```bash
git clone <URL_DU_DEPOT>
cd digiforma-mcp
npm install
```

## Configuration

Le serveur lit deux variables d'environnement :

| Variable              | Requis | Description                                              |
|-----------------------|--------|------------------------------------------------------------|
| `DIGIFORMA_API_TOKEN` | Oui    | Le token Bearer généré depuis votre compte Digiforma.      |
| `DIGIFORMA_API_URL`   | Non    | Endpoint GraphQL (défaut : `https://app.digiforma.com/api/v1/graphql`). |

### Claude Desktop

Ajoutez ceci à votre fichier `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "digiforma": {
      "command": "node",
      "args": ["/chemin/absolu/vers/digiforma-mcp/src/index.js"],
      "env": {
        "DIGIFORMA_API_TOKEN": "votre_token_ici"
      }
    }
  }
}
```

Puis redémarrez Claude Desktop.

### Claude Code

```bash
claude mcp add digiforma \
  --env DIGIFORMA_API_TOKEN=votre_token_ici \
  -- node /chemin/absolu/vers/digiforma-mcp/src/index.js
```

## Test manuel

```bash
DIGIFORMA_API_TOKEN=votre_token node src/index.js
```

Le serveur communique en stdio selon le protocole MCP ; pour un test rapide
sans client MCP, vous pouvez aussi interroger directement l'API avec `curl` :

```bash
curl -X POST https://app.digiforma.com/api/v1/graphql \
  -H "Authorization: Bearer votre_token" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ trainees { id firstname lastname email } }"}'
```

## Limites connues

Le schéma exact de l'API Digiforma (tous les champs et types disponibles)
n'est pas publiquement documenté dans le détail — utilisez l'outil
`digiforma_introspect_schema` ou l'interface GraphiQL fournie par Digiforma
(`https://app.digiforma.com/api/v1/graphiql`) pour explorer les champs
disponibles et adapter/étendre les requêtes de ce serveur si besoin.

## Licence

MIT
