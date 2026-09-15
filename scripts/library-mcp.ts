import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase } from '../server/database.ts';
import { queryGames, querySchema } from '../server/library.ts';

// This process receives only a request snapshot, never the app database or credentials.
const db = openDatabase(process.argv[2], true);
const server = new McpServer({ name: 'nextplay-library', version: '1.0.0' });
server.registerTool(
    'query_games',
    {
        description:
            'Consulta SQLite: todos los juegos elegibles propios, compartidos y descubrimientos. query busca un fragmento literal en nombre/descripción/géneros y etiquetas Steam (name en español y englishName), ignorando mayúsculas y tildes; prueba palabras breves en español e inglés. Filtra por propietario, género, etiqueta exacta en español o inglés (tag), IDs de etiqueta (tagIds; coincide cualquiera de los IDs), modo, horas, favoritos o sin jugar. Las etiquetas de Steam son comunitarias y orientativas, no hechos infalibles. appIds devuelve fichas concretas. Cada página admite como máximo 50 juegos; total y nextOffset permiten paginar hasta el final sin límite total de 60 juegos. Los filtros de la interfaz ya están aplicados y no se pueden ampliar aquí.',
        inputSchema: querySchema.shape,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    },
    async (input) => {
        const result = queryGames(db, input);
        console.error(
            '[nextplay:library] query_games',
            JSON.stringify({
                source: input.source,
                offset: result.offset,
                count: result.games.length,
                total: result.total,
            }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
);
server.server.onclose = () => db.close();
await server.connect(new StdioServerTransport());
