import { prisma } from './lib/db';
async function main() {
  const result = await prisma.call.aggregate({
    where: { source: 'claude_code', model: 'claude-sonnet-4-6' },
    _sum: { inputTokens: true, cacheCreationTokens: true, cacheTokens: true, outputTokens: true },
    _count: { id: true }
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch(console.error);
